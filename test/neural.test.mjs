import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fingerprint,neuralAnalogues} from '../server/neural.mjs';
import {DAY} from '../server/geo.mjs';
test('neural sequence fingerprints exclude outcomes and geographic names',()=>{
  const s={id:'source',time:50*DAY,lat:0,lon:0,mag:5,depth:400,place:'Do not encode me'};
  const earlier={...s,id:'before',time:49*DAY,lon:5,mag:4};const future={...s,id:'after',time:51*DAY,mag:9};
  const a=fingerprint(s,[earlier]),b=fingerprint(s,[earlier,future]);assert.deepEqual(a,b);assert.equal(a.nodeCount,2);assert.ok(!a.text.includes('Do not encode me'));assert.ok(a.nodeIds.includes('before'));assert.ok(!a.nodeIds.includes('after'));
});

import {analogues} from '../server/engine.mjs';

test('both analogue searches reject invalid sources and exclude foreign or non-earthquake outcomes',async t=>{
 const source={id:'s',provider:'USGS',type:'earthquake',lat:0,lon:0,time:100*DAY,mag:5,depth:400},old={...source,id:'old',time:50*DAY},follow={...source,id:'follow',time:51*DAY,mag:4.5},excluded=[{...old,id:'foreign',provider:'EMSC'},{...old,id:'deleted',status:'deleted'},{...old,id:'blast',type:'explosion'},{...follow,id:'future',time:110*DAY},{...follow,id:'blast-follow',type:'explosion',mag:9},{...follow,id:'foreign-follow',provider:'EMSC',mag:9}];
 assert.deepEqual(analogues(source,[old,follow,...excluded],100*DAY),analogues(source,[old,follow],100*DAY));
 for(const invalid of [{...source,type:'explosion'},{...source,status:'deleted'},{...source,time:101*DAY}]){
  assert.throws(()=>analogues(invalid,[],100*DAY),/Select a non-deleted catalog earthquake/);
  await assert.rejects(neuralAnalogues(invalid,[],100*DAY,{}),/Select a non-deleted catalog earthquake/);
 }
 const cache=new Map();t.mock.method(globalThis,'fetch',async(url,options)=>({ok:true,json:async()=>url.endsWith('/api/tags')?{models:[{name:'nomic-embed-text:latest',digest:'test'}]}:{embeddings:JSON.parse(options.body).input.map(()=>[1,0])}}));
 const result=await neuralAnalogues(source,[old,follow,...excluded],100*DAY,{get:k=>cache.get(k),set:(k,v)=>cache.set(k,v)});
 assert.ok(result.matches.every(m=>!['foreign','deleted','blast'].includes(m.source.id)));
 const match=result.matches.find(m=>m.source.id==='old');assert.equal(match.followUps,1);assert.equal(match.largest,4.5);
});
