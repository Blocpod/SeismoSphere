import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {clickGlobeControl} from './browser-controls.mjs';
const engines=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),reports=[];
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})});
  try{for(const [width,height]of [[320,740],[390,844],[844,390],[768,1024],[1366,768],[1920,1080]]){
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor({state:'attached'});
    const toolbar=await page.locator('.globe-toolbar').evaluate(e=>({ids:[...e.querySelectorAll('button')].map(b=>b.id),width:e.clientWidth,scroll:e.scrollWidth,buttons:[...e.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})}));
    assert.deepEqual(toolbar.ids,['global-view','xray-toggle','scientific-toggle','layers-open','tools-open']);assert.ok(toolbar.scroll<=toolbar.width+1);for(const b of toolbar.buttons)assert.ok(b.x>=0&&b.x+b.width<=width&&b.height>=44,JSON.stringify({width,b}));
    for(const name of ['layers','tools']){
      const button=page.locator('#'+name+'-open'),panel=page.locator('#'+name+'-panel');await button.focus();await page.keyboard.press('Enter');assert.equal(await panel.evaluate(e=>e.matches(':popover-open')),true);
      const box=await panel.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify({engine,width,name,box}));
      await page.keyboard.press('Tab');assert.equal(await panel.evaluate(e=>e.contains(document.activeElement)),true);await page.keyboard.press('Escape');assert.equal(await button.evaluate(e=>e===document.activeElement),true);
      await button.click();await page.getByRole('button',{name:'Close '+name,exact:true}).click();assert.equal(await panel.isVisible(),false);
      await button.click();await page.mouse.click(8,8);assert.equal(await panel.isVisible(),false);
    }
    // Capture the existing Earth through its normal presentation action.
    await page.evaluate(async()=>{const {Earth}=await import('/globe.js'),original=Earth.prototype.syncPresentation;Earth.prototype.syncPresentation=function(...args){const result=original.apply(this,args);window.inspectedEarth=this;return result;};});
    await page.locator('#scientific-toggle').click();const inspect=()=>page.evaluate(()=>{const e=window.inspectedEarth;return {events:e.events.map(x=>x.id),forecasts:e.forecasts.map(x=>x.key),plates:e.plates.visible,paths:e.pathGroup.visible,field:e.field.visible,watches:e.forecastGroup.visible};});
    const before=await inspect();await page.locator('#layers-open').click();for(const [id,key]of [['plates-toggle','plates'],['paths-toggle','paths'],['field-toggle','field'],['watches-toggle','watches']]){await page.locator('#'+id).click();assert.equal((await inspect())[key],!before[key]);await page.locator('#'+id).click();assert.equal((await inspect())[key],before[key]);}
    await page.screenshot({path:`artifacts/${engine}-layers-${width}.png`});await page.keyboard.press('Escape');assert.deepEqual(await inspect(),before);
    await clickGlobeControl(page,'volcanoes-open');await page.locator('#volcano-status').filter({hasText:'1,214'}).waitFor();await page.locator('#volcano-visible').check();await page.getByRole('button',{name:'Close volcanoes',exact:true}).click();assert.equal(await page.locator('#layers-open').evaluate(e=>e===document.activeElement),true);
    await page.locator('#scene-layer-summary').click();await page.locator('.volcano-caption').scrollIntoViewIfNeeded();assert.match(await page.locator('.volcano-caption').innerText(),/VOTW 5.4.0.*NOT LIVE ERUPTION STATUS/);assert.equal(await page.locator('.volcano-caption').evaluate(e=>e.closest('#layers-panel')!==null),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#scene-layer-summary').evaluate(e=>e===document.activeElement),true);
    await clickGlobeControl(page,'section-toggle');await page.waitForFunction(()=>document.querySelector('#watches-toggle').disabled);assert.equal(await page.locator('#watches-toggle').isDisabled(),true);assert.equal((await inspect()).watches,false);await clickGlobeControl(page,'section-toggle');await page.waitForFunction(()=>!document.querySelector('#watches-toggle').disabled);assert.equal(await page.locator('#watches-toggle').isDisabled(),false);assert.equal((await inspect()).watches,before.watches);
    await clickGlobeControl(page,'flight-open');assert.equal(await page.locator('#flight-pause').isDisabled(),true);await page.locator('#flight-next').click();assert.match(await page.locator('#flight-progress').innerText(),/Stop 2 of/);await page.screenshot({path:`artifacts/${engine}-workbench-flight-${width}.png`});await page.locator('#flight-stop').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);assert.deepEqual(errors,[]);reports.push({engine,width,height,toolbar,keyboard:true,sourceFocus:true,toggles:true,cutawayRestore:true,manualFlight:true,errors});await page.close();
  }}finally{await browser.close();}
}
writeFileSync('artifacts/workbench-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
