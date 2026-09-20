import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,X509Certificate} from 'node:crypto';
import https from 'node:https';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const post=async(endpoint,body)=>{const r=await fetch('http://127.0.0.1:4318/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw Error(b.error);return b;};
const ownerBrowser=await chromium.launch({channel:'chrome',headless:true}),owner=await ownerBrowser.newPage({viewport:{width:1280,height:900}}),errors=[];
owner.on('pageerror',e=>errors.push(e.message));let phoneBrowser;
try{
  await owner.goto('http://127.0.0.1:4318');await owner.locator('.event-row').first().waitFor();
  await owner.getByRole('button',{name:'Settings',exact:true}).click();
  const initial=await(await fetch('http://127.0.0.1:4318/api/sharing/status')).json();
  if(!initial.enabled){await owner.locator('#phone-prepare').click();await owner.locator('#phone-enable').waitFor({state:'visible'});await owner.waitForFunction(()=>!document.querySelector('#phone-enable').disabled);await owner.locator('#phone-enable').click();}
  await owner.locator('#phone-status').filter({hasText:'Phone access is running'}).waitFor();
  await owner.locator('#phone-connect').scrollIntoViewIfNeeded();await owner.screenshot({path:'artifacts/phone-access-settings.png'});
  const sharing=await(await fetch('http://127.0.0.1:4318/api/sharing/status')).json();
  const directory=sharing.certificateGeneration?'data/private/tls/generations/'+sharing.certificateGeneration:'data/private/tls';
  const ca=readFileSync(directory+'/root.pem'),certificate=new X509Certificate(readFileSync(directory+'/server-chain.pem'));
  await new Promise((resolve,reject)=>{https.get(sharing.url+'/api/access',{ca},res=>{assert.equal(res.statusCode,200);res.resume();res.on('end',resolve);}).on('error',reject);});
  const pin=createHash('sha256').update(certificate.publicKey.export({type:'spki',format:'der'})).digest('base64');
  phoneBrowser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-certificate-errors-spki-list='+pin]});
  const context=await phoneBrowser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),phone=await context.newPage();phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(sharing.url);await phone.locator('#pair-form').waitFor();await phone.screenshot({path:'artifacts/phone-pairing.png'});
  const invite=await post('sharing/invite',{role:'controller'});
  await phone.locator('#device-name').fill('Browser phone check');await phone.locator('#pair-code').fill(invite.code);await phone.locator('#pair-form button').click();await phone.locator('.event-row').first().waitFor({timeout:30000,state:'attached'});
  const controllerStatus=await phone.evaluate(async()=>{const r=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({catalogProvider:'USGS'})});return r.status;});assert.equal(controllerStatus,200);
  await phone.screenshot({path:'artifacts/phone-encrypted-workspace.png'});
  await phone.getByRole('button',{name:'Settings',exact:true}).click();await phone.locator('#device-logout').waitFor();assert.equal(await phone.locator('#phone-prepare').count(),0);await phone.locator('#device-logout').click();await phone.locator('#pair-form').waitFor();
  const viewer=await post('sharing/invite',{role:'viewer'});await phone.locator('#device-name').fill('Browser viewer check');await phone.locator('#pair-code').fill(viewer.code);await phone.locator('#pair-form button').click();await phone.locator('.event-row').first().waitFor({state:'attached'});
  const viewerStatus=await phone.evaluate(async()=>{const r=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({radiusKm:600})});return r.status;});assert.equal(viewerStatus,403);
  const cookie=(await context.cookies()).map(c=>c.name+'='+c.value).join('; ');
  const devices=await(await fetch('http://127.0.0.1:4318/api/sharing/status')).json();for(const s of devices.sessions.filter(s=>s.name.startsWith('Browser ')))await post('sharing/revoke',{id:s.id});
  const revokedStatus=await new Promise((resolve,reject)=>{https.get(sharing.url+'/api/events',{ca,headers:{Cookie:cookie}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(revokedStatus,401);
  assert.deepEqual(errors,[]);writeFileSync('artifacts/phone-access-report.json',JSON.stringify({tlsChainValidated:true,browserCertificatePinned:true,controllerStatus,viewerStatus,revokedStatus,errors,physicalPhoneTest:false},null,2));
  console.log(JSON.stringify({tlsChainValidated:true,controllerStatus,viewerStatus,revokedStatus,errors,physicalPhoneTest:false}));
}finally{
  const devices=await(await fetch('http://127.0.0.1:4318/api/sharing/status')).json();for(const s of devices.sessions.filter(s=>s.name.startsWith('Browser ')))await post('sharing/revoke',{id:s.id});
  await phoneBrowser?.close();await ownerBrowser.close();
}
