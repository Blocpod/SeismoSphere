import test from 'node:test';
import assert from 'node:assert/strict';
import {swarms} from '../server/engine.mjs';
import {DAY,distance} from '../server/geo.mjs';
test('swarm summaries retain geometry, equal-window rate and centroid depth change',()=>{
 const events=Array.from({length:5},(_,i)=>({id:String(i),lat:1,lon:i<2?.1:1.1,depth:i<2?10:20,time:(i<2?1:8)*DAY,mag:2})),before=structuredClone(events);
 const [s]=swarms(events,{start:0,end:10*DAY});
 assert.equal(s.count,5);assert.ok(Math.abs(s.diameterKm-distance(events[0],events[4]))<1e-9);
 assert.equal(s.rate.earlyPerDay,.4);assert.equal(s.rate.latePerDay,.6);assert.equal(s.rate.changePerDay,.2);
 assert.equal(s.migration.depthChangeKm,10);assert.ok(Math.abs(s.migration.bearingDegrees-90)<.1);assert.deepEqual(events,before);
 const [same]=swarms(events.map(e=>({...e,time:0})));assert.equal(same.rate.changePerDay,null);assert.equal(same.migration.distanceKm,null);
 assert.equal(swarms(events.slice(0,4)).length,0);
});
