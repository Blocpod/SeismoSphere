import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chat} from '../server/ai.mjs';
const root='http://127.0.0.1:4318',status=await(await fetch(root+'/api/status')).json(),{chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage();let local;
try{
  await page.goto(root);await page.locator('.event-row').first().waitFor();const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'),{timeout:190000});await page.locator('#command-input').fill('Use scientific view');await page.locator('#command-submit').click();const r=await response;local=await r.json();assert.equal(r.status(),200,JSON.stringify(local));assert.equal(local.provider,'ollama');assert.deepEqual(local.actions,['scientific']);await page.waitForFunction(()=>document.querySelector('#scientific-toggle').getAttribute('aria-pressed')==='true');assert.equal(await page.locator('#orbit-toggle').isDisabled(),true);
}finally{await browser.close();}
const astra=await chat('Restore cinematic view',{asOf:Date.now(),mode:'strict',stats:{recentEvents:status.catalogCount},candidates:[]},{...status.config,aiProvider:'codex'});assert.deepEqual(astra.actions,['cinematic']);assert.equal(astra.model,'gpt-6-astra');
for(const result of [local,astra])assert.match(result.answer,/view|render|shad|marker|presentation/i);
writeFileSync('artifacts/presentation-ai-report.json',JSON.stringify({local,astra},null,2));console.log(JSON.stringify({local:local.answer,astra:astra.answer}));
