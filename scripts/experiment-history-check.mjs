import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {clickGlobeControl} from './browser-controls.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=mkdtempSync('artifacts/routes-acceptance-'),db=dir+'/test.sqlite',store=new Store(db),now=Date.now(),config=JSON.parse(readFileSync('config/default.json'));store.set('config',{...config,aiProvider:'deterministic'});store.set('feed',{status:'live',fetchedAt:now,generated:now,url:'fixture://route-editor'});store.ingest([-10,10].map((lon,i)=>({id:'USGS:route-fixture-'+i,sourceId:'route-fixture-'+i,provider:'USGS',time:now-10000,updated:now-10000,lat:0,lon,depth:500,mag:5.5,magType:'mw',type:'earthquake',status:'reviewed',place:'Software acceptance fixture'})),now-1000);for(let i=0;i<51;i++)store.saveExperiment('fixture-'+i,{experimentId:'fixture-'+i,start:now-(60+i)*86400000,end:now-(50+i)*86400000,createdAt:now-i,config,summary:[{engine:'DS',hits:i,forecasts:100,precision:i/100}],method:'Controlled software fixture',limitations:['Not scientific evidence']});store.close();
const port=46318,base='http://127.0.0.1:'+port,child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),SEISMO_TEST_MODE:'1',SEISMO_DB:db,SEISMO_TLS_DIR:dir+'/tls'},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(logs)),15000);child.stdout.on('data',b=>{if(String(b).includes('SeismoSphere running')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/refresh',r=>r.fulfill({json:{status:'live'}}));await page.goto(base);await page.locator('#ledger-count').waitFor({state:'attached'});
  if(width<1024)await page.locator('[data-mobile=research]').click();else await page.locator('[data-view=research]').click();
  await page.locator('#experiment-history-status').filter({hasText:'51 saved'}).waitFor();
  await page.locator('#experiment-primary').selectOption('fixture-0');await page.locator('#experiment-comparison').selectOption('fixture-50');
  const text=await page.locator('#experiment-comparison-result').innerText();assert.match(text,/0 \/ 100/);assert.match(text,/50 \/ 100/);
  const pending=page.waitForEvent('download');await page.locator('#experiment-summary-export').click();const download=await pending;const file=dir+'/comparison-'+width+'.json';await download.saveAs(file);const saved=JSON.parse(readFileSync(file));assert.deepEqual(saved.experiments.map(r=>r.experimentId),['fixture-0','fixture-50']);assert.match(saved.scope,/summaries/);
  assert.equal(await page.locator('#research-dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1),false);assert.deepEqual(errors,[]);console.log(JSON.stringify({width,runs:51,comparisonExport:true,errors}));await page.close();
 }
}finally{await browser?.close();child.kill();if(child.exitCode===null)await once(child,'exit');}
