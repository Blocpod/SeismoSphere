import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {hash} from '../server/store.mjs';
const require=createRequire(import.meta.url),engines=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),reports=[];
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})}),page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor();await page.locator('[data-view="research"]').click();
    await page.locator('.learned-table').waitFor();await page.locator('#learned-train').click();await page.locator('#learned-status').filter({hasText:'existing immutable run'}).waitFor({timeout:60000});
    await page.locator('.learned-lab').scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/${engine}-learned-lab.png`});
    const downloading=page.waitForEvent('download');await page.locator('.learned-export').click();await(await downloading).saveAs(`artifacts/${engine}-learned-export.json`);
    const exported=JSON.parse(readFileSync(`artifacts/${engine}-learned-export.json`,'utf8')),r=exported.report;
    assert.deepEqual(exported.integrity,{weightsValid:true,snapshotValid:true});assert.equal(hash(r.artifact),r.weightsSha256);assert.ok(exported.snapshot.events.every(e=>e.type==='earthquake'));
    const {id,...snapshot}=exported.snapshot;assert.equal(hash(snapshot),id);assert.ok(r.testWindows.every(w=>w.cutoff>=r.options.validationEnd));assert.equal(r.testWindows.length,r.scores.test.windows);
    await page.locator('#learned-map-form button').click();await page.locator('.spatial-caption').waitFor({timeout:60000});assert.match(await page.locator('.spatial-caption').textContent(),/LEARNED CELL GRAPH/);assert.equal(await page.locator('#field-toggle').isDisabled(),true);
    assert.equal(await page.locator('.forecast-panel').isVisible(),false);assert.equal(await page.locator('.learned-cell option').count(),72);await page.locator('.learned-cell select').selectOption('0');await page.waitForTimeout(1900);await page.screenshot({path:`artifacts/${engine}-learned-earth.png`});
    await clickGlobeControl(page,'section-tools');await page.locator('#section-draw').click();await page.locator('.section-pickbar').waitFor();await page.keyboard.press('Escape');await page.locator('.spatial-caption').waitFor();assert.equal(await page.locator('.learned-cell option').count(),72);assert.equal(await page.locator('.forecast-panel').isVisible(),false);
    await clickGlobeControl(page,'figure-open');await page.getByRole('button',{name:'Capture current Earth',exact:true}).click();await page.locator('.figure-downloads').waitFor({timeout:45000});
    for(const type of ['png','svg','json']){const d=page.waitForEvent('download');await page.locator('#figure-'+type).click();await(await d).saveAs(`artifacts/${engine}-learned-figure.${type}`);}
    const figure=JSON.parse(readFileSync(`artifacts/${engine}-learned-figure.json`,'utf8'));assert.equal(figure.evidence.learnedModel.runId,r.id);assert.equal(figure.evidence.spatialETAS,null);assert.equal(figure.evidence.layers.field,false);assert.equal(figure.evidence.layers.forecastVolumes,false);assert.equal(createHash('sha256').update(JSON.stringify(figure.evidence)).digest('hex'),figure.sha256);assert.match(readFileSync(`artifacts/${engine}-learned-figure.svg`,'utf8'),/LEARNED CELL GRAPH/);
    const input=await(await page.request.get('http://127.0.0.1:4318/api/snapshot?id='+figure.evidence.learnedModel.projection.inputSnapshotId)).json();assert.ok(input.events.every(e=>e.time<=figure.evidence.learnedModel.projection.cutoff));
    await page.getByRole('button',{name:'Close figure export'}).click();await page.locator('#go-live').click();await page.locator('.spatial-caption').waitFor({state:'hidden'});assert.equal(await page.locator('#field-toggle').isDisabled(),false);
    const sizes=[];for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await page.locator('[data-mobile="research"]').click();await page.locator('.learned-lab').scrollIntoViewIfNeeded();const sizing=await page.locator('#research-dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(sizing.scroll<=sizing.client+1,JSON.stringify(sizing));sizes.push({width,...sizing});await page.getByRole('button',{name:'Close research lab'}).click();}
    await page.setViewportSize({width:390,height:844});await page.locator('[data-mobile="research"]').click();await page.locator('#learned-map-form input').fill('2020-01-01');await page.locator('#learned-map-form button').click();await page.locator('.spatial-caption').waitFor({timeout:60000});assert.match(await page.locator('.spatial-caption').textContent(),/2020-01-01/);await page.waitForTimeout(1800);await page.screenshot({path:`artifacts/${engine}-learned-mobile.png`});
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(500);const caption=await page.locator('.spatial-caption').boundingBox(),timeline=await page.locator('.timeline').boundingBox();assert.ok(caption.y>=0&&caption.y+caption.height<timeline.y,JSON.stringify({caption,timeline}));assert.equal(await page.locator('[data-mobile="earth"]').getAttribute('class'),'active');await page.screenshot({path:`artifacts/${engine}-learned-landscape.png`});
    await page.getByRole('button',{name:'Remove statistical layer'}).click();assert.equal(await page.locator('#field-toggle').isDisabled(),false);assert.deepEqual(errors,[]);
    reports.push({engine,id:r.id,testWeeks:r.scores.test.windows,testEvents:r.scores.test.models.graph.events,exportVerified:true,cutoffSafeInputs:true,sceneRestored:true,sizes,errors});
  }catch(error){console.error('Learned browser state:',await page.locator('#learned-status').textContent().catch(()=>''));throw error;}finally{await browser.close();}
}
writeFileSync('artifacts/learned-browser-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
