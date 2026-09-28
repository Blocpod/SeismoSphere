import test from 'node:test';
import assert from 'node:assert/strict';
import {learnedContext} from '../server/learned.mjs';
import {chat} from '../server/ai.mjs';
test('ensemble explanations preserve selected weights and reject altered facts',async()=>{
 const projection={model:'ensemble',cutoff:1767225600000,totalExpectedCount:34.7712,ensembleWeights:{graph:.4,noNeighbors:.2,trainingMean:.2,recentRate:.2}};
 const report={options:{validationEnd:1577836800000},scores:{},limitations:[],ensemble:{trials:[{weights:[.4,.1,.4,.1]}]}};
 const learnedModel=learnedContext(report,projection,projection.cutoff,'catalog-replay'),context={learnedModel};
 assert.equal(learnedModel.ensemble.trials,undefined);
 const deterministic=await chat('Explain the model',context,{aiProvider:'deterministic'});
 assert.match(deterministic.answer,/weighted ensemble.*34.77/s);assert.match(deterministic.answer,/cell graph 40%, no-neighbor model 20%, training mean 20%, recent rate 20%/);assert.deepEqual(deterministic.actions,[]);
 const oldFetch=globalThis.fetch;let answer=deterministic.answer;
 globalThis.fetch=async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({answer,actions:['research']})}})});
 try{
  const result=await chat('Explain the model',context,{aiProvider:'ollama'});assert.deepEqual(result.actions,[]);
  answer=answer.replace('cell graph 40%','cell graph 10%');await assert.rejects(chat('Explain the model',context,{aiProvider:'ollama'}),/did not preserve/);
 }finally{globalThis.fetch=oldFetch;}
});
