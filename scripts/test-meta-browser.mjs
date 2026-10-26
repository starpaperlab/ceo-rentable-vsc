// Real application pages, isolated provider transport. No live Meta events, accounts or purchases.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {captureDiagnostic} from '../server/commercialJourney.js';
process.env.VITE_SUPABASE_URL='https://tracking-fixture.invalid';
process.env.VITE_SUPABASE_ANON_KEY='isolated-public-browser-fixture';
process.env.VITE_GEMINI_API_KEY='';
process.env.VITE_PAYPAL_CLIENT_ID='';
process.env.VITE_COMMERCIAL_JOURNEY_ENABLED='true';
const server=await createServer({server:{host:'127.0.0.1',port:5193,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const context=await browser.newContext();
let sdkLoads=0,leadAttempts=0,failLead=true;const errors=[],captureRequests=[];
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.hostname==='127.0.0.1'&&url.pathname==='/api/diagnostic'){
  leadAttempts++;const input=request.postDataJSON();captureRequests.push(input);
  if(failLead)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'No pudimos guardar tu diagnóstico. Inténtalo de nuevo.'})});
  const result=await captureDiagnostic(input,{env:{COMMERCIAL_JOURNEY_ENABLED:'true',VERCEL_ENV:'preview'},client:{rpc:async(_name,args)=>({error:null,data:{result:args.p_result,email_status:'prepared_test'}})}});
  return route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});
 }
 if(url.hostname==='127.0.0.1'&&url.pathname.startsWith('/api/commercial-'))return route.fulfill({status:200,contentType:'application/json',body:'{"accepted":true}'});
 if(url.hostname==='127.0.0.1')return route.continue();
 if(url.hostname==='connect.facebook.net'&&url.pathname.endsWith('/fbevents.js')){
  sdkLoads++;return route.fulfill({contentType:'text/javascript',body:`window.__metaCalls=window.__metaCalls||[];const f=window.fbq;f.callMethod=(...a)=>window.__metaCalls.push(a);f.queue.splice(0).forEach(a=>f.callMethod(...a));`});
 }
 if(url.hostname==='tracking-fixture.invalid'){
  if(url.pathname==='/rest/v1/leads'&&request.method()==='POST'){
   leadAttempts++;return route.fulfill({status:failLead?500:201,contentType:'application/json',body:failLead?JSON.stringify({message:'Isolated failure'}):'[]',headers:{'access-control-allow-origin':'*'}});
  }
  return route.fulfill({status:200,contentType:'application/json',body:'[]',headers:{'access-control-allow-origin':'*'}});
 }
 return route.abort(); // No real PayPal, Meta beacons, Supabase, email or AI traffic.
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const base='http://127.0.0.1:5193';
const calls=()=>page.evaluate(()=>window.__metaCalls||[]);
const count=async name=>(await calls()).filter(c=>['trackSingle','trackSingleCustom'].includes(c[0])&&c[2]===name).length;
const spa=async path=>{await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await page.waitForTimeout(200);};
try {
 await page.goto(base+'/checkout?plan=annual');
 await page.getByRole('heading',{name:/Empieza tus/}).waitFor();
 assert.equal(sdkLoads,0);assert.equal(await count('PageView'),0);
 await page.getByRole('button',{name:'Solo necesarias',exact:true}).click();
 assert.equal(sdkLoads,0);
 await page.getByRole('button',{name:'Preferencias de cookies',exact:true}).click();
 await page.getByRole('button',{name:'Permitir medición publicitaria',exact:true}).click();
 await page.waitForFunction(()=>window.__metaCalls?.some(c=>c[2]==='InitiateCheckout'));
 assert.equal(sdkLoads,1);assert.equal(await count('PageView'),1);assert.equal(await count('InitiateCheckout'),1);
 await page.evaluate(async()=>{const m=await import('/src/lib/metaPixel.js');m.initializeMetaPixel();m.initializeMetaPixel();m.trackPageView();});
 assert.equal(sdkLoads,1);assert.equal((await calls()).filter(c=>c[0]==='init').length,1);assert.equal(await count('PageView'),1);
 await spa('/register');await page.getByRole('heading',{name:/CEO Rentable|Bienvenid|Crear|Iniciar|cuenta/i}).first().waitFor();
 assert.ok(await count('PageView')>=2);assert.equal(await count('CompleteRegistration'),0);assert.equal(await count('StartTrial'),0);assert.equal(await count('Purchase'),0);
 const beforeDiagnostic=await count('PageView');
 await spa('/diagnostico?utm_source=facebook&utm_medium=paid_social&utm_campaign=fixture-campaign');await page.getByText('Pregunta 1 de 8',{exact:true}).waitFor();
 assert.equal(await count('PageView'),beforeDiagnostic+1);assert.equal(await count('Lead'),0);
 for(let q=1;q<=8;q++){
  await page.getByText(`Pregunta ${q} de 8`,{exact:true}).waitFor();
  await page.locator('.space-y-3.mt-4 button').first().click();
  if(q<8)await page.getByText(`Pregunta ${q+1} de 8`,{exact:true}).waitFor();
 }
 await page.getByPlaceholder('Tu nombre').fill('Prueba local');await page.getByPlaceholder('Tu email').fill('fixture@example.invalid');
 await page.getByRole('button',{name:/Desbloquear mi diagnóstico/}).click();
 await page.getByRole('alert').filter({hasText:'No pudimos guardar'}).waitFor();assert.equal(await count('Lead'),0);
 failLead=false;await page.getByRole('button',{name:/Desbloquear mi diagnóstico/}).click();
 await page.waitForFunction(()=>window.__metaCalls.some(c=>c[2]==='Lead'));assert.equal(await count('Lead'),1);assert.equal(leadAttempts,2);assert.equal(captureRequests[0].capture_id,captureRequests[1].capture_id);assert.equal(captureRequests[1].attribution.utm_campaign,'fixture-campaign');assert.equal(captureRequests[1].promotional_consent,false);await page.getByText('Diagnóstico de prueba guardado; correo preparado sin enviar.',{exact:true}).waitFor();
 await spa('/payment-success?provider=paypal&order_id=FORGED-TEST&plan=monthly');
 await page.getByText('No pudimos validar tu sesión. Inicia sesión nuevamente para continuar.',{exact:true}).waitFor();
 assert.equal(await count('Purchase'),0);assert.equal(await count('StartTrial'),0);
 await page.evaluate(async()=>{
  const m=await import('/src/lib/metaPixel.js');
  m.trackVerifiedPurchase({success:true,status:'pending',captureId:'MOCK',amount:17.99,currency:'USD'});
  m.trackVerifiedPurchase({success:true,status:'completed',amount:17.99,currency:'USD'});
  m.trackPurchase('monthly','URL-ONLY',{value:17.99,currency:'USD'});
  m.trackStartTrial({subscriptionId:'URL-ONLY'});
 });
 assert.equal(await count('Purchase'),0);assert.equal(await count('StartTrial'),0);
 await page.evaluate(async()=>{
  const m=await import('/src/lib/metaPixel.js');
  const receipt={success:true,status:'completed',captureId:'MOCK-CAPTURE',amount:'17.99',currency:'USD',planCode:'monthly'};
  m.trackVerifiedPurchase(receipt);m.trackVerifiedPurchase(receipt);
  const trial={trialActivated:true,subscriptionId:'MOCK-SUB',eventId:'StartTrial:paypal:MOCK-SUB',planCode:'monthly'};
  m.trackStartTrial(trial);m.trackStartTrial(trial);
  const event=m.buildConversionApiEvent('Purchase',{value:17.99,currency:'USD'},{eventId:'Purchase:paypal:MOCK-CAPTURE'});
  window.__capiFixture=event; // Builder only; never sent to Meta.
 });
 assert.equal(await count('Purchase'),1);assert.equal(await count('StartTrial'),1);
 const purchase=(await calls()).find(c=>c[2]==='Purchase');assert.equal(purchase[3].value,17.99);assert.equal(purchase[3].currency,'USD');assert.equal(purchase[4].eventID,'Purchase:paypal:MOCK-CAPTURE');
 assert.equal(await page.evaluate(()=>window.__capiFixture.event_id),purchase[4].eventID);
 await page.getByRole('button',{name:'Preferencias de cookies',exact:true}).click();await page.getByRole('button',{name:'Solo necesarias',exact:true}).click();
 const before=await count('PageView');await spa('/checkout?plan=monthly');assert.equal(await count('PageView'),before);
 assert.ok((await calls()).some(c=>c[0]==='consent'&&c[1]==='revoke'));
 // Previously emitted conversions stay deduplicated after a page reload.
 await page.goto(base+'/checkout?plan=monthly');assert.equal(await count('PageView'),0);
 await page.getByRole('button',{name:'Preferencias de cookies',exact:true}).click();
 await page.getByRole('button',{name:'Permitir medición publicitaria',exact:true}).click();
 await page.waitForFunction(()=>window.__metaCalls?.some(c=>c[2]==='PageView'));
 await page.evaluate(async()=>{const m=await import('/src/lib/metaPixel.js');m.trackVerifiedPurchase({success:true,status:'completed',captureId:'MOCK-CAPTURE',amount:'17.99',currency:'USD',planCode:'monthly'});});
 assert.equal(await count('Purchase'),0);
 assert.deepEqual(errors,[]);
 console.log('Browser passed: real checkout/register/diagnostic routes; consent/revocation; one SDK/init; SPA PageView; direct InitiateCheckout; failed/successful diagnostic; verified-receipt guards; dedup eventID. Meta and payment transport isolated.');
} finally {await browser.close();await server.close();}
