import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import https from 'node:https';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {lanAddresses} from '../server/access.mjs';
const directory=mkdtempSync(path.resolve('artifacts/trust-browser-')),file=path.join(directory,'test.sqlite'),tlsDirectory=path.join(directory,'tls'),host=lanAddresses()[0]?.address;
assert.ok(host,'A private LAN interface is required for this isolated phone-access check');
async function freePort(address){const server=net.createServer();await new Promise(r=>server.listen(0,address,r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
const port=await freePort('127.0.0.1'),tlsPort=await freePort(host),bootstrapPort=await freePort(host),store=new Store(file);store.set('sharing',{host,port:tlsPort,bootstrapPort,enabled:false});store.close();
const root=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['server/index.mjs'],{windowsHide:true,env:{...process.env,PORT:String(port),SEISMO_DB:file,SEISMO_TLS_DIR:tlsDirectory,SEISMO_TEST_MODE:'1'},stdio:['ignore','pipe','pipe']}),engines=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),reports=[];
let stderr='';child.stderr.on('data',b=>stderr+=b);
const status=async()=>await(await fetch(root+'/api/sharing/status')).json();
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Isolated server startup timed out: '+stderr)),15000);child.stdout.on('data',data=>{if(String(data).includes('SeismoSphere running')){clearTimeout(timer);resolve();}});child.once('error',reject);});
 for(const engine of ['chromium','webkit']){const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})});try{for(const [width,height] of [[1366,900],[320,740],[390,844],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const open=async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#phone-rotate-prepare').waitFor({state:'attached'});await page.locator('.phone-trust summary').click();};
  await page.goto(root);await open();
  if(!(await status()).certificate){await page.locator('#phone-prepare').click();await page.waitForFunction(()=>!document.querySelector('#phone-enable').disabled);}
  const old=(await status()).certificate.rootFingerprint;
  await page.locator('#phone-rotate-prepare').click();await page.locator('#phone-rotation-ack').waitFor();assert.equal(await page.locator('#phone-rotate-activate').isDisabled(),true);assert.equal((await status()).certificate.rootFingerprint,old);
  if(width===1366){await page.locator('#phone-rotate-cancel').click();await page.locator('#phone-rotation-ack').waitFor({state:'detached'});assert.equal((await status()).certificate.rootFingerprint,old);await page.locator('#phone-rotate-prepare').click();await page.locator('#phone-rotation-ack').waitFor();}
  const pending=(await status()).pendingRotation;
  if(width===390){await page.reload();await open();await page.locator('#phone-rotation-ack').waitFor();assert.equal((await status()).pendingRotation.id,pending.id);}
  await page.locator('#phone-rotation-review').scrollIntoViewIfNeeded();
  const layout=await page.locator('.phone-trust').evaluate(el=>({document:document.documentElement.scrollWidth,viewport:innerWidth,width:el.clientWidth,scroll:el.scrollWidth,targets:[...el.querySelectorAll('button,input')].filter(e=>e.getBoundingClientRect().height).map(e=>(e.type==='checkbox'?e.closest('label'):e).getBoundingClientRect().height)}));assert.ok(layout.document<=width+1,JSON.stringify(layout));assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));assert.ok(layout.targets.every(h=>h>=44),JSON.stringify(layout));
  await page.screenshot({path:`artifacts/${engine}-trust-review-${width}.png`});
  await page.locator('#phone-rotation-ack').check();const result=page.waitForResponse(r=>r.url().endsWith('/api/sharing/activate-rotation'));await page.locator('#phone-rotate-activate').click();const response=await result;assert.equal(response.status(),200,await response.text());await page.locator('#phone-rotation-ack').waitFor({state:'detached'});const activated=await status();assert.equal(activated.certificate.rootFingerprint,pending.certificate.rootFingerprint);assert.equal(activated.enabled,false);assert.equal(activated.sessions.length,0);
  assert.match(await page.locator('#phone-retired-trust').innerText(),/Remove the old/);await page.locator('#phone-enable').click();await page.locator('#phone-status').filter({hasText:'Phone access is running'}).waitFor();assert.equal(await page.locator('#phone-rotate-prepare').isDisabled(),true);
  const ca=readFileSync(path.join(tlsDirectory,'generations',activated.certificateGeneration,'root.pem'));
  await new Promise((resolve,reject)=>{https.get(`https://${host}:${tlsPort}/api/access`,{ca,agent:false},res=>{assert.equal(res.statusCode,200);res.resume();res.on('end',resolve);}).on('error',reject);});
  await page.locator('#phone-disable').click();await page.locator('#phone-status').filter({hasText:'Phone access is off'}).waitFor();assert.deepEqual(errors,[]);reports.push({engine,width,height,reviewBeforeActivation:true,cancelPreservesTrust:width===1366,reloadPreservesReview:width===390,realTLSValidation:true,isolatedInstallation:true,layout,errors});await page.close();
 }}finally{await browser.close();}}
 writeFileSync('artifacts/trust-rotation-browser-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
