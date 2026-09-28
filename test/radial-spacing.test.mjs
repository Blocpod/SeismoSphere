import test from 'node:test';
import assert from 'node:assert/strict';
import {radialSpacing,discoverRadialSpacing} from '../public/radial-geometry.js';
import {destination} from '../server/geo.mjs';
test('radial spacing crosses the dateline and excludes future, prior and foreign events',()=>{
 const source={id:'source',lat:0,lon:179,time:100,provider:'USGS',type:'earthquake'},event=(id,km,time=200)=>({...source,...destination(source,90,km),id,time}),events=[source,event('near',1000),event('second',2000),event('outside',1300),event('future',1000,400),event('prior',1000,50),{...event('foreign',1000),provider:'EMSC'},{...event('deleted',1000),status:'deleted'}];
 const result=radialSpacing(source,events,{asOf:300,spacingKm:1000,ringCount:3,tolerance:.1});
 assert.equal(result.matchedEvents,2);assert.equal(result.eligibleEvents.length,3);assert.equal(result.rings[0].matches[0].event.id,'near');assert.ok(Math.abs(result.rings[1].matches[0].distanceKm-2000)<1e-8);
 assert.deepEqual(radialSpacing(source,[...events,event('more-future',2000,500)],{asOf:300,spacingKm:1000,ringCount:3,tolerance:.1}),result);
 assert.throws(()=>radialSpacing(source,events,{asOf:300,spacingKm:3000,ringCount:6}),/10,000/);
 assert.equal(radialSpacing(source,[],{asOf:300}).matchedEvents,0);
});


test('automatic concentric discovery recovers repeated spacing without future or foreign leakage',()=>{
 const source={id:'source',lat:0,lon:179,time:100,mag:6,depth:500,provider:'USGS',type:'earthquake'},events=[source,...Array.from({length:6},(_,i)=>({...source,...destination(source,60,(i+1)*1000),id:'later'+i,time:200+i,mag:4,depth:10}))],before=structuredClone(events);
 const report=discoverRadialSpacing(events,{asOf:300});assert.equal(report.testedSources,1);assert.equal(report.results.length,1);assert.equal(report.results[0].spacingKm,1000);assert.equal(report.results[0].occupiedRings,6);assert.equal(report.results[0].matchedEvents,6);assert.deepEqual(events,before);
 assert.deepEqual(discoverRadialSpacing([...events,{...source,id:'future',time:400,mag:9},{...source,id:'blast',type:'explosion',mag:9}],{asOf:300}),report);
 assert.equal(discoverRadialSpacing(events.slice(0,3),{asOf:300}).results.length,0);
 assert.equal(discoverRadialSpacing(events,{asOf:300,triggerDepth:600}).testedSources,0);
});
