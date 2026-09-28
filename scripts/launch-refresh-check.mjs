import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='http://127.0.0.1:4318',browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const started=Date.now();const refreshed=page.waitForResponse(r=>r.url()===root+'/api/refresh'&&r.request().method()==='POST',{timeout:120000});
 await page.goto(root);const feed=await(await refreshed).json();assert.equal(feed.status,'live');assert.ok(feed.fetchedAt>=started);
 await page.waitForFunction(()=>!document.querySelector('#refresh').disabled,{timeout:60000});
 assert.match(await page.locator('#feed-status').innerText(),/LIVE DATA/);assert.ok(await page.locator('.event-row').count()>0);
 await page.route('**/api/refresh',r=>r.fulfill({json:{status:'stale',error:'Controlled offline test'}}));
 await page.reload();await page.locator('#feed-status').filter({hasText:'SYNC FAILED'}).waitFor({timeout:60000});assert.ok(await page.locator('.event-row').count()>0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({launchRefresh:true,fetchedAt:new Date(feed.fetchedAt),events:feed.count,offlineSavedCatalog:true,errors}));
} finally {await browser.close();}
