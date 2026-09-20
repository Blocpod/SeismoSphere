import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),engines=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),reports=[];
for(const engine of ['chromium','webkit']){
  const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})}),page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor();
    const start=Date.now();await clickGlobeControl(page,'faults-open');await page.locator('#fault-status').filter({hasText:'16,195 mapped traces'}).waitFor({timeout:30000});const loadMs=Date.now()-start;
    await page.locator('#fault-visible').check();await page.locator('#fault-search').fill('San Andreas');await page.locator('.fault-row').first().click();assert.match(await page.locator('#fault-detail').textContent(),/San Andreas/);assert.match(await page.locator('#fault-detail').textContent(),/Source tuples/);await page.screenshot({path:`artifacts/${engine}-fault-inspector.png`});
    await page.locator('#fault-focus').click();await page.waitForTimeout(2000);await page.screenshot({path:`artifacts/${engine}-faults-earth.png`});
    await clickGlobeControl(page,'faults-open');const queryStart=Date.now();await page.locator('#fault-near-camera').click();await page.locator('#fault-query').filter({hasText:'nearest mapped traces within 500 km'}).waitFor();const queryMs=Date.now()-queryStart;const nearest=await page.locator('.fault-row').allTextContents();assert.equal(nearest.length,6);assert.ok(nearest.some(x=>x.includes('San Andreas')));
    await page.locator('#fault-close').click();await clickGlobeControl(page,'figure-open');await page.getByRole('button',{name:'Capture current Earth',exact:true}).click();await page.locator('.figure-downloads').waitFor({timeout:45000});assert.match(await page.locator('#figure-status').textContent(),/CC BY-SA 4.0/);
    for(const type of ['json','png']){const download=page.waitForEvent('download');await page.locator('#figure-'+type).click();await(await download).saveAs(`artifacts/${engine}-fault-figure.${type}`);}
    const figure=JSON.parse(readFileSync(`artifacts/${engine}-fault-figure.json`,'utf8'));assert.equal(figure.evidence.mappedFaults.provenance.revision,'56816508ad92fd6846dad1163b1c8c01376a2cd1');assert.equal(figure.evidence.mappedFaults.enabled,true);assert.equal(figure.evidence.mappedFaults.lastQuery.matches.length,6);assert.match(figure.evidence.figureLicense,/CC BY-SA/);assert.equal(createHash('sha256').update(JSON.stringify(figure.evidence)).digest('hex'),figure.sha256);
    await page.getByRole('button',{name:'Close figure export'}).click();await clickGlobeControl(page,'section-toggle');await page.waitForTimeout(1700);await clickGlobeControl(page,'section-toggle');
    await page.setViewportSize({width:390,height:844});await clickGlobeControl(page,'faults-open');await page.locator('#fault-search').fill('North Anatolian');await page.locator('#fault-results').filter({hasText:'No mapped trace matches'}).waitFor();await page.locator('#fault-search').fill('Hayward');await page.locator('.fault-row').first().click();assert.equal(await page.locator('#fault-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:`artifacts/${engine}-faults-mobile.png`});
    await page.locator('#fault-visible').uncheck();assert.equal(await page.locator('.fault-caption').isVisible(),false);assert.deepEqual(errors,[]);reports.push({engine,loadMs,queryMs,nearest,exportProvenance:true,cutawayCompatible:true,mobileOverflow:false,errors});
  }finally{await browser.close();}
}
writeFileSync('artifacts/faults-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
