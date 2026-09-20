import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chat} from '../server/ai.mjs';
import {completenessContext} from '../server/completeness.mjs';
const root='http://127.0.0.1:4318',status=await(await fetch(root+'/api/status')).json(),runs=await(await fetch(root+'/api/catalog-diagnostics')).json(),run=runs.runs.find(r=>r.options.magType==='all'&&r.events===5474);assert.ok(run);assert.equal(status.config.aiProvider,'ollama');
const {chromium}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage();let local,question;
const start=Date.now();
try{
  await page.goto(root);await page.locator('.event-row').first().waitFor();await page.locator('[data-view="research"]').click();await page.locator('#completeness-chart svg').waitFor();await page.locator('#completeness-history').selectOption(run.id);await page.locator('#completeness-form [name="magType"]').selectOption('all');await page.locator('#completeness-form button').click();await page.locator('#completeness-status').filter({hasText:/saved|Loaded/}).waitFor();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'),{timeout:190000});await page.locator('#completeness-explain').click();const r=await response;question=r.request().postDataJSON();local=await r.json();assert.equal(r.status(),200,JSON.stringify(local));assert.equal(question.diagnosticRunId,run.id);assert.equal(question.analysisId,undefined);assert.equal(question.forecastId,undefined);assert.equal(local.provider,'ollama');await page.locator('#completeness-explanation').filter({hasText:'AI EXPLANATION'}).waitFor();
}finally{await browser.close();}
const context={asOf:run.options.end,mode:'catalog-replay',catalogDiagnostic:completenessContext(run,run.options.end),candidates:[],selected:null},astraStart=Date.now(),astra=await chat(question.message,context,{...status.config,aiProvider:'codex'}),report={runId:run.id,context,local,astra,localElapsedMs:astraStart-start,astraElapsedMs:Date.now()-astraStart};
writeFileSync('artifacts/completeness-ai-report.json',JSON.stringify(report,null,2));
for(const result of [local,astra]){assert.match(result.answer,/5\.1/);assert.match(result.answer,/4\.8/);assert.match(result.answer,/not|cannot|doesn.t/i);assert.match(result.answer,/cluster|missing|conditional|IID/i);assert.equal(result.actions.includes('explain'),false);}
for(const [asOf,mode]of [[run.options.end-1,'catalog-replay'],[run.options.end,'strict']]){const r=await fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...question,asOf,mode})});assert.equal(r.status,400);}
console.log(JSON.stringify({runId:run.id,local:local.answer,astra:astra.answer,localElapsedMs:report.localElapsedMs,astraElapsedMs:report.astraElapsedMs}));
