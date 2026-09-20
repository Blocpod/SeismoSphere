import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const engines=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),root='http://127.0.0.1:4318',reports=[];
const records=await(await fetch(root+'/api/mechanisms')).json(),saved=records.records.find(r=>r.event_id==='USGS:us7000tgrk');assert.ok(saved,'Retrieve the retained USGS:us7000tgrk source first');
const envelope=await(await fetch(root+'/api/mechanism-export?id='+saved.id)).json();assert.deepEqual(envelope.integrity,{recordValid:true,sourceValid:true});assert.equal(envelope.record.products.length,3);
const raw=await(await fetch(root+'/api/mechanism-export?id='+saved.id+'&raw=1')).text();assert.equal(createHash('sha256').update(raw).digest('hex'),envelope.record.receipt.sha256);
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})});
  try{for(const [width,height]of [[1536,1024],[390,844],[320,740],[844,390]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(root);await page.locator('.event-row').first().waitFor({state:'attached'});
    await page.evaluate(async()=>{const {Mechanisms}=await import('/mechanisms.js'),original=Mechanisms.prototype.update;Mechanisms.prototype.update=function(...args){const result=original.apply(this,args);window.mechanismInspection=this;return result;};});
    await clickGlobeControl(page,'mechanisms-open');await page.locator('#mechanism-history option[value="'+saved.id+'"]').waitFor({state:'attached'});await page.locator('#mechanism-history').selectOption(saved.id);await page.locator('#mechanism-diagram').waitFor();
    assert.match(await page.locator('#mechanism-content').innerText(),/97.06%/);assert.match(await page.locator('#mechanism-content').innerText(),/340.5 km/);assert.equal(await page.locator('#mechanism-product option').count(),3);
    const pixels=await page.locator('#mechanism-diagram').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let black=0,white=0;for(let i=0;i<p.length;i+=4){if(p[i+3]&&p[i]===20)black++;if(p[i+3]&&p[i]===250)white++;}return {black,white};});assert.ok(pixels.black>10000&&pixels.white>10000);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#mechanisms-dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1),false);
    await page.screenshot({path:`artifacts/${engine}-mechanism-dialog-${width}.png`});
    const download=page.waitForEvent('download');await page.locator('#mechanism-svg').click();const file=`artifacts/${engine}-mechanism-${width}.svg`;await(await download).saveAs(file);const svg=readFileSync(file,'utf8');assert.ok(svg.includes(saved.id));assert.match(svg,/Full published tensor/);
    await page.locator('#mechanism-focus').click();const view=await page.evaluate(()=>{const m=window.mechanismInspection;return {visible:m.group.visible,parts:m.group.children.length,evidence:m.evidence(),xray:m.earth.xray,center:m.group.children[0].geometry.boundingSphere?.center};});assert.equal(view.visible,true);assert.equal(view.parts,3);assert.equal(view.xray,true);assert.equal(view.evidence.anchor.depth,340.5);assert.equal(view.evidence.glyphRadiusEarthUnits,.035);
    await page.waitForTimeout(1800);await page.screenshot({path:`artifacts/${engine}-mechanism-earth-${width}.png`});
    if(width===1536){
      await page.getByRole('button',{name:'Close selection'}).click();
      await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#depth-scale').selectOption('5');await page.getByRole('button',{name:'Close settings',exact:true}).click();
      const center=()=>page.evaluate(()=>{const m=window.mechanismInspection,g=m.group.children[0].geometry;g.computeBoundingSphere();return {radius:g.boundingSphere.center.length(),scale:m.evidence().depthScale,clips:m.group.children.map(c=>c.material.clippingPlanes.length),selected:m.earth.selected.id};});
      let inspected=await center();assert.ok(Math.abs(inspected.radius-(1-340.5/6371.0088*5))<1e-6);assert.equal(inspected.selected,'USGS:us7000tgrk');
      await clickGlobeControl(page,'section-toggle');inspected=await center();assert.equal(inspected.scale,1);assert.deepEqual(inspected.clips,[2,2,2]);assert.ok(Math.abs(inspected.radius-(1-340.5/6371.0088))<1e-6);
      await page.locator('#scientific-toggle').click();assert.deepEqual((await center()).clips,[2,2,2]);await clickGlobeControl(page,'section-toggle');assert.equal((await center()).scale,5);assert.deepEqual((await center()).clips,[0,0,0]);
      await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#depth-scale').selectOption('1');await page.getByRole('button',{name:'Close settings',exact:true}).click();
      await clickGlobeControl(page,'figure-open');await page.locator('#figure-form button').click();await page.locator('.figure-downloads').waitFor({timeout:45000});const down=page.waitForEvent('download');await page.locator('#figure-json').click();const filename=`artifacts/${engine}-mechanism-figure.json`;await(await down).saveAs(filename);const figure=JSON.parse(readFileSync(filename,'utf8'));assert.equal(figure.evidence.focalMechanism.recordId,saved.id);assert.equal(createHash('sha256').update(JSON.stringify(figure.evidence)).digest('hex'),figure.sha256);await page.locator('#figure-close').click();
      await page.getByRole('button',{name:'Research lab',exact:true}).click();await page.locator('#replay-date').fill('2026-09-12T00:00');await page.locator('#load-replay').click();await page.waitForFunction(()=>window.mechanismInspection?.group.visible===false);await clickGlobeControl(page,'mechanisms-open');assert.match(await page.locator('#mechanism-content').innerText(),/revised after/);assert.equal(await page.locator('#mechanism-diagram').count(),0);
    }
    assert.deepEqual(errors,[]);reports.push({engine,width,height,pixels,parts:view.parts,record:saved.id,cutoffTest:width===1536,errors});await page.close();
  }}finally{await browser.close();}
}
writeFileSync('artifacts/mechanism-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
