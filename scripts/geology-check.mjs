import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor();
  await clickGlobeControl(page,'slabs-toggle');await page.locator('#slabs-toggle[aria-pressed="true"]').waitFor({state:'attached',timeout:30000});
  await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/slab2-globe.png'});
  await clickGlobeControl(page,'section-toggle');await page.waitForTimeout(2000);await page.screenshot({path:'artifacts/cutaway-desktop.png'});
  assert.equal(await page.locator('#section-toggle').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#depth-scale').isDisabled(),true);
  await page.locator('[data-filter="deep"]').click();await page.locator('.event-row').first().click();
  assert.equal(await page.locator('#section-toggle').getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Close selection'}).click();
  await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/cutaway-selected-event.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1200);await page.screenshot({path:'artifacts/cutaway-mobile.png'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  await clickGlobeControl(page,'section-toggle');assert.equal(await page.locator('#depth-scale').isDisabled(),false);
  assert.equal(await page.locator('#xray-toggle').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);writeFileSync('artifacts/geology-browser-report.json',JSON.stringify({errors,mobileOverflow:overflow,contours:909},null,2));console.log(JSON.stringify({errors,mobileOverflow:overflow,contours:909}));
}finally{await browser.close();}
