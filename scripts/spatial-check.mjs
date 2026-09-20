import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),engines=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),reports=[];
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})}),page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor();await page.locator('[data-view="research"]').click();
    await page.locator('#spatial-result .spatial-map').waitFor();await page.locator('#spatial-form button').click();await page.locator('#spatial-result .spatial-map').waitFor({timeout:95000});assert.match(await page.locator('#spatial-result').textContent(),/branching ratio/);await page.locator('#spatial-result').scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/${engine}-spatial-lab.png`});
    await page.locator('#spatial-horizon').selectOption('1');assert.match(await page.locator('.spatial-map').getAttribute('aria-label'),/1-day/);await page.locator('#spatial-horizon').selectOption('7');
    const exporting=page.waitForEvent('download');await page.locator('#spatial-result a[download]').click();await(await exporting).saveAs(`artifacts/${engine}-spatial-evidence.json`);
    const exported=JSON.parse(readFileSync(`artifacts/${engine}-spatial-evidence.json`,'utf8')),run=exported.run;assert.equal(run.fit.training.events,62);assert.equal(run.holdout.events,1504);assert.equal(exported.snapshots.length,2);assert.ok(run.fit.frozenHistory.every(e=>e.time<=run.fit.options.end));for(const m of run.projection.maps)assert.ok(Math.abs(m.cellSum-m.totalDirectIntensity)<1e-5);
    await page.locator('#spatial-earth').click();await page.locator('.spatial-caption').waitFor();assert.match(await page.locator('#timeline-time').textContent(),/Mar 10/);assert.equal(await page.locator('#field-toggle').isDisabled(),true);await page.waitForTimeout(1900);await page.screenshot({path:`artifacts/${engine}-spatial-earth.png`});
    await clickGlobeControl(page,'figure-open');await page.getByRole('button',{name:'Capture current Earth',exact:true}).click();await page.locator('.figure-downloads').waitFor({timeout:45000});
    for(const type of ['png','json']){const d=page.waitForEvent('download');await page.locator('#figure-'+type).click();await(await d).saveAs(`artifacts/${engine}-spatial-figure.${type}`);}
    const figure=JSON.parse(readFileSync(`artifacts/${engine}-spatial-figure.json`,'utf8'));assert.equal(figure.evidence.spatialETAS.runId,run.id);assert.equal(figure.evidence.layers.field,false);assert.equal(figure.evidence.layers.forecastVolumes,false);assert.equal(createHash('sha256').update(JSON.stringify(figure.evidence)).digest('hex'),figure.sha256);
    await page.getByRole('button',{name:'Close figure export'}).click();await page.locator('#go-live').click();await page.locator('.spatial-caption').waitFor({state:'hidden'});assert.equal(await page.locator('#field-toggle').isDisabled(),false);
    const sizes=[];for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await page.locator('[data-mobile="research"]').click();await page.locator('#spatial-result').scrollIntoViewIfNeeded();const sizing=await page.locator('#research-dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(sizing.scroll<=sizing.client+1);sizes.push({width,...sizing});await page.getByRole('button',{name:'Close research lab'}).click();}
    await page.setViewportSize({width:390,height:844});await page.locator('[data-mobile="research"]').click();await page.locator('#spatial-earth').click();await page.locator('.spatial-caption').waitFor();await page.waitForTimeout(1700);await page.screenshot({path:`artifacts/${engine}-spatial-mobile.png`});await page.getByRole('button',{name:'Remove statistical layer'}).click();assert.equal(await page.locator('#field-toggle').isDisabled(),false);assert.deepEqual(errors,[]);
    reports.push({engine,id:run.id,training:run.fit.training.events,holdout:run.holdout.events,bitsVsKDE:run.holdout.bitsPerEventVsKDE,exportVerified:true,sceneRestored:true,sizes,errors});
  }finally{await browser.close();}
}
writeFileSync('artifacts/spatial-browser-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
