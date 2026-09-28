import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundaryIndex,nearestBoundary} from '../server/boundary-context.mjs';
import {fingerprint} from '../server/neural.mjs';
import {distance} from '../server/geo.mjs';
const feature=(id,start,end,type='SUB')=>({properties:{SEQNUM:id,STARTLAT:start.lat,STARTLONG:start.lon,FINALLAT:end.lat,FINALLONG:end.lon,STEPCLASS:type,PLATEBOUND:'test'}});
test('boundary proximity uses bounded spherical steps across dateline, caps and opposite hemisphere',()=>{
 const steps=boundaryIndex([feature(1,{lat:0,lon:179},{lat:0,lon:-179})]);
 const center=nearestBoundary({lat:1,lon:180},steps);assert.ok(Math.abs(center.distanceKm-distance({lat:0,lon:180},{lat:1,lon:180}))<1e-6);assert.equal(center.type,'SUB');
 const cap=nearestBoundary({lat:0,lon:175},steps);assert.ok(Math.abs(cap.distanceKm-distance({lat:0,lon:175},{lat:0,lon:179}))<1e-6);
 const opposite=boundaryIndex([feature(2,{lat:0,lon:0},{lat:0,lon:5},'OTF')]);assert.ok(Math.abs(nearestBoundary({lat:0,lon:-179},opposite).distanceKm-distance({lat:0,lon:-179},{lat:0,lon:5}))<1e-6);
 assert.throws(()=>boundaryIndex([feature(3,{lat:0,lon:0},{lat:0,lon:1},'invented')]),/Invalid/);
});
test('neural graph encodes sourced geological class independently of experimental routes',()=>{
 const e={id:'s',lat:0,lon:0,time:100,mag:5,depth:20},steps=boundaryIndex([feature(1,{lat:0,lon:-1},{lat:0,lon:1},'CTF')]),graph=fingerprint(e,[],null,{steps});
 assert.equal(graph.boundaryContext[0].type,'CTF');assert.equal(graph.boundaryContext[0].stepId,1);assert.equal(graph.routeContext.version,null);assert.match(graph.text,/continental transform fault/);
 assert.deepEqual(fingerprint(e,[],null).boundaryContext,[{node:0}]);
 assert.deepEqual(fingerprint(e,[{...e,id:'future',time:101}],null,{steps}),graph);
});
