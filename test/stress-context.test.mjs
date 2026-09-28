import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../server/store.mjs';
import {stressContext} from '../server/stress-context.mjs';
import {chat,commandActions} from '../server/ai.mjs';
const seal=body=>({...body,id:hash(body)});
function fixture(){
 const source=seal({raw:'source',receipt:{sha256:hash('source')},event:{time:1,place:'fixture'},product:{updateTime:2,status:'UPDATE'},createdAt:3});
 const record=seal({sourceId:source.id,sourceHash:source.receipt.sha256,createdAt:4,implementation:'code',implementationHash:hash('code'),options:{receiver:{strike:19,dip:19,rake:90},friction:.4},report:{solver:'fixture',points:[[-1,1],[1,1],[-1,-1],[1,-1]].map(([xKm,yKm])=>({xKm,yKm,depthKm:10})),values:[null,...[1,2,3].map(v=>({coulombPa:v*1e6,shearPa:2e6,unclampingPa:-1e6}))]}});
 const baseline=seal({...Object.fromEntries(Object.entries(record).filter(([k])=>k!=='id')),createdAt:5});
 return {source,record,baseline,inputs:{get:()=>source,stress:id=>id===baseline.id?baseline:record}};
}
test('stress AI evidence verifies immutable sources, cutoff, sample and comparison',()=>{
 const {inputs,record,baseline,source}=fixture();
 const e=stressContext(inputs,record.id,null,1,10,'strict');assert.match(e.sourceSentence,/Coulomb 1.00000 MPa/);
 assert.match(stressContext(inputs,record.id,null,0,10,'strict').sourceSentence,/Masked/);
 assert.match(stressContext(inputs,record.id,baseline.id,1,10,'strict').sourceSentence,/Current minus baseline: Coulomb 0.00000/);
 assert.throws(()=>stressContext(inputs,record.id,baseline.id,1,4,'catalog-replay'),/unavailable/);
 assert.throws(()=>stressContext(inputs,record.id,null,-1,10,'strict'),/valid stress sample/);
 source.raw='changed';assert.throws(()=>stressContext(inputs,record.id,null,1,10,'strict'),/integrity/);
});
test('stress explanations cannot execute actions or change saved numerical evidence',async t=>{
 const {inputs,record}=fixture(),e=stressContext(inputs,record.id,null,1,10,'strict'),context={stressEvidence:e};
 assert.deepEqual(commandActions('Show deep earthquakes and forecasts',context),[]);
 assert.match((await chat('Explain',context,{aiProvider:'deterministic'})).answer,/1.00000 MPa/);
 let answer=e.sourceSentence+' '+e.receiverSentence+' '+e.interpretationSentence;
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({answer,actions:['global']})}})}));
 assert.deepEqual((await chat('Explain',context,{aiProvider:'ollama',localModel:'fixture'})).actions,[]);
 answer=answer.replace('1.00000','9.00000');await assert.rejects(chat('Explain',context,{aiProvider:'ollama',localModel:'fixture'}),/did not preserve/);
});
