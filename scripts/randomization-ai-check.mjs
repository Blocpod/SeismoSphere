import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chat} from '../server/ai.mjs';
import {randomizationContext} from '../server/randomization.mjs';
const root='http://127.0.0.1:4318',saved=JSON.parse(readFileSync('artifacts/chromium-randomization.json')),run=saved.report,status=await(await fetch(root+'/api/status')).json();
assert.equal(status.config.aiProvider,'ollama');
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage();let local,question;
const start=Date.now();
try{
 await page.goto(root);await page.locator('.event-row').first().waitFor();await page.getByRole('button',{name:'Research lab',exact:true}).click();await page.locator('#randomization-history').selectOption(run.id);await page.locator('#randomization-explain').waitFor();
 const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'),{timeout:190000});await page.locator('#randomization-explain').click();const r=await response;question=r.request().postDataJSON();local=await r.json();assert.equal(r.status(),200,JSON.stringify(local));assert.equal(question.randomizationRunId,run.id);assert.equal(question.analysisId,undefined);assert.equal(local.provider,'ollama');await page.locator('#randomization-explanation').filter({hasText:'AI EXPLANATION'}).waitFor();await page.screenshot({path:'artifacts/randomization-local-ai.png'});
}finally{await browser.close();}
const context={asOf:run.options.end,mode:'catalog-replay',randomization:randomizationContext(run,run.options.end),candidates:[],selected:null},astraStart=Date.now(),astra=await chat(question.message,context,{...status.config,aiProvider:'codex'}),report={runId:run.id,context,local,astra,localElapsedMs:astraStart-start,astraElapsedMs:Date.now()-astraStart};
writeFileSync('artifacts/randomization-ai-report.json',JSON.stringify(report,null,2));
for(const result of [local,astra]){assert.match(result.answer,/0\.28|28%/);assert.match(result.answer,/27\s*(?:hits)?\s*\/\s*95|27 hits (?:from|out of) 95/i);assert.match(result.answer,/56\s*(?:hits)?\s*\/\s*95|56 hits (?:from|out of) 95/i);assert.match(result.answer,/prospective/i);assert.match(result.answer,/exchangeab|aftershock|cluster/i);assert.equal(result.actions.includes('explain'),false);}
for(const override of [{asOf:run.options.end-1},{mode:'strict'},{mode:'invalid'},{forecastId:'unrelated'},{diagnosticRunId:'unrelated'}]){const r=await fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...question,...override})});assert.equal(r.status,400);}
console.log(JSON.stringify({runId:run.id,local:local.answer,astra:astra.answer,localElapsedMs:report.localElapsedMs,astraElapsedMs:report.astraElapsedMs}));
