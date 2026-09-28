import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {clickGlobeControl} from './browser-controls.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=mkdtempSync('artifacts/routes-acceptance-'),db=dir+'/test.sqlite',store=new Store(db),now=Date.now(),config=JSON.parse(readFileSync('config/default.json'));store.set('config',{...config,aiProvider:'deterministic'});store.set('feed',{status:'live',fetchedAt:now,generated:now,url:'fixture://route-editor'});store.ingest([-10,10].map((lon,i)=>({id:'USGS:route-fixture-'+i,sourceId:'route-fixture-'+i,provider:'USGS',time:now-10000,updated:now-10000,lat:0,lon,depth:500,mag:5.5,magType:'mw',type:'earthquake',status:'reviewed',place:'Software acceptance fixture'})),now-1000);store.close();
const port=46318,base='http://127.0.0.1:'+port,child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),SEISMO_TEST_MODE:'1',SEISMO_DB:db,SEISMO_TLS_DIR:dir+'/tls'},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
let browser;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(logs)),15000);child.stdout.on('data',b=>{if(String(b).includes('SeismoSphere running')){clearTimeout(timeout);resolve();}});});
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/refresh',r=>r.fulfill({json:{status:'live'}}));
  await page.goto(base);await page.locator('.event-row').first().waitFor({state:'attached'});
  await page.locator('#settings-open').click();await page.locator('[name=midpointMode]').selectOption(width===1366?'route':'great-circle');
  await page.locator('#settings-form button[type=submit]').click();await page.locator('#settings-result').filter({hasText:'Configuration saved'}).waitFor();
  const status=await(await fetch(base+'/api/status')).json();assert.equal(status.config.midpointMode,width===1366?'route':'great-circle');
  assert.equal(await page.locator('#settings-dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1),false);
  await page.reload();await page.locator('.event-row').first().waitFor({state:'attached'});await page.locator('#settings-open').click();assert.equal(await page.locator('[name=midpointMode]').inputValue(),status.config.midpointMode);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,midpointMode:status.config.midpointMode,persisted:true,errors}));await page.close();
 }
 assert.equal((await(await fetch(base+'/api/ledger')).json()).integrity.count,0);
}finally{await browser?.close();child.kill();if(child.exitCode===null)await once(child,'exit');}
