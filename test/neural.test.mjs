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


test('sequence graph v2 encodes prior midpoint support and equal-window activity without outcome leakage',()=>{
 const source={id:'source',time:100*DAY,lat:0,lon:0,mag:6,depth:400},e=(id,lon,time,depth)=>({...source,id,lon,time:time*DAY,depth,mag:5});
 const events=[e('west',-5,92,10),e('east',5,99,10),e('early',-1,93,10),e('late',1,99,20)],graph=fingerprint(source,events);
 assert.equal(graph.version,'relative-sequence-graph-4');assert.equal(graph.activity.earlyPerDay,.2);assert.equal(graph.activity.latePerDay,.2);assert.equal(graph.activity.depthChangeKm,10);
 const pair=graph.midpointStructure.find(m=>m.endpoints.map(i=>graph.nodeIds[i]).sort().join(',')==='east,west');assert.ok(pair.supportIds.includes('source'));assert.ok(pair.supportIds.includes('early'));assert.ok(pair.supportIds.includes('late'));
 assert.deepEqual(fingerprint(source,[...events,e('outcome',0,101,30)]),graph);
 assert.equal(fingerprint(source,[]).activity.depthChangeKm,null);
});


test('route graph encoding follows explicit directed links and preserves illustrative provenance',()=>{
 const source={id:'source',time:100*DAY,lat:0,lon:0,mag:6,depth:400},prior={...source,id:'prior',lon:10,time:99*DAY};
 const route=(id,points,next=[],termination=false)=>({id,points:points.map(lon=>({lat:0,lon})),next,termination,kind:'research-corridor',direction:'forward',provenance:{status:'illustrative'}});
 const network={version:'frozen',createdAt:101*DAY,captureKm:50,maxHops:4,routes:[route('a',[0,5],['b']),route('b',[5,10],[],true)]};
 const graph=fingerprint(source,[prior],network),context=graph.routeContext;
 assert.equal(context.version,'frozen');assert.equal(context.retrospective,true);
 const trigger=context.nodes.find(n=>graph.nodeIds[n.node]==='source');
 assert.ok(trigger.reached.some(r=>graph.nodeIds[r.node]==='prior'&&r.hops===2&&r.routeIds.join(',')==='a,b'));
 assert.ok(trigger.routes.every(r=>r.provenance.status==='illustrative'));
 const disconnected=structuredClone(network);disconnected.routes[0].next=[];
 assert.equal(fingerprint(source,[prior],disconnected).routeContext.nodes.find(n=>n.node===trigger.node).reached.length,0);
 assert.notEqual(fingerprint(source,[prior],disconnected).text,graph.text);
 assert.deepEqual(fingerprint(source,[prior,{...prior,id:'future',time:101*DAY}],network),graph);
 assert.equal(fingerprint(source,[prior]).routeContext.version,null);
});
