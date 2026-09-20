import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const engines=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),results=[];
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})});
  try{for(const touch of [false,true]){
    const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1536,height:1024},hasTouch:touch});await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor({state:'attached'});await page.evaluate(async()=>{const {Volcanoes}=await import('/volcanoes.js'),old=Volcanoes.prototype.update;Volcanoes.prototype.update=function(...args){const value=old.apply(this,args);window.volcanoPickTest=this;return value;};});await clickGlobeControl(page,'volcanoes-open');await page.locator('#volcano-search').fill('Kilauea');await page.locator('[data-volcano="GVP:332010"]').click();await page.locator('#volcano-focus').click();await page.waitForTimeout(1800);
    const point=await page.evaluate(()=>{const v=window.volcanoPickTest,a=v.group.children[0].geometry.attributes.position,p=v.earth.camera.position.clone().set(a.getX(0),a.getY(0),a.getZ(0)).project(v.earth.camera),r=v.earth.renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
    const screenshot=await page.screenshot({path:`artifacts/${engine}-volcano-pick-${touch?'touch':'mouse'}.png`}),orange=await page.evaluate(async({url,point})=>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(Math.round(point.x)-12,Math.round(point.y)-12,24,24).data;let orange=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>160&&pixels[i+1]>60&&pixels[i+1]<210&&pixels[i+2]<130&&pixels[i]>pixels[i+1]*1.15)orange++;return orange;},{url:'data:image/png;base64,'+screenshot.toString('base64'),point});assert.ok(orange>10,JSON.stringify({engine,touch,orange}));
    if(touch)await page.touchscreen.tap(point.x+20,point.y);else await page.mouse.click(point.x+8,point.y);await page.locator('#volcano-dialog').waitFor();assert.equal(await page.locator('#volcano-detail h3').innerText(),'Kilauea');results.push({engine,touch,orangePixels:orange,pickOffsetPx:touch?20:8});await page.close();
  }}finally{await browser.close();}
}
writeFileSync('artifacts/volcano-picking-report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
