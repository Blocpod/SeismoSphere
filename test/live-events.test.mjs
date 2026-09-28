import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveEventTracker} from '../public/live-events.js';
test('live source notices exclude initial catalogs, revisions, delayed historical arrivals and replay',()=>{
 const tracker=new LiveEventTracker(),event=(id,time,extra={})=>({id,time,type:'earthquake',mag:5,depth:400,...extra}),options=now=>({live:true,provider:'USGS',now,feed:{status:'live',fetchedAt:now},triggerDepth:300,minMagnitude:4.5});
 assert.deepEqual(tracker.update([event('initial',90),event('revision',95,{mag:2})],options(100)),[]);
 const next=[event('initial',90),event('revision',95,{mag:6}),event('late',99),event('new',101),event('large',102,{mag:6}),event('shallow',103,{depth:5}),event('explosion',103,{type:'explosion'}),event('future',1000)];
 assert.deepEqual(tracker.update(next,options(110)).map(e=>e.id),['large','new']);
 assert.deepEqual(tracker.update(next,options(111)),[]);
 assert.deepEqual(tracker.update(next,{...options(112),live:false}),[]);
 assert.deepEqual(tracker.update([...next,event('during-replay',113)],options(120)),[]);
 assert.deepEqual(tracker.update([event('provider-switch',121)],{...options(122),provider:'EMSC'}),[]);
});
test('stale or future feed receipts do not arm monitoring or announce events',()=>{
 const tracker=new LiveEventTracker(),e={id:'new',type:'earthquake',time:2,depth:300,mag:4.5},o={live:true,provider:'USGS',now:1,triggerDepth:300,minMagnitude:4.5};
 for(const feed of [{status:'stale',fetchedAt:1},{status:'live',fetchedAt:2},{status:'live',fetchedAt:-900000}])assert.deepEqual(tracker.update([],{...o,feed}),[]);
 assert.equal(tracker.started,null);
 tracker.update([],{...o,feed:{status:'live',fetchedAt:1}});
 assert.deepEqual(tracker.update([e],{...o,now:3,feed:{status:'stale',fetchedAt:1}}),[]);
 assert.deepEqual(tracker.update([e],{...o,now:4,feed:{status:'live',fetchedAt:4}}),[e]);
});
