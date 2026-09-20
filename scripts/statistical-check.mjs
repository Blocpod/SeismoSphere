import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:4318');
  await page.locator('.event-row').first().waitFor();
  await page.locator('[data-view="research"]').click();
  await page.locator('#etas-result .etas-metrics').waitFor();
  await page.locator('.statistical-lab').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/etas-desktop.png'});
  await page.locator('#etas-form button').click();
  await page.locator('#etas-result .etas-metrics').waitFor();
  assert.ok((await page.locator('#etas-result').textContent()).includes('Boundary estimates:'));
  const href=await page.locator('#etas-result a[download]').getAttribute('href');
  const exported=await(await page.request.get('http://127.0.0.1:4318'+href)).json();
  assert.equal(exported.snapshots.length,2);assert.equal(exported.run.fit.training.events,67);
  const viewports=[];
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    await page.locator('.statistical-lab').scrollIntoViewIfNeeded();
    const bounds=await page.locator('#research-dialog').evaluate(e=>({scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
    assert.ok(bounds.scrollWidth<=bounds.clientWidth+1,JSON.stringify({width,...bounds}));
    viewports.push({width,...bounds});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#etas-result').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({path:'artifacts/etas-mobile.png'});
  await page.getByRole('button',{name:'Close research lab'}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('[name="catalogProvider"]').selectOption('EMSC');
  await page.locator('#settings-form button[type="submit"]').click();
  await page.locator('#settings-result').filter({hasText:'Configuration saved'}).waitFor();
  await page.locator('[name="catalogProvider"]').selectOption('USGS');
  await page.locator('#settings-form button[type="submit"]').click();
  await page.waitForFunction(async()=>{const r=await(await fetch('/api/status')).json();return r.config.catalogProvider==='USGS';});
  assert.deepEqual(errors,[]);writeFileSync('artifacts/statistical-browser-report.json',JSON.stringify({viewports,errors,exportId:exported.run.id},null,2));
  console.log(JSON.stringify({viewports,errors,exportId:exported.run.id}));
}finally{await browser.close();}
