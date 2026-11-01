// Explicit provisioning command. Needs securely injected WHOP_API_KEY and VERCEL_TOKEN.
// Creates a disabled endpoint and sends its secret directly to the EXISTING Vercel project.
// Never writes secret files or prints provider responses. No accounts, subscriptions or charges.
import { whopClient, WHOP_EVENTS, WHOP_API_VERSION, APP_ORIGIN } from '../server/whop.js';
if(!process.argv.includes('--apply')) {
  console.error('Use --apply only when access to the existing Whop account and Vercel project is configured.');process.exit(1);
}
let created=false;
try {
  if(!process.env.VERCEL_TOKEN)throw new Error('VERCEL_ACCESS_REQUIRED');
  const suffix=process.env.VERCEL_TEAM_ID?`?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}`:'';
  async function vercel(path,body) {
    const r=await fetch(`https://api.vercel.com${path}${suffix}${body?(suffix?'&':'?')+'upsert=true':''}`,{
      method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok)throw new Error('VERCEL_REQUEST_FAILED');return r.json();
  }
  const project=await vercel('/v9/projects/ceo-rentable-vsc');
  if(project.name!=='ceo-rentable-vsc')throw new Error('VERCEL_PROJECT_MISMATCH');
  const whop=whopClient();
  const hooks=await whop.webhooks.list();
  for await(const hook of hooks) {
    if(hook.url===`${APP_ORIGIN}/api/whop/webhook`)throw new Error('WEBHOOK_EXISTS_USE_DASHBOARD_SECRET');
  }
  const hook=await whop.webhooks.create({url:`${APP_ORIGIN}/api/whop/webhook`,events:WHOP_EVENTS,
    api_version_date:WHOP_API_VERSION,enabled:false,child_resource_events:false,title:'CEO Rentable production'});
  created=true;
  if(!hook.webhook_secret)throw new Error('WEBHOOK_SECRET_MISSING');
  for(const [key,value] of [['WHOP_WEBHOOK_SECRET',hook.webhook_secret],['WHOP_WEBHOOK_ID',hook.id],['WHOP_CHECKOUT_ENABLED','false']]) {
    await vercel(`/v10/projects/${encodeURIComponent(project.id)}/env`,{key,value,type:'encrypted',target:['production']});
  }
  console.log(`Webhook ${hook.id} created DISABLED. Secret and ID securely saved to ceo-rentable-vsc production. Checkout remains disabled.`);
  console.log('Apply the reviewed migration, deploy the validated branch with checkout disabled, enable the webhook, then run the preflight and a provider sandbox delivery. Enable checkout and merge only after account activation is verified.');
} catch(error) {
  const allowed=['VERCEL_ACCESS_REQUIRED','VERCEL_REQUEST_FAILED','VERCEL_PROJECT_MISMATCH','WEBHOOK_EXISTS_USE_DASHBOARD_SECRET','WEBHOOK_SECRET_MISSING','WHOP_NOT_CONFIGURED'];
  console.error(allowed.includes(error.message)?error.message:'WEBHOOK_CONFIGURATION_FAILED');
  if(created)console.error('A disabled webhook was created. Recover its signing secret securely from Whop dashboard before retrying; do not create a duplicate.');
  process.exitCode=1;
}
