import {RouteHistory} from '../server/routes.mjs';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=mkdtempSync('artifacts/calibration-acceptance-'),db=dir+'/test.sqlite',store=new Store(db),now=Date.now(),config=JSON.parse(readFileSync('config/default.json'));store.set('config',{...config,windowDays:7,radiusKm:100,aiProvider:'deterministic'});store.set('feed',{status:'live',fetchedAt:now,generated:now});store.ingest(Array.from({length:80},(_,i)=>({id:'USGS:cal'+i,provider:'USGS',type:'earthquake',lat:0,lon:i%2?0:10,mag:5,magType:'mw',depth:350,time:now-(81-i)*86400000})),now);new RouteHistory(store,{captureKm:100,maxHops:3,routes:[{id:'r',name:'Test',points:[0,5,10,15].map(lon=>({lat:0,lon})),direction:'forward',kind:'research-corridor',termination:false,provenance:{status:'illustrative'}}]});store.set('coverage',[{provider:'USGS',start:now-100*86400000,end:now,minMagnitude:-3}]);store.close();
const port=46318,base='http://127.0.0.1:'+port,child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),SEISMO_TEST_MODE:'1',SEISMO_DB:db,SEISMO_TLS_DIR:dir+'/tls'},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(logs)),15000);child.stdout.on('data',b=>{if(String(b).includes('SeismoSphere running')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/refresh',r=>r.fulfill({json:{status:'live'}}));await page.goto(base);await page.locator('#ledger-count').waitFor({state:'attached'});
  if(width<1024)await page.locator('[data-mobile=research]').click();else await page.locator('[data-view=research]').click();
  const form=page.locator('#calibration-form');for(const [name,days] of [['start',71],['trainEnd',36],['end',1]])await form.locator('[name='+name+']').fill(new Date(now-days*86400000).toISOString().slice(0,10));
  const response=page.waitForResponse(r=>r.url()===base+'/api/calibrate-depth');await form.locator('button').click();const r=await(await response).json();assert.ok(r.id,JSON.stringify(r));await page.locator('#calibration-result').filter({hasText:'Selected deep threshold'}).waitFor();
  const evidence=await(await fetch(base+'/api/calibration-export?id='+r.id)).json();assert.equal(evidence.id,r.id);writeFileSync(dir+'/calibration.json',JSON.stringify(evidence));const reproduced=JSON.parse(execFileSync(process.execPath,['scripts/reproduce-calibration.mjs',dir+'/calibration.json'],{encoding:'utf8',windowsHide:true}));assert.equal(reproduced.identical,true);assert.ok(evidence.snapshot.events.length);assert.ok(evidence.implementation['server/calibration.mjs']);assert.equal(evidence.report.selectedConfig.triggerDepth,r.report.selectedConfig.triggerDepth);
  assert.equal(await page.locator('#research-dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1),false);assert.deepEqual(errors,[]);assert.equal((await(await fetch(base+'/api/ledger')).json()).integrity.count,0);assert.equal((await(await fetch(base+'/api/status')).json()).config.triggerDepth,config.triggerDepth);
  console.log(JSON.stringify({width,selected:r.report.selectedConfig.triggerDepth,reused:!!r.reused,evidence:true,canonicalUnchanged:true,errors}));await page.close();
 }
}finally{await browser?.close();child.kill();if(child.exitCode===null)await once(child,'exit');}
