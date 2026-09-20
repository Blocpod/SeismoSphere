import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {statisticalContext} from '../server/statistical-context.mjs';
import {chat} from '../server/ai.mjs';
const root='http://127.0.0.1:4318',status=await(await fetch(root+'/api/status')).json(),{runs}=await(await fetch(root+'/api/statistical-runs?family=spatial')).json(),run=runs[0];assert.ok(run);assert.equal(status.config.aiProvider,'ollama');
const message='Explain the selected spatial ETAS map: its units, what the 7-day total includes and excludes, and the fitted parameter-bound warning. Do we have holdout results available at this analysis cutoff? Do not use outside earthquake knowledge.';
const start=Date.now(),response=await fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,asOf:run.fit.options.end,mode:'catalog-replay',statisticalRunId:run.id,horizonDays:7}),signal:AbortSignal.timeout(190000)}),local=await response.json();assert.equal(response.status,200,JSON.stringify(local));assert.equal(local.provider,'ollama');
const context={asOf:run.fit.options.end,mode:'catalog-replay',statisticalModel:statisticalContext(run,run.fit.options.end,7),candidates:[],selected:null},astraStart=Date.now(),astra=await chat(message,context,{...status.config,aiProvider:'codex'});
const report={runId:run.id,localElapsedMs:astraStart-start,astraElapsedMs:Date.now()-astraStart,context,local,astra};writeFileSync('artifacts/spatial-ai-report.json',JSON.stringify(report,null,2));
for(const result of [local,astra]){assert.match(result.answer,/cascad|descendant|future parent/i);assert.match(result.answer,/withheld|withhold|not available|unavailable|not yet|not exposed|no holdout/i);assert.doesNotMatch(result.answer,/1,?504|5\.711|8\.820/);assert.equal(result.actions.includes('explain'),false);}
console.log(JSON.stringify({runId:run.id,localElapsedMs:report.localElapsedMs,astraElapsedMs:report.astraElapsedMs,local:local.answer,astra:astra.answer}));
