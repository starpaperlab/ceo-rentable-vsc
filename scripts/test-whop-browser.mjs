// Real checkout/auth/result pages with isolated transport. Never creates a real account/payment.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL='https://whop-fixture.invalid';
process.env.VITE_SUPABASE_ANON_KEY='isolated-public-test-fixture';
process.env.VITE_GEMINI_API_KEY='';
process.env.VITE_PAYPAL_CLIENT_ID='';
const server=await createServer({server:{host:'127.0.0.1',port:5194,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
const uid='10000000-0000-4000-8000-000000000001';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),user_metadata:{full_name:'Ana Prueba',business_name:'Negocio fixture'}};
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture-signature`;
const session={access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const profile={id:uid,email:user.email,full_name:'Ana Prueba',business_name:'Negocio fixture',phone:'8090000000',role:'user',plan:'free',has_access:false,access_status:'pending_payment',onboarding_completed:true};
const errors=[];
async function fixture({signedIn=false,existingEmail=false,confirmation=false,mobile=false}={}) {
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
 if(signedIn)await context.addInitScript(session=>localStorage.setItem('ceo-rentable-os-auth',JSON.stringify(session)),session);
 let signups=0,checkouts=[],statusChecks=0,confirmed=false;
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.hostname==='whop-fixture.invalid') {
   if(url.pathname==='/auth/v1/signup') {signups++;if(existingEmail)return json({code:'user_already_exists',msg:'User already registered'},422);return json(confirmation?{...user,identities:[{id:'fixture'}]}:session);}
   if(url.pathname==='/auth/v1/user')return json(user);
   if(url.pathname==='/rest/v1/users')return json(req.headers().accept?.includes('object')?profile:[profile]);
   return json([]);
  }
  if(url.hostname==='127.0.0.1') {
   if(url.pathname==='/api/whop/create-checkout') {checkouts.push(req.postDataJSON());return json({url:'https://whop.com/checkout/ch_isolated'});}
   if(url.pathname==='/api/whop/status') {statusChecks++;return json({access:confirmed,trialActive:confirmed,status:confirmed?'trialing':'pending',planCode:'annual',trialEnd:new Date(Date.now()+10*86400000).toISOString()});}
   if(url.pathname.startsWith('/api/'))return json({success:false});
   return route.continue();
  }
  if(url.hostname==='whop.com')return route.fulfill({contentType:'text/html',body:'<h1>Whop aislado</h1>'});
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 return {context,page,get signups(){return signups},checkouts,get statusChecks(){return statusChecks},confirm(){confirmed=true}};
}
const base='http://127.0.0.1:5194';
async function fillRegistration(page) {
 await page.getByLabel('Nombre',{exact:true}).fill('Ana');await page.getByLabel('Apellido',{exact:true}).fill('Prueba');
 await page.getByLabel('Correo electrónico',{exact:true}).fill(user.email);
 await page.getByLabel('Nombre de la empresa o marca',{exact:true}).fill('Negocio fixture');
 await page.getByLabel('Contraseña',{exact:true}).fill('Fixture-only-123');await page.getByLabel('Confirmar contraseña',{exact:true}).fill('Fixture-only-123');
 await page.getByRole('checkbox').first().check();
}
try {
 for(const [plan,mobile] of [['monthly',false],['annual',true]]) {
  const f=await fixture({mobile});await f.page.goto(`${base}/checkout?plan=${plan}`);
  const pay=f.page.getByRole('button',{name:'Continuar al pago seguro con Whop',exact:true});
  await pay.waitFor();assert.equal(await pay.isEnabled(),true);
  assert.equal(await f.page.getByText(/PayPal/).count(),0);assert.equal(await f.page.getByText(/Founder|Fundador/i).count(),0);
  await pay.click();await f.page.getByRole('alert').waitFor();assert.equal(f.checkouts.length,0);
  await fillRegistration(f.page);
  await f.page.getByRole('button',{name:'Crear cuenta y continuar con Whop',exact:true}).click();
  await f.page.waitForURL('https://whop.com/checkout/ch_isolated');
  assert.equal(f.signups,1);assert.equal(f.checkouts.length,1);assert.equal(f.checkouts[0].planCode,plan);assert.equal(f.checkouts[0].marketingAccepted,false);
  await f.context.close();
 }
 const signed=await fixture({signedIn:true,mobile:true});await signed.page.goto(base+'/checkout?plan=monthly');
 await signed.page.getByText('Tu cuenta ya existe.',{exact:true}).waitFor();
 assert.equal(await signed.page.getByLabel('Contraseña',{exact:true}).count(),0);
 assert.equal(await signed.page.getByLabel('Correo electrónico',{exact:true}).inputValue(),user.email);
 await signed.page.getByLabel('Nombre de la empresa o marca',{exact:true}).fill('Empresa actualizada');
 await signed.page.getByRole('checkbox').first().check();
 assert.equal(await signed.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 const accessChecks=await signed.page.evaluate(async()=>{
  const {hasActiveAccess}=await import('/src/hooks/useAuth.js');
  const p={role:'user',plan:'subscription',has_access:true,access_status:'active',payment_provider:'whop'};
  return [hasActiveAccess({...p,whop_access_until:new Date(Date.now()+86400000).toISOString()}),hasActiveAccess({...p,whop_access_until:'2020-01-01'}),hasActiveAccess({...p,has_access:false,whop_access_until:new Date(Date.now()+86400000).toISOString()})];
 });
 assert.deepEqual(accessChecks,[true,false,false]);
 await signed.page.screenshot({path:'/tmp/whop-checkout-mobile.png',fullPage:true});

 await signed.page.getByRole('button',{name:'Continuar al pago seguro con Whop',exact:true}).click();
 await signed.page.waitForURL('https://whop.com/checkout/ch_isolated');assert.equal(signed.signups,0);assert.equal(signed.checkouts[0].businessName,'Empresa actualizada');await signed.context.close();
 const duplicate=await fixture({existingEmail:true});await duplicate.page.goto(base+'/checkout?plan=annual');await fillRegistration(duplicate.page);
 await duplicate.page.getByRole('button',{name:'Crear cuenta y continuar con Whop',exact:true}).click();await duplicate.page.getByRole('alert').waitFor();
 assert.equal(duplicate.checkouts.length,0);assert.match(duplicate.page.url(),/plan=annual/);await duplicate.context.close();
 const confirm=await fixture({confirmation:true});await confirm.page.goto(base+'/checkout?plan=monthly');await fillRegistration(confirm.page);
 await confirm.page.getByRole('button',{name:'Crear cuenta y continuar con Whop',exact:true}).click();await confirm.page.getByText(/Revisa tu correo para confirmar/).waitFor();
 await confirm.page.getByRole('button',{name:'Confirma tu correo o inicia sesión para continuar',exact:true}).click();
 assert.equal(confirm.signups,1);assert.equal(confirm.checkouts.length,0);await confirm.context.close();
 const result=await fixture({signedIn:true});await result.page.goto(base+'/payment-success?provider=whop&plan=annual&trial_days=999&subscription_id=FORGED');
 await result.page.getByRole('heading',{name:'Verificando tu suscripción',exact:true}).waitFor();
 assert.equal(await result.page.getByRole('link',{name:'Entrar al dashboard',exact:true}).count(),0);
 result.confirm();await result.page.getByRole('button',{name:'Volver a verificar',exact:true}).click();
 await result.page.getByRole('heading',{name:'Tu prueba gratuita está activa',exact:true}).waitFor();
 assert.equal(await result.page.getByRole('link',{name:'Entrar al dashboard',exact:true}).getAttribute('href'),'/Dashboard');
 assert.ok(result.statusChecks>=2);assert.equal(await result.page.getByText(/999/).count(),0);
 await result.page.goto(base+'/payment-cancel?plan=annual');assert.equal(await result.page.getByRole('link',{name:'Intentar de nuevo',exact:true}).getAttribute('href'),'/checkout?plan=annual');await result.context.close();
 assert.deepEqual(errors,[]);
 console.log('Whop browser passed: monthly/annual registration, existing session/business update, duplicate email, confirmation gate, optional marketing, pending/confirmed result, forged return, cancellation retry, mobile width, no public PayPal/Founder. All provider transport isolated.');
} finally {await browser.close();await server.close();}
