import {createRequire} from 'node:module';
import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),engines=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),root='http://127.0.0.1:4318',reports=[];
let job=(await(await fetch(root+'/api/import-jobs')).json()).jobs.find(j=>j.options.start===Date.UTC(2000,0,1)&&j.options.end===Date.UTC(2026,0,1)&&j.options.minMagnitude===5&&j.options.provider==='USGS'&&j.status!=='cancelled');
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})}),page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(root);await page.locator('.event-row').first().waitFor();await page.getByRole('button',{name:'Research lab',exact:true}).click();
    if(!job){for(const [name,value] of Object.entries({start:'2000-01-01',end:'2026-01-01',minMagnitude:'5'}))await page.locator(`#import-form [name="${name}"]`).fill(value);await page.locator('#import-form button').click();await page.locator('.import-job').first().waitFor();job=(await(await fetch(root+'/api/import-jobs')).json()).jobs[0];writeFileSync('artifacts/archive-import-id.txt',job.id);}
    const card=page.locator(`[data-import-id="${job.id}"]`);await card.waitFor();
    if(job.status!=='completed'){
      const deadline=Date.now()+90000;while(true){job=(await(await fetch(root+'/api/import-jobs')).json()).jobs.find(j=>j.id===job.id);if(job.status==='failed')throw new Error(job.error);if(job.completedChunks>=1)break;if(Date.now()>deadline)throw new Error('First catalog chunk did not finish');await page.waitForTimeout(500);}
      await card.getByRole('button',{name:'Pause',exact:true}).click();await card.locator('.import-state').filter({hasText:/^paused$/}).waitFor();const before=(await(await fetch(root+'/api/import-jobs')).json()).jobs.find(j=>j.id===job.id);await page.reload();await page.getByRole('button',{name:'Research lab',exact:true}).click();await card.locator('.import-state').filter({hasText:/^paused$/}).waitFor();assert.equal((await(await fetch(root+'/api/import-jobs')).json()).jobs.find(j=>j.id===job.id).completedChunks,before.completedChunks);await card.getByRole('button',{name:'Resume',exact:true}).click();
    }
    const receipt=page.waitForEvent('download');await card.getByRole('link',{name:'Receipts ↓'}).click();await(await receipt).saveAs(`artifacts/${engine}-import-receipts.json`);const exported=JSON.parse(readFileSync(`artifacts/${engine}-import-receipts.json`,'utf8'));assert.ok(exported.receipts.some(r=>r.success&&r.sha256?.length===64));assert.equal(exported.job.options.minMagnitude,5);
    await card.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/${engine}-import-desktop.png`});const sizes=[];for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await card.scrollIntoViewIfNeeded();const size=await page.locator('#research-dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,document:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(size.scroll<=size.client+1);assert.equal(size.document,width);sizes.push(size);}await page.screenshot({path:`artifacts/${engine}-import-mobile.png`});assert.deepEqual(errors,[]);reports.push({engine,jobId:job.id,pauseResumeReload:true,receiptsVerified:true,sizes,errors});
  }finally{await browser.close();}
}
writeFileSync('artifacts/import-browser-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
