import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),engines=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
mkdirSync('artifacts',{recursive:true});const results=[];
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})}),page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor();await page.waitForTimeout(2500);
    const size=await page.locator('#globe canvas').evaluate(e=>({w:e.width,h:e.height}));
    await clickGlobeControl(page,'figure-open');await page.getByRole('button',{name:'Capture current Earth',exact:true}).click();
    await page.locator('.figure-downloads').waitFor({timeout:45000});
    const preview=await page.locator('#figure-preview').evaluate(async e=>{await e.decode();const c=document.createElement('canvas');c.width=240;c.height=180;const ctx=c.getContext('2d');ctx.drawImage(e,0,0,240,180);const p=ctx.getImageData(60,35,120,105).data;let bright=0;for(let i=0;i<p.length;i+=4)if(Math.max(p[i],p[i+1],p[i+2])>75)bright++;return {width:e.naturalWidth,height:e.naturalHeight,bright};});
    assert.equal(preview.width,2400);assert.equal(preview.height,1800);assert.ok(preview.bright>750,JSON.stringify(preview));
    for(const type of ['png','svg','json']){const download=page.waitForEvent('download');await page.locator('#figure-'+type).click();await(await download).saveAs(`artifacts/${engine}-figure.${type}`);}
    const evidence=JSON.parse(readFileSync(`artifacts/${engine}-figure.json`,'utf8'));
    assert.equal(createHash('sha256').update(JSON.stringify(evidence.evidence)).digest('hex'),evidence.sha256);
    assert.ok(evidence.evidence.render.actualPointEvents.length>0);
    assert.ok(evidence.evidence.render.actualPointEvents.every(e=>e.time<=Date.parse(evidence.evidence.observationCutoff)));
    const embedded=await page.evaluate(svg=>JSON.parse(new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('metadata').textContent),readFileSync(`artifacts/${engine}-figure.svg`,'utf8'));assert.deepEqual(embedded.evidence,evidence.evidence);
    assert.deepEqual(await page.locator('#globe canvas').evaluate(e=>({w:e.width,h:e.height})),size);
    await page.getByRole('button',{name:'Close figure export'}).click();await clickGlobeControl(page,'section-toggle');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1000);
    await clickGlobeControl(page,'figure-open');await page.locator('#figure-title').fill('A <section> & its evidence');await page.getByRole('button',{name:'Capture current Earth',exact:true}).click();await page.locator('.figure-downloads').waitFor({timeout:45000});
    const cutaway=page.waitForEvent('download');await page.locator('#figure-json').click();await(await cutaway).saveAs(`artifacts/${engine}-cutaway-figure.json`);
    const cut=JSON.parse(readFileSync(`artifacts/${engine}-cutaway-figure.json`,'utf8'));assert.equal(cut.evidence.layers.section,true);assert.equal(cut.evidence.layers.depthScale,1);assert.equal(cut.evidence.title,'A <section> & its evidence');
    const overflow=await page.locator('#figure-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1);assert.equal(overflow,false);await page.screenshot({path:`artifacts/${engine}-figure-dialog-mobile.png`});assert.deepEqual(errors,[]);
    results.push({engine,passed:true,preview,checksumVerified:true,cutaway:true,mobileOverflow:overflow,errors});
  }finally{await browser.close();}
}
writeFileSync('artifacts/figure-report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
