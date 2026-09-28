import assert from 'node:assert/strict';
import {chat} from '../server/ai.mjs';
import {crustSample} from '../server/crust.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
const context={asOf:Date.now(),mode:'catalog-replay',crustEvidence:await crustSample(5.5,150.5),candidates:[],selected:null},config=JSON.parse(readFileSync('config/default.json','utf8')),results={};
for(const aiProvider of ['ollama','codex']){
 results[aiProvider]=await chat('Explain this sourced crust column and its limitations.',context,{...config,aiProvider});
 assert.equal(results[aiProvider].provider,aiProvider);assert.deepEqual(results[aiProvider].actions,[]);assert.match(results[aiProvider].answer,/11\.46/);
 console.log(aiProvider+': '+results[aiProvider].answer);
 writeFileSync('artifacts/crust-ai-check.json',JSON.stringify({context,results},null,2));
}
