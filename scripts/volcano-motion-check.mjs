import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),root='http://127.0.0.1:4318',reports=[];
try{for(const width of [1366,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(root);
 await page.evaluate(async()=>{const {VolcanoActivity}=await import('/volcano-activity.js'),old=VolcanoActivity.prototype.sync;VolcanoActivity.prototype.sync=function(...args){window.volcanoTest=this;return old.apply(this,args);};});
 await page.waitForFunction(()=>window.volcanoTest?.data?.available&&window.volcanoTest.displayed.length>0);
 const evidence=await page.evaluate(()=>{const o=window.volcanoTest;o.earth.setScientific(false);o.earth.focus(o.displayed[0],2.6);return o.evidence();});assert.equal(evidence.animation.active,true);
 const before=await page.evaluate(()=>window.volcanoTest.pulses.points.material.size);await page.waitForFunction(size=>Math.abs(window.volcanoTest.pulses.points.material.size-size)>2,before);assert.equal(await page.evaluate(()=>window.volcanoTest.group.visible),true);
 await page.locator('.event-row').first().waitFor({state:'attached'});
 const weekly=await page.evaluate(()=>window.volcanoTest.earth.weeklyVolcanoes.evidence());assert.ok(weekly);if(weekly.publicationOld)assert.equal(weekly.animation.active,false);
 await page.screenshot({path:`artifacts/volcano-motion-${width}.png`});
 await page.evaluate(()=>window.volcanoTest.button.click());await page.locator('#volcano-activity-dialog').waitFor();await page.locator('#volcano-activity-animate').uncheck();assert.equal(await page.evaluate(()=>window.volcanoTest.pulses.points.visible),false);await page.locator('#volcano-activity-animate').check();
 await page.evaluate(()=>{window.volcanoTest.earth.reduced=true;});await page.waitForFunction(()=>!window.volcanoTest.pulses.points.visible);await page.evaluate(()=>{window.volcanoTest.earth.reduced=false;window.volcanoTest.data.checkedAt=Date.now()-31*60000;});await page.waitForFunction(()=>!window.volcanoTest.pulses.state().active);assert.equal(await page.evaluate(()=>window.volcanoTest.group.visible),true);
 assert.equal(await page.locator('#volcano-activity-dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1),false);assert.deepEqual(errors,[]);reports.push({width,source:evidence.receipt,animation:evidence.animation,toggle:true,reducedMotion:true,staleStatic:true,errors});await page.close();
}}finally{await browser.close();}writeFileSync('artifacts/volcano-motion-check.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.map(({width,toggle,reducedMotion,staleStatic,errors})=>({width,toggle,reducedMotion,staleStatic,errors}))));
