import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {waveformSummary} from '../server/instruments.mjs';
import {waveformPaths} from '../public/waveform-geometry.js';
import {clickGlobeControl} from './browser-controls.mjs';
const root='http://127.0.0.1:4318',engines=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const api=async(path,body)=>{const r=await fetch(root+'/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
let capture;const reports=[];
if(process.argv.includes('--saved'))capture=JSON.parse(readFileSync('artifacts/seedlink-capture.json','utf8')).record;else{
assert.equal((await api('station-stream')).active,false,'An existing user stream must not be replaced');
const browser=await engines.chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});await page.goto(root);await page.locator('.event-row').first().waitFor({state:'attached'});await clickGlobeControl(page,'instruments-open');
 await page.locator('#stations-form [name="networks"]').fill('IU');await page.locator('#stations-form [name="channel"]').fill('BHZ');await page.locator('#stations-form [name="at"]').fill(new Date(Date.now()-1000).toISOString().slice(0,19));
 const query=page.waitForResponse(r=>r.url().endsWith('/api/stations-query'),{timeout:60000});await page.locator('#stations-form button').click();const stations=await(await query).json();assert.ok(stations.channels,JSON.stringify(stations));writeFileSync('artifacts/seedlink-stations.json',JSON.stringify(stations));
 await page.locator('#station-search').fill('IU.ANMO.00');await page.locator('.station-row').click();await page.locator('#stream-start').click();
 const until=Date.now()+90000;let status;while(Date.now()<until){status=await api('station-stream');if(status.samples>=1200)break;await new Promise(resolve=>setTimeout(resolve,2000));}assert.ok(status.samples>=1200,JSON.stringify(status));assert.equal(status.state,'receiving');
 await page.locator('#stream-preview svg').waitFor();await page.locator('[aria-label="Close stations and waveforms"]').click();assert.equal((await api('station-stream')).active,true,'Closing the dialog must not stop host acquisition');await clickGlobeControl(page,'instruments-open');
 const saving=page.waitForResponse(r=>r.url().endsWith('/api/station-stream-capture'));await page.locator('#stream-capture').click();capture=await(await saving).json();assert.ok(capture.id,JSON.stringify(capture));await page.locator('#waveform-result svg').waitFor();assert.equal(await page.locator('#waveform-result').getAttribute('data-record-id'),capture.id);
 await page.locator('#stream-stop').click();for(let i=0;i<30&&(await api('station-stream')).state!=='stopped';i++)await new Promise(resolve=>setTimeout(resolve,200));assert.equal((await api('station-stream')).active,false);
 writeFileSync('artifacts/seedlink-capture.json',JSON.stringify(await api('instrument-export?id='+capture.id),null,2));console.log(JSON.stringify({captured:capture.id,samples:capture.summary.samples,segments:capture.summary.segments}));
}finally{await browser.close();await api('station-stream-stop',{});}
}
for(const engine of ['chromium','webkit']){const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})});try{for(const [width,height]of [[1366,900],[320,740],[390,844],[844,390]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));if(process.argv.includes('--saved')&&!(await api('station-stream')).packets){await page.route('**/api/station-stream?preview=1',async route=>{const response=await route.fetch(),base=await response.json();await route.fulfill({response,json:{...base,channel:capture.station,samples:capture.summary.samples,packets:capture.summary.segments,lastReceipt:capture.receipt.fetchedAt,receiptAgeSeconds:(Date.now()-capture.receipt.fetchedAt)/1000,sourceAgeSeconds:(Date.now()-capture.query.end)/1000,preview:{startUs:capture.query.start*1000,endUs:capture.query.end*1000,summary:waveformSummary(capture.segments),paths:waveformPaths(capture.segments,capture.query.start*1000,capture.query.end*1000,700)}}});});}await page.goto(root);await page.locator('.event-row').first().waitFor({state:'attached'});await clickGlobeControl(page,'instruments-open');await page.locator(`#waveform-history option[value="${capture.id}"]`).waitFor({state:'attached'});await page.locator('#waveform-history').selectOption(capture.id);await page.locator('#waveform-result svg').waitFor();assert.equal(await page.locator('#waveform-result').getAttribute('data-record-id'),capture.id);await page.locator('#stream-preview svg').waitFor();
 await page.locator('#station-stream').scrollIntoViewIfNeeded();const layout=await page.locator('#instruments-dialog').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,buttons:[...el.querySelectorAll('#station-stream button')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))}));assert.ok(layout.scroll<=layout.client+1,JSON.stringify(layout));assert.ok(layout.buttons.every(b=>b.width>=44&&b.height>=44));await page.screenshot({path:`artifacts/${engine}-seedlink-${width}.png`});
 if(width===1366){const pending=page.waitForEvent('download');await page.locator('#waveform-result a[href$="raw=1"]').click();const file=`artifacts/${engine}-seedlink.seedlink`;await(await pending).saveAs(file);const raw=readFileSync(file);assert.equal(createHash('sha256').update(raw).digest('hex'),capture.receipt.sha256);assert.equal(raw.length,capture.summary.segments*520);assert.deepEqual(raw,Buffer.from(capture.raw,'base64'));
  await page.locator('#waveform-join').uncheck();await page.locator('#spectrum-form button').click();await page.locator('#spectrum-result svg').waitFor();const id=await page.locator('#spectrum-history').inputValue();const exported=await api('instrument-export?id='+id);assert.equal(exported.integrity.sourceValid,true);assert.equal(exported.source.id,capture.id);writeFileSync(`artifacts/${engine}-seedlink-spectrum.json`,JSON.stringify(exported,null,2));
 }
 assert.deepEqual(errors,[]);reports.push({engine,width,height,layout,captureId:capture.id,errors});await page.close();
 }}finally{await browser.close();}}
writeFileSync('artifacts/seedlink-browser-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
