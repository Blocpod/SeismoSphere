import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {detectionContext} from '../server/detection-context.mjs';
import {chat,commandActions} from '../server/ai.mjs';
const review={id:'review',createdAt:20,report:{domain:{start:1,end:10,provider:'USGS',minMagnitude:4.5,bounds:null},eligibleEvents:['a','b'],engines:[{engine:'DS',events:2,coveredEvents:1,missedEvents:1,forecasts:3,emptyForecasts:2,eventRecall:.5,emptyForecastFraction:2/3}],policy:'Fixture policy'}};
const reviews={get:()=>review};
test('detection explanations enforce cutoff, exact counts and action isolation',async t=>{
 assert.throws(()=>detectionContext(reviews,'review',19),/unavailable/);assert.throws(()=>detectionContext(reviews,'review',NaN),/cutoff/);
 const evidence=detectionContext(reviews,'review',30,'strict'),context={detectionEvidence:evidence};assert.match(evidence.sentences[1],/1\/2 events covered, 1 missed; 2\/3 forecasts empty/);
 assert.deepEqual(commandActions('Show global forecasts and deep events',context),[]);assert.match((await chat('Explain',context,{aiProvider:'deterministic'})).answer,/different denominators/);
 let answer=evidence.sentences.join(' ');t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({answer,actions:['global']})}})}));
 assert.deepEqual((await chat('Explain',context,{aiProvider:'ollama',localModel:'fixture'})).actions,[]);
 answer=answer.replace('1/2','2/2');await assert.rejects(chat('Explain',context,{aiProvider:'ollama',localModel:'fixture'}),/did not preserve/);
});

test('coverage explanations suppress delayed answers after selection or cutoff changes',async()=>{
 const source=readFileSync('public/experiment-history.js','utf8'),start=source.indexOf('   explain.onclick=async()=>{'),end=source.indexOf('   const events=new Map',start),handler=source.slice(start,end);
 for(const change of ['none','selection','cutoff','mode','error']){
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),state={live:false,asOf:30,mode:'strict'},answer={textContent:''},explain={};
  const bind=new Function('api','getState','answer','explain','data',`let detectionSerial=0;${handler};return {run:explain.onclick,invalidate:()=>detectionSerial++};`),controls=bind(()=>promise,()=>state,answer,explain,{id:'review'}),pending=controls.run();
  if(['selection','error'].includes(change))controls.invalidate();if(change==='cutoff')state.asOf=29;if(change==='mode')state.mode='catalog-replay';
  if(change==='error')reject(new Error('late error'));else resolve({model:'fixture',grounded:false,answer:'saved result'});await pending;
  assert.equal(answer.textContent.includes('saved result'),change==='none');assert.equal(explain.disabled,false);assert.doesNotMatch(answer.textContent,/late error/);
 }
});
