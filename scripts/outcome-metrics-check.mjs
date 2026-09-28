import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='http://127.0.0.1:4318',ledger=await(await fetch(root+'/api/ledger')).json();
const forecast=ledger.forecasts.find(f=>f.path?.length>1&&f.latestResolution?.event&&f.reviewCount);
assert.ok(forecast);const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of [1366,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(root);await page.locator('.event-row').first().waitFor({state:'attached'});
 if(width<1024){await page.locator('[data-mobile=research]').click();await page.locator('#research-ledger-open').click();}else await page.locator('[data-view=ledger]').click();
 await page.locator(`[data-resolution-history="${forecast.id}"]`).click();
 await page.locator('.outcome-metrics').waitFor();const metrics=await page.locator('.outcome-metrics').innerText();assert.match(metrics,/Event distance from frozen route\s+[\d.]+ km/);
 await page.locator('#resolution-reproduce').click();await page.locator('#resolution-reproduction').filter({hasText:'Identical result reproduced'}).waitFor();
 assert.equal(await page.locator('#resolution-history-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:`artifacts/outcome-metrics-${width}.png`});results.push({width,metrics,reproduced:true,errors});await page.close();
}}finally{await browser.close();}
const after=await(await fetch(root+'/api/ledger')).json();assert.deepEqual(after.integrity,ledger.integrity);assert.deepEqual(after.reviewIntegrity,ledger.reviewIntegrity);
writeFileSync('artifacts/outcome-metrics-check.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
