import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../server/store.mjs';
const engines=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),reports=[];
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})}),page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor();await page.locator('[data-view="research"]').click();await page.locator('#completeness-chart svg').waitFor();
    const form=page.locator('#completeness-form');
    for(const [key,value]of Object.entries({start:'2010-01-01',end:'2012-01-01',minMagnitude:'2',south:'30',north:'46',west:'130',east:'148',windowDays:'30'}))await form.locator(`[name="${key}"]`).fill(value);
    await form.locator('[name="provider"]').selectOption('USGS');await form.locator('[name="binWidth"]').selectOption('0.1');await form.locator('[name="magType"]').selectOption('all');await form.locator('button').click();
    await page.locator('#completeness-status').filter({hasText:/saved|Loaded/}).waitFor();
    let download=page.waitForEvent('download');await page.locator('.diagnostic-export').click();await(await download).saveAs(`artifacts/${engine}-completeness-export.json`);
    const exported=JSON.parse(readFileSync(`artifacts/${engine}-completeness-export.json`,'utf8')),r=exported.report,{id,...snapshot}=exported.snapshot;
    assert.equal(exported.snapshotValid,true);assert.equal(hash(snapshot),id);assert.equal(r.events,5474);assert.equal(r.pooled.mbs.mc,5.1);assert.equal(r.temporal.reduce((s,t)=>s+t.events,0),r.events);assert.equal(r.spatial.reduce((s,t)=>s+t.events,0),r.events);
    await page.locator('#completeness-sample').selectOption('pooled');await page.locator('.diagnostic-plot-scroll').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:`artifacts/${engine}-completeness-chart.png`});
    await page.locator('[data-cell="6"]').click();assert.equal(await page.locator('#completeness-sample').inputValue(),'cell-6');assert.match(await page.locator('#completeness-sample-info').innerText(),/2357 earthquakes/);
    download=page.waitForEvent('download');await page.locator('#completeness-svg').click();await(await download).saveAs(`artifacts/${engine}-completeness-cell.svg`);
    const svg=readFileSync(`artifacts/${engine}-completeness-cell.svg`,'utf8'),metadata=await page.evaluate(s=>JSON.parse(new DOMParser().parseFromString(s,'image/svg+xml').querySelector('metadata').textContent),svg);assert.equal(metadata.runId,r.id);assert.equal(metadata.inputSnapshotId,id);assert.deepEqual(metadata.sample.value,r.spatial[6]);
    await page.locator('[data-time="14"]').click();assert.equal(await page.locator('#completeness-sample').inputValue(),'time-14');
    await form.locator('[name="magType"]').selectOption('mb');await form.locator('button').click();await page.locator('#completeness-status').filter({hasText:/saved|Loaded/}).waitFor();assert.match(await page.locator('#completeness-sample-info').innerText(),/4807 earthquakes/);
    await page.reload();await page.locator('[data-view="research"]').click();await page.locator('#completeness-chart svg').waitFor();await page.locator('#completeness-history').selectOption(r.id);assert.equal(await form.locator('[name="magType"]').inputValue(),'all');assert.match(await page.locator('#completeness-sample-info').innerText(),/5474 earthquakes/);
    const viewports=[];
    for(const [width,height]of [[320,844],[390,844],[768,1024],[844,390]]){
      await page.setViewportSize({width,height});await page.locator('#completeness-sample').scrollIntoViewIfNeeded();
      const plot=await page.locator('.diagnostic-plot-scroll').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(plot.scroll<=plot.client+1,JSON.stringify({width,plot}));
      const dimensions=await page.locator('#research-dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.client+1,JSON.stringify({width,...dimensions}));
      const close=await page.getByRole('button',{name:'Close research lab'}).boundingBox();assert.ok(close.y>=0&&close.y+close.height<=height,JSON.stringify({width,height,close}));
      await page.locator('#completeness-sample').selectOption('cell-6');await page.locator('#completeness-sample').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');assert.notEqual(await page.locator('#completeness-sample').inputValue(),'cell-6');
      const importForm=page.locator('#import-form');await importForm.locator('[name="scope"]').selectOption('region');assert.equal(await importForm.locator('#import-bounds').isVisible(),true);assert.equal(await importForm.locator('[name="south"]').isEnabled(),true);await importForm.locator('[name="scope"]').selectOption('global');assert.equal(await importForm.locator('#import-bounds').isVisible(),false);assert.equal(await importForm.locator('[name="south"]').isDisabled(),true);
      viewports.push({width,height,...dimensions});
    }
    await page.setViewportSize({width:390,height:844});await page.locator('#completeness-sample').selectOption('pooled');await page.locator('.diagnostic-plot-scroll').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:`artifacts/${engine}-completeness-mobile.png`});
    assert.deepEqual(errors,[]);reports.push({engine,runId:r.id,events:r.events,viewports,errors});
  }finally{await browser.close();}
}
writeFileSync('artifacts/completeness-browser-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
