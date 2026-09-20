import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:4318');await page.locator('.forecast-row').first().waitFor();
  const geometry=await page.evaluate(async()=>{const {Earth}=await import('/globe.js'),THREE=await import('three'),samples=[];for(const end of [[-3,0,0],[0,0,2],[3,0,0]]){const fake={camera:new THREE.PerspectiveCamera(),targetCamera:new THREE.Vector3(...end),reduced:false};fake.camera.position.set(4,0,0);for(let t=0;t<=1400;t+=100){Earth.prototype.advanceCamera.call(fake,t);samples.push(fake.camera.position.length());}if(fake.camera.position.distanceTo(new THREE.Vector3(...end))>1e-8)throw new Error('Wrong camera endpoint');}return {minRadius:Math.min(...samples),maxRadius:Math.max(...samples),samples:samples.length};});assert.ok(geometry.minRadius>=2-1e-8);assert.ok(geometry.maxRadius<=4+1e-8);
  await clickGlobeControl(page,'flight-open');await page.locator('.flight-panel').waitFor();assert.match(await page.locator('#flight-progress').textContent(),/Stop 1 of/);
  await page.locator('#flight-pause').click();await page.waitForTimeout(3500);assert.match(await page.locator('#flight-progress').textContent(),/Stop 1 of.*paused/);
  await page.locator('#flight-next').click();assert.match(await page.locator('#flight-progress').textContent(),/Stop 2 of/);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'artifacts/path-flight-mobile.png'});
  await page.locator('#flight-stop').click();await clickGlobeControl(page,'flight-open');await page.mouse.move(190,350);await page.mouse.down();await page.mouse.move(250,370);await page.mouse.up();await page.locator('.flight-panel').waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('.forecast-row').first().waitFor({state:'attached'});await clickGlobeControl(page,'flight-open');assert.equal(await page.locator('#flight-pause').isDisabled(),true);await page.waitForTimeout(3500);assert.match(await page.locator('#flight-progress').textContent(),/Stop 1 of/);await page.locator('#flight-next').click();assert.match(await page.locator('#flight-progress').textContent(),/Stop 2 of/);
  assert.deepEqual(errors,[]);const report={geometry,pause:true,manualCancellation:true,reducedMotion:true,mobileOverflow:false,errors};writeFileSync('artifacts/camera-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
