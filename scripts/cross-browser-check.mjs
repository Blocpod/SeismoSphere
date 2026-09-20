import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),engines=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const results=[];
for(const name of ['firefox','webkit']){
  let browser;const errors=[];
  try{
    browser=await engines[name].launch({headless:true,...(name==='firefox'?{firefoxUserPrefs:{'webgl.force-enabled':true,'webgl.disabled':false}}:{})});
    const page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor({timeout:30000});await page.waitForTimeout(1800);
    const webgl=await page.evaluate(()=>{const canvas=document.querySelector('#globe canvas'),gl=canvas?.getContext('webgl2');return {available:!!gl,error:document.querySelector('#globe-error').hidden?null:document.querySelector('#globe-error').textContent,maxTexture:gl?.getParameter(gl.MAX_TEXTURE_SIZE)};});
    assert.equal(webgl.available,true,JSON.stringify(webgl));assert.equal(webgl.error,null);
    await page.screenshot({path:`artifacts/${name}-desktop.png`});
    await clickGlobeControl(page,'section-toggle');await page.waitForTimeout(1000);
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1000);await page.screenshot({path:`artifacts/${name}-mobile.png`});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
    await page.locator('[data-mobile="research"]').click();const research=await page.locator('#research-dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(research.scroll<=research.client+1,JSON.stringify(research));
    await page.getByRole('button',{name:'Close research lab'}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#startup-result').filter({hasText:'Current Windows user'}).waitFor();
    const settings=await page.locator('#settings-dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(settings.scroll<=settings.client+1,JSON.stringify(settings));
    assert.deepEqual(errors,[]);results.push({engine:name,passed:true,webgl,research,settings,errors});
  }catch(e){results.push({engine:name,passed:false,error:e.message,errors});}
  finally{await browser?.close();}
}
writeFileSync('artifacts/cross-browser-report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(r=>!r.passed))process.exitCode=1;
