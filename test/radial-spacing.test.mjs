import test from 'node:test';
import assert from 'node:assert/strict';
import {radialSpacing} from '../public/radial-geometry.js';
import {destination} from '../server/geo.mjs';
test('radial spacing crosses the dateline and excludes future, prior and foreign events',()=>{
 const source={id:'source',lat:0,lon:179,time:100,provider:'USGS',type:'earthquake'},event=(id,km,time=200)=>({...source,...destination(source,90,km),id,time}),events=[source,event('near',1000),event('second',2000),event('outside',1300),event('future',1000,400),event('prior',1000,50),{...event('foreign',1000),provider:'EMSC'},{...event('deleted',1000),status:'deleted'}];
 const result=radialSpacing(source,events,{asOf:300,spacingKm:1000,ringCount:3,tolerance:.1});
 assert.equal(result.matchedEvents,2);assert.equal(result.eligibleEvents.length,3);assert.equal(result.rings[0].matches[0].event.id,'near');assert.ok(Math.abs(result.rings[1].matches[0].distanceKm-2000)<1e-8);
 assert.deepEqual(radialSpacing(source,[...events,event('more-future',2000,500)],{asOf:300,spacingKm:1000,ringCount:3,tolerance:.1}),result);
 assert.throws(()=>radialSpacing(source,events,{asOf:300,spacingKm:3000,ringCount:6}),/10,000/);
 assert.equal(radialSpacing(source,[],{asOf:300}).matchedEvents,0);
});
