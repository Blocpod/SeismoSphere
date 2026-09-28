import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {clickGlobeControl} from './browser-controls.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=mkdtempSync('artifacts/routes-acceptance-'),db=dir+'/test.sqlite',store=new Store(db),now=Date.now(),config=JSON.parse(readFileSync('config/default.json'));store.set('config',{...config,aiProvider:'deterministic'});store.set('feed',{status:'live',fetchedAt:now,generated:now,url:'fixture://route-editor'});store.ingest([-10,10].map((lon,i)=>({id:'USGS:route-fixture-'+i,sourceId:'route-fixture-'+i,provider:'USGS',time:now-20*86400000,updated:now-20*86400000,lat:0,lon,depth:500,mag:5.5,magType:'mw',type:'earthquake',status:'reviewed',place:'Software acceptance fixture'})),now-1000);store.set('coverage',[{provider:'USGS',start:now-40*86400000,end:now,minMagnitude:-3}]);store.close();
const port=46318,base='http://127.0.0.1:'+port,child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),SEISMO_TEST_MODE:'1',SEISMO_DB:db,SEISMO_TLS_DIR:dir+'/tls'},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(logs)),15000);child.stdout.on('data',b=>{if(String(b).includes('SeismoSphere running')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({channel:'chrome',headless:true});let originalCount;
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/refresh',r=>r.fulfill({json:{status:'live'}}));await page.goto(base);
  await page.locator('#ledger-count').waitFor({state:'attached'});
  if(width<1024)await page.locator('[data-mobile=research]').click();else await page.locator('[data-view=research]').click();
  const form=page.locator('#backtest-form');await form.locator('[name=start]').fill(new Date(now-19*86400000).toISOString().slice(0,10));await form.locator('[name=end]').fill(new Date(now-8*86400000).toISOString().slice(0,10));await form.locator('[name=region]').selectOption('rectangle');
  for(const [k,v] of Object.entries({south:-20,north:20,west:-20,east:20}))await form.locator('[name='+k+']').fill(String(v));
  const response=page.waitForResponse(r=>r.url()===base+'/api/backtest');await form.locator('button').click();const result=await(await response).json();assert.ok(result.forecastIds?.length,JSON.stringify(result));assert.equal(result.targetBounds.west,-20);
  await page.locator('#backtest-result').filter({hasText:'regional recent events'}).waitFor();assert.equal(await page.locator('#research-dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1),false);
  const ledger=await(await fetch(base+'/api/ledger')).json();assert.ok(ledger.integrity.valid);if(originalCount!==undefined)assert.equal(ledger.integrity.count,originalCount);originalCount=ledger.integrity.count;
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,forecasts:result.forecastIds.length,reused:!!result.reused,bounds:result.targetBounds,errors}));await page.close();
 }
}finally{await browser?.close();child.kill();if(child.exitCode===null)await once(child,'exit');}
