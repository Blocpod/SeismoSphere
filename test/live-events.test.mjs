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

test('visible notice follows corrections and clears on retraction, threshold changes, or stale data',()=>{
 const tracker=new LiveEventTracker(),o={live:true,provider:'USGS',now:10,feed:{status:'live',fetchedAt:10},triggerDepth:300,minMagnitude:4.5};
 tracker.update([],o);o.now=20;
 const event={id:'observed',time:15,type:'earthquake',depth:400,mag:5,place:'original'};
 tracker.update([event],o);assert.equal(tracker.current,event);
 const corrected={...event,mag:4.8,depth:350,place:'corrected'};
 assert.deepEqual(tracker.update([corrected],o),[]);assert.equal(tracker.current,corrected);
 tracker.update([{...corrected,mag:4}],o);assert.equal(tracker.current,null);
 tracker.update([corrected],o);assert.equal(tracker.current,null); // Revision is not a new arrival.
 tracker.update([{...event,id:'second'}],o);assert.equal(tracker.current.id,'second');
 tracker.update([],o);assert.equal(tracker.current,null);
 tracker.update([{...event,id:'third'}],o);tracker.update([{...event,id:'third'}],{...o,triggerDepth:500});assert.equal(tracker.current,null);
 tracker.update([{...event,id:'fourth'}],o);tracker.update([{...event,id:'fourth'}],{...o,feed:{status:'stale',fetchedAt:10}});assert.equal(tracker.current,null);
});
