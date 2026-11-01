// Read-only operational gate. Never prints keys or provider response bodies.
import { APP_ORIGIN, WHOP_EVENTS, WHOP_PLANS, assertPlan, assertWebhook, serviceClient, whopClient } from '../server/whop.js';
try {
  const whop=whopClient(),service=serviceClient();
  const {data,error}=await service.rpc('whop_checkout_ready');
  if(error||data!==true)throw new Error('WHOP_DATABASE_NOT_READY');
  const hook=await assertWebhook(whop,process.env);
  for(const [code,plan] of Object.entries(WHOP_PLANS)) {
    const variant=await whop.variants.retrieve({id:plan.id});assertPlan(variant,code);
    if(variant.account?.id!==hook.resource_id)throw new Error('WHOP_ACCOUNT_MISMATCH');
    console.log(`${code}: verified plan, USD price, billing interval and 10-day trial`);
  }
  // An unsigned request must fail closed. This never starts a checkout or payment.
  const result=await fetch(`${APP_ORIGIN}/api/whop/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(result.status!==401)throw new Error('DEPLOYED_WEBHOOK_NOT_READY');
  console.log(`Database activation RPC, webhook registration/version and unsigned rejection verified. ${WHOP_EVENTS.length} lifecycle events configured.`);
  console.log('Still required: a provider-originated sandbox webhook and activation check before enabling production checkout. This command creates no payment.');
} catch(error) {
  const allowed=['WHOP_NOT_CONFIGURED','DATABASE_NOT_CONFIGURED','WHOP_DATABASE_NOT_READY','WHOP_WEBHOOK_NOT_CONFIGURED','WHOP_WEBHOOK_NOT_READY','WHOP_ACCOUNT_MISMATCH','WHOP_PLAN_CONFIGURATION_MISMATCH','DEPLOYED_WEBHOOK_NOT_READY'];
  console.error(allowed.includes(error.message)?error.message:'WHOP_PREFLIGHT_FAILED: check service access/scopes without printing secret values');
  process.exitCode=1;
}
