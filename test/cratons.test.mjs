import test from 'node:test';
import assert from 'node:assert/strict';
import {cratonEvidence} from '../server/cratons.mjs';
import {chat,commandActions} from '../server/ai.mjs';
test('craton evidence preserves source distinctions and withholds later reference knowledge',async()=>{
 const at=Date.UTC(2026,8,13),data={provenance:{retrievedAt:new Date(at).toISOString(),policy:'Retained internal province edges; no pressure or thickness measurement.'},featuresSha256:'test',features:[{id:'craton-0',properties:{prov_name:'Limpopo Belt',prov_type:'shield',prov_group:'Kalahari Craton',reworked:'yes',FROMAGE:9999,TOAGE:-999},geometry:{coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}}]};
 assert.throws(()=>cratonEvidence(data,'craton-0',at-1),/cutoff/);assert.throws(()=>cratonEvidence(data,'craton-0',NaN),/cutoff/);assert.throws(()=>cratonEvidence(data,'missing',at),/not found/);const evidence=cratonEvidence(data,'craton-0',at);assert.equal(evidence.attributes.reworked,'yes');assert.equal(evidence.attributes.FROMAGE,9999);assert.equal(evidence.boundaryRings,1);assert.equal(evidence.boundaryVertices,4);
 const answer=await chat('Explain this source',{cratonEvidence:evidence},{aiProvider:'deterministic'});assert.match(answer.answer,/Limpopo Belt/);assert.match(answer.answer,/reworking: yes/);assert.equal(answer.actions.includes('explain'),false);assert.ok(answer.actions.includes('cratons'));assert.deepEqual(commandActions('Show cratons'),['cratons']);
});
