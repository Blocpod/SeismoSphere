import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {prospectiveContext} from '../server/prospective.mjs';
import {chat} from '../server/ai.mjs';
const file='artifacts/prospective-ai-report.json';
function verify(report){for(const row of report){assert.deepEqual(row.result.actions,[]);assert.equal(row.result.provider,row.provider);if(row.provider==='codex')assert.equal(row.result.model,'gpt-6-astra');assert.match(row.result.answer,/DS/i);assert.match(row.result.answer,/recent.rate/i);if(row.kind==='scored'){assert.match(row.result.answer,/100(?:\.00)?\s*(?:percentage points|pp)/i);assert.match(row.result.answer,/synthetic|fixture|software.acceptance/i);}else assert.match(row.result.answer,/unavailable|not available|cannot (?:yet )?(?:be )?(?:compute|calculate)|no complete(?:ly assessed)? (?:issuance )?groups/i);assert.match(row.result.answer,/not|no |cannot|doesn't|does not/i);}}
if(process.argv.includes('--verify-saved')){verify(JSON.parse(readFileSync(file,'utf8')));console.log('Saved prospective local/Astra answers verified.');}else{
 const {config}=await(await fetch('http://127.0.0.1:4318/api/status')).json(),report=[];
 for(const kind of ['scored','empty']){const view=JSON.parse(readFileSync(`artifacts/prospective-${kind}-fixture.json`,'utf8')),context={asOf:Date.now(),mode:'catalog-replay',prospectiveExperiment:prospectiveContext(view,Date.now()),candidates:[],selected:null};
  for(const provider of ['ollama','codex']){const result=await chat('Explain this registered experiment. State the exact operational group counts, primary comparison in percentage points if available, fixed assessment delay, and limitations. A synthetic software acceptance fixture cannot establish real-world skill.',context,{...config,aiProvider:provider});report.push({kind,provider,context,result});writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({kind,provider,model:result.model,answer:result.answer}));}
 }
 verify(report);
}
