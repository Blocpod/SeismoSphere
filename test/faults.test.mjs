import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestOnSegment,buildFaultIndex,nearestFaults,EARTH_KM} from '../public/fault-geometry.js';
import {faultContext} from '../server/fault-context.mjs';
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('surface segment distances resolve interiors, endpoints, antimeridian, poles and degenerate traces',()=>{
  const r=nearestOnSegment({lat:10,lon:5},{lat:0,lon:0},{lat:0,lon:10});close(r.distanceKm,EARTH_KM*Math.PI/18);close(r.point.lat,0);close(r.point.lon,5);
  const endpoint=nearestOnSegment({lat:0,lon:15},{lat:0,lon:0},{lat:0,lon:10});close(endpoint.distanceKm,EARTH_KM*Math.PI/36);close(endpoint.point.lon,10);
  const dateLine=nearestOnSegment({lat:1,lon:180},{lat:0,lon:179},{lat:0,lon:-179});close(dateLine.distanceKm,EARTH_KM*Math.PI/180);close(Math.abs(dateLine.point.lon),180);
  const pole=nearestOnSegment({lat:90,lon:0},{lat:80,lon:0},{lat:80,lon:180});close(pole.distanceKm,0);
  const zero=nearestOnSegment({lat:1,lon:0},{lat:0,lon:0},{lat:0,lon:0});close(zero.distanceKm,EARTH_KM*Math.PI/180);
  const ambiguous=nearestOnSegment({lat:0,lon:90},{lat:0,lon:0},{lat:0,lon:180});assert.equal(ambiguous.ambiguous,true);
});
test('nearest fault search ranks whole traces, keeps duplicate IDs distinct and observes distance bounds',()=>{
  const lines=[[[0,0],[10,0]],[[0,2],[10,2]],[[170,0],[-170,0]],[[0,30],[10,30]],[[0,0],[10,0]]];
  const features=lines.map(coordinates=>({properties:{catalog_id:'duplicate'},geometry:{type:'LineString',coordinates}}));const index=buildFaultIndex(features);
  const r=nearestFaults(index,{lat:1,lon:5},6,500);assert.deepEqual(r.map(x=>x.featureIndex).sort((a,b)=>a-b),[0,1,4]);assert.equal(nearestFaults(index,{lat:1,lon:5},6,10).length,0);
  assert.equal(nearestFaults(index,{lat:1,lon:179},1,500)[0].featureIndex,2);
  assert.throws(()=>nearestFaults(index,{lat:91,lon:0}),/Invalid/);
});
test('copilot excludes a geological dataset received after the historical cutoff',async()=>{
  const context=await faultContext({id:'old-event',lat:37.8,lon:-122},Date.parse('2011-03-01T00:00:00Z'));
  assert.equal(context.available,false);assert.equal(context.matches,undefined);
  // A missing optional dataset is also unavailable, never a fabricated reference.
  assert.match(context.reason,/received after|reference unavailable/);
});
