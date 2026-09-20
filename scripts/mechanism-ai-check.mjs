import {clickGlobeControl} from './browser-controls.mjs';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chat} from '../server/ai.mjs';
import {mechanismContext} from '../server/mechanisms.mjs';
const root='http://127.0.0.1:4318',status=await(await fetch(root+'/api/status')).json(),{chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1536,height:1024}});let local,record;
try{
  await page.goto(root);await page.locator('.event-row').first().waitFor();await page.locator('#event-search').fill('us7000tgrk');await page.locator('[data-event="USGS:us7000tgrk"]').click();await clickGlobeControl(page,'mechanisms-open');const request=page.waitForResponse(r=>r.url().endsWith('/api/mechanism-query'));await page.locator('#mechanism-load').click();const queried=await request;record=await queried.json();assert.equal(queried.status(),200,JSON.stringify(record));await page.locator('#mechanism-explain').waitFor();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'),{timeout:190000});await page.locator('#mechanism-explain').click();const r=await response;local=await r.json();assert.equal(r.status(),200,JSON.stringify(local));assert.equal(local.provider,'ollama');assert.equal(local.grounded,false);await page.locator('#mechanism-explanation').filter({hasText:local.model}).waitFor();await page.locator('#mechanism-explanation').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/mechanism-local-explanation.png'});
}finally{await browser.close();}
const product=record.products.find(p=>p.magnitudeType==='Mww'),context={asOf:Date.now(),mode:'catalog-replay',mechanismEvidence:mechanismContext(record,product.id,Date.now()),candidates:[],selected:null},astra=await chat('Explain this exact published mechanism. State the scalar moment with units, both nodal planes, catalog and tensor-derived depths, double-couple fraction, and limitations on rupture-plane choice, local stress and forecasting.',context,{...status.config,aiProvider:'codex'});assert.equal(astra.model,'gpt-6-astra');
for(const result of [local,astra]){assert.match(result.answer,/340\.5/);assert.match(result.answer,/372/);assert.match(result.answer,/97\.06|0\.9706/);assert.ok(result.answer.includes('6.75e+18 N m'),result.answer);assert.match(result.answer,/148\.02/);assert.match(result.answer,/239\.16/);assert.match(result.answer,/cannot|not|ambigui/i);}
writeFileSync('artifacts/mechanism-ai-report.json',JSON.stringify({recordId:record.id,local,astra},null,2));console.log(JSON.stringify({local:local.answer,astra:astra.answer}));
