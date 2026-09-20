import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {learnedContext} from '../server/learned.mjs';
import {chat} from '../server/ai.mjs';
const root='http://127.0.0.1:4318',status=await(await fetch(root+'/api/status')).json(),{runs}=await(await fetch(root+'/api/learned-runs')).json(),run=runs[0];assert.ok(run);assert.equal(status.config.aiProvider,'ollama');
const cutoff=Date.UTC(2020,0,1),message='Explain this learned cell-graph map: units, spatial precision, when weights and checkpoints were selected. Can you see the 2020–2025 test results at this 2020-01-01 cutoff? Use only supplied evidence.';
const start=Date.now(),response=await fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,asOf:cutoff,mode:'catalog-replay',learnedRunId:run.id}),signal:AbortSignal.timeout(190000)}),local=await response.json();assert.equal(response.status,200,JSON.stringify(local));assert.equal(local.provider,'ollama');
const p=await(await fetch(root+'/api/learned-predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:run.id,cutoff:'2020-01-01',mode:'catalog-replay'})})).json();
const context={asOf:cutoff,mode:'catalog-replay',learnedModel:learnedContext(run,p.projection,cutoff,'catalog-replay'),candidates:[],selected:null},astraStart=Date.now(),astra=await chat(message,context,{...status.config,aiProvider:'codex'});
const report={runId:run.id,localElapsedMs:astraStart-start,astraElapsedMs:Date.now()-astraStart,context,local,astra};writeFileSync('artifacts/learned-ai-report.json',JSON.stringify(report,null,2));
for(const result of [local,astra]){assert.match(result.answer,/count|expected.{0,100}events/i);assert.match(result.answer,/withheld|cannot|not available|unavailable|not yet|not supplied|not see|no.*test/i);assert.doesNotMatch(result.answer,/10,?785|0\.190|0\.1895|17,?637/);assert.equal(result.actions.includes('explain'),false);}
const strict=await fetch(root+'/api/learned-predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:run.id,cutoff:'2020-01-01',mode:'strict'})});assert.equal(strict.status,400);assert.match((await strict.json()).error,/unavailable/);
console.log(JSON.stringify({runId:run.id,localElapsedMs:report.localElapsedMs,astraElapsedMs:report.astraElapsedMs,local:local.answer,astra:astra.answer,strictRejected:true}));
