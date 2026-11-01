import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { WHOP_API_VERSION, WHOP_EVENTS, WHOP_PLANS, assertPlan } from '../server/whop.js';
import { createWhopCheckout } from '../server/whopCheckout.js';
import { handleWhopWebhook, membershipSnapshot } from '../server/whopWebhook.js';
import { whopStatus } from '../server/whopStatus.js';

const key = 'ws_test_only_never_a_real_secret';
const now = new Date().toISOString();
const future = new Date(Date.now() + 10 * 86400000).toISOString();
const userId = randomUUID(), intentId = randomUUID();
const membership = { id: 'mem_test', account: { id: 'biz_ceo' }, user_id: 'user_buyer', variant_id: WHOP_PLANS.monthly.id,
  metadata: { ceo_checkout_intent: intentId }, created_at: now, updated_at: now,
  status: 'trialing', current_period_start: now, current_period_end: future, cancel_at_period_end: false, canceled_at: null };
function signed(event, timestamp = Math.floor(Date.now()/1000)) {
  const raw = JSON.stringify(event), id = event.id;
  const sig = createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return { raw, headers: { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${sig}` } };
}
const event = (type = 'membership.activated', id = randomUUID()) => ({ id, type, timestamp: now, api_version_date: WHOP_API_VERSION, account_id: 'biz_ceo', data: { id: membership.id } });
const env = { WHOP_WEBHOOK_SECRET: key, WHOP_WEBHOOK_ID: 'hook_test', WHOP_CHECKOUT_ENABLED: 'true' };
const variant = code => ({ id: WHOP_PLANS[code].id, account: { id:'biz_ceo' }, currency:'usd', renewal_price:WHOP_PLANS[code].amount,
  initial_price:0,trial_period_days:10,billing_period:WHOP_PLANS[code].period,billing_type:'renewal',release_method:'buy_now' });

// Model the API boundary without replacing signature verification or application decisions.
function checkoutFixture() {
  const records = [], creates = [];
  const service = {
    auth: { getUser: async () => ({ data: { user: { id: userId, email_confirmed_at: now } } }) },
    rpc: async () => ({data:true,error:null}),
    from: table => ({
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: { id:userId, has_access:false }, error:null }),
      insert: async data => { records.push({table,...data}); return {error:null}; },
      update: () => ({ eq: async () => ({error:null}) }),
    }),
  };
  const whop = {
    variants: { retrieve: async ({id}) => variant(id === WHOP_PLANS.monthly.id ? 'monthly':'annual') },
    webhooks: { retrieve: async () => ({enabled:true,api_version:'v1',url:'https://app.ceorentable.com/api/whop/webhook',api_version_date:WHOP_API_VERSION,
      resource_id:'biz_ceo',events:WHOP_EVENTS,child_resource_events:false}) },
    checkoutConfigurations: { create: async input => { creates.push(input); return { id:'ch_test',variant:{id:input.variant_id},metadata:input.metadata,purchase_url:'https://whop.com/checkout/ch_test' }; } },
  };
  return {service,whop,records,creates};
}
const body = {planCode:'monthly',termsAccepted:true,marketingAccepted:false,businessName:'Negocio',phone:'',country:'DO'};
test('Monthly/annual use authenticated server intents; marketing is optional; no direct unbound links', async () => {
  for (const planCode of ['monthly','annual']) {
    const f=checkoutFixture(); const result=await createWhopCheckout({...body,planCode,user_id:'attacker'}, {...f,env,headers:{authorization:'Bearer fixture'}});
    assert.equal(result.status,200);assert.match(result.body.url,/^https:\/\/whop.com\/checkout\//);
    assert.equal(f.records[0].user_id,userId);assert.equal(f.records[0].marketing_accepted,false);
    assert.equal(f.creates[0].variant_id,WHOP_PLANS[planCode].id);
    assert.equal(f.creates[0].metadata.ceo_checkout_intent,f.records[0].id);
    assert.match(f.creates[0].redirect_url,new RegExp(`provider=whop&plan=${planCode}$`));
  }
});
test('Missing consent/session/confirmation/schema/webhook/plan prevents creating a payable checkout',async()=>{
  const f=checkoutFixture();
  assert.equal((await createWhopCheckout({...body,termsAccepted:false},{...f,env})).status,400);
  assert.equal((await createWhopCheckout(body,{...f,env,headers:{}})).status,401);
  assert.equal((await createWhopCheckout({...body,planCode:'founder_lifetime'},{...f,env})).status,400);
  for(const fault of ['flag','migration','webhook','plan','unconfirmed','existingAccess']) {
    const f=checkoutFixture();const config={...env};
    if(fault==='flag')config.WHOP_CHECKOUT_ENABLED='false';
    if(fault==='migration')f.service.rpc=async()=>({error:{code:'42883'}});
    if(fault==='webhook')f.whop.webhooks.retrieve=async()=>({enabled:false});
    if(fault==='plan')f.whop.variants.retrieve=async()=>({...variant('monthly'),trial_period_days:0});
    if(fault==='unconfirmed')f.service.auth.getUser=async()=>({data:{user:{id:userId}}});
    if(fault==='existingAccess')f.service.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:userId,has_access:true}})});
    const r=await createWhopCheckout(body,{...f,env:config,headers:{authorization:'Bearer fixture'}});
    assert.ok(r.status>=400,fault);assert.equal(f.creates.length,0,fault);
  }
  assert.throws(()=>assertPlan({...variant('annual'),renewal_price:17.99},'annual'));
});
test('Official signatures reject altered bytes, unsigned requests and expired replay timestamps',async()=>{
  const e=event(); const s=signed(e);
  assert.equal((await handleWhopWebhook(s.raw,{env,headers:{}})).status,401);
  assert.equal((await handleWhopWebhook(s.raw+' ',{env,headers:s.headers})).status,401);
  const expired=signed(e,Math.floor(Date.now()/1000)-600);
  assert.equal((await handleWhopWebhook(expired.raw,{env,headers:expired.headers})).status,401);
});
test('Fresh provider state handles trial, renewal, failed payment, cancellation, expiry and refunds',async()=>{
  for(const [type,status,access] of [
    ['membership.activated','trialing',true],['payment.succeeded','active',true],
    ['payment.failed','past_due',true],['membership.updated','canceling',true],
    ['membership.deactivated','canceled',false],['membership.deactivated','expired',false],
    ['refund.updated','canceled',false],
  ]) {
    const e=event(type); if(type.startsWith('refund.'))e.data.payment_id='pay_test';
    const s=signed(e); let snapshot;
    const result=await handleWhopWebhook(s.raw,{env,headers:s.headers,
      service:{rpc:async(_name,args)=>{snapshot=args.p_snapshot;return {data:{status:'processed'}};}},
      whop:{memberships:{retrieve:async()=>({...membership,status})},payments:{retrieve:async()=>({membership_id:membership.id})}}});
    assert.equal(result.status,200,type);assert.equal(snapshot.access,access,type);
    if(status==='trialing')assert.equal(snapshot.trial_end,future);
  }
  assert.equal(membershipSnapshot({...membership,current_period_end:'2020-01-01T00:00:00Z'}).access,false);
  const s=signed(event());
  assert.equal((await handleWhopWebhook(s.raw,{env,headers:s.headers,service:{rpc:async()=>({error:{}})},whop:{memberships:{retrieve:async()=>membership}}})).status,503);
});
test('Cross-account, unmatched metadata and unsupported plans never activate users',async()=>{
  for(const changed of [{account:{id:'biz_other'}},{metadata:{}},{variant_id:'plan_other'}]) {
    let calls=0;const s=signed(event());const r=await handleWhopWebhook(s.raw,{env,headers:s.headers,
      service:{rpc:async()=>{calls++;return {}}},whop:{memberships:{retrieve:async()=>({...membership,...changed})}}});
    assert.equal(calls,0);assert.ok([200,400].includes(r.status));
  }
});
test('Status is scoped to verified session and database dates; URL values cannot grant a trial',async()=>{
  let query=[];
  const sub={status:'trialing',plan_code:'annual',provider_subscription_id:'mem_test',payment_provider:'whop',current_period_end:future,trial_end:future};
  const profile={has_access:true,payment_provider:'whop',whop_access_until:future};
  const service={auth:{getUser:async()=>({data:{user:{id:userId}}})},from:table=>({select(){return this},eq(k,v){query.push([k,v]);return this},maybeSingle:async()=>({data:table==='users'?profile:sub})})};
  assert.equal((await whopStatus({service,headers:{authorization:'Bearer fixture'}})).body.trialActive,true);
  profile.whop_access_until='2020-01-01';
  assert.equal((await whopStatus({service,headers:{authorization:'Bearer fixture'}})).body.access,false);
  assert.ok(query.some(([k,v])=>k==='user_id'&&v===userId));
  assert.equal((await whopStatus({service,headers:{}})).status,401);
});

test('Real PostgreSQL migration: atomic activation, duplicates, rollback, stale events and RLS',async(t)=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table users(id uuid primary key,has_access boolean default false,access_status text,plan text,payment_provider text,
        access_source text,provider_customer_id text,is_lifetime boolean,updated_at timestamptz,
        constraint users_access_source_check check(access_source in ('self_signup','paypal')));
      create function handle_user_profile_defaults() returns trigger language plpgsql as $$ begin return new;end $$;
      create table subscriptions(user_id uuid primary key references users(id),plan text,plan_code text,status text,
        is_lifetime boolean,access_source text,payment_provider text,provider_customer_id text,provider_subscription_id text,
        current_period_start timestamptz,current_period_end timestamptz,cancel_at_period_end boolean,canceled_at timestamptz,
        metadata jsonb default '{}',updated_at timestamptz,
        constraint subscriptions_status_check check(status in ('active','trialing','canceled','past_due','expired','incomplete')),
        constraint subscriptions_access_source_check check(access_source in ('self_signup','paypal')));`);
    const sql=await readFile(new URL('../supabase/migrations/202611010001_whop_checkout_activation.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    await db.query('insert into users(id) values($1)',[userId]);
    await db.query(`insert into whop_checkout_intents(id,user_id,plan_code,whop_plan_id,whop_account_id,terms_accepted_at,country)
      values($1,$2,'monthly',$3,'biz_ceo',now(),'DO')`,[intentId,userId,WHOP_PLANS.monthly.id]);
    const apply=async(id,snapshot=membershipSnapshot(membership),intent=intentId)=>db.query('select apply_whop_membership($1,$2,$3,$4) result',[id,'membership.updated',intent,snapshot]);
    await t.test('Trial activates canonical subscription and account together',async()=>{
      await apply('trial');const u=(await db.query('select * from users')).rows[0],s=(await db.query('select * from subscriptions')).rows[0];
      assert.equal(u.has_access,true);assert.equal(u.plan,'subscription');assert.equal(u.payment_provider,'whop');
      assert.equal(s.status,'trialing');assert.equal(s.provider_customer_id,'user_buyer');assert.ok(s.trial_end);
    });
    await t.test('Duplicate and stale events cannot change current access',async()=>{
      assert.equal((await apply('trial')).rows[0].result.status,'duplicate');
      const renewal=membershipSnapshot({...membership,status:'active',updated_at:new Date(Date.now()+1000).toISOString()});
      await apply('renewal',renewal);await apply('old-trial');
      assert.equal((await db.query('select status from subscriptions')).rows[0].status,'active');
      assert.ok((await db.query('select trial_end from subscriptions')).rows[0].trial_end);
    });
    await t.test('Mismatch rolls back event receipt so delivery can retry',async()=>{
      await assert.rejects(()=>apply('mismatch',{...membershipSnapshot(membership),plan_id:'plan_fake'}));
      assert.equal((await db.query("select * from whop_webhook_events where event_id='mismatch'")).rows.length,0);
    });
    await t.test('Failed payment preserves the paid period; cancellation/expiry revoke; renewal restores',async()=>{
      for(const [providerStatus,status,access] of [['past_due','payment_failed',true],['canceling','cancelled',true],['canceled','cancelled',false],['active','active',true],['expired','expired',false]]) {
        await apply(randomUUID(),membershipSnapshot({...membership,status:providerStatus,updated_at:new Date(Date.now()+2000).toISOString()}));
        assert.equal((await db.query('select has_access from users')).rows[0].has_access,access);
        assert.equal((await db.query('select status from subscriptions')).rows[0].status,status);
      }
    });
    await t.test('A failure after subscription write rolls back access and the event receipt',async()=>{
      await db.exec("alter table users add constraint fail_activation check (has_access=false)");
      await assert.rejects(()=>apply('atomic-failure',membershipSnapshot({...membership,status:'active',updated_at:new Date(Date.now()+3000).toISOString()})));
      assert.equal((await db.query("select * from whop_webhook_events where event_id='atomic-failure'")).rows.length,0);
      assert.equal((await db.query('select status from subscriptions')).rows[0].status,'expired');
      await db.exec('alter table users drop constraint fail_activation');
    });
    await t.test('An old membership cancellation cannot revoke a newer valid subscription',async()=>{
      const nextIntent=randomUUID();
      await db.query(`insert into whop_checkout_intents(id,user_id,plan_code,whop_plan_id,whop_account_id,terms_accepted_at,country)
        values($1,$2,'annual',$3,'biz_ceo',now(),'DO')`,[nextIntent,userId,WHOP_PLANS.annual.id]);
      await apply('new-membership',membershipSnapshot({...membership,id:'mem_new',variant_id:WHOP_PLANS.annual.id,status:'active',updated_at:new Date(Date.now()+5000).toISOString()}),nextIntent);
      await apply('old-expiration',membershipSnapshot({...membership,status:'expired',updated_at:new Date(Date.now()+6000).toISOString()}));
      assert.equal((await db.query('select has_access from users')).rows[0].has_access,true);
      assert.equal((await db.query('select provider_subscription_id from subscriptions')).rows[0].provider_subscription_id,'mem_new');
    });
    await t.test('Browser roles cannot write/read billing intents or invoke activation',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(()=>apply('forged'));
        await assert.rejects(()=>db.query('select * from whop_checkout_intents'));
        await assert.rejects(()=>db.query('select * from whop_memberships'));
        await assert.rejects(()=>db.query("insert into whop_webhook_events values('forged','x','mem_forged',now())"));
        await db.exec('reset role');
      }
      await db.exec('grant select,insert,update,delete on subscriptions to authenticated');
      await db.exec('set role authenticated');
      await assert.rejects(()=>db.query("update subscriptions set status='active'"));
      await assert.rejects(()=>db.query('delete from subscriptions'));
      await db.exec('reset role');
    });
  } finally { await db.close(); }
});
