import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathDistanceKm,outcomeMetricsHtml} from '../public/outcome-metrics.js';
test('frozen path inspection handles dateline, endpoints and unavailable geometry',()=>{
 assert.ok(pathDistanceKm([{lat:0,lon:170},{lat:0,lon:-170}],{lat:0,lon:180})<1e-8);
 assert.ok(Math.abs(pathDistanceKm([{lat:0,lon:0},{lat:0,lon:10}],{lat:1,lon:5})-111.195)<.001);
 assert.ok(pathDistanceKm([{lat:0,lon:0},{lat:0,lon:10}],{lat:0,lon:20})>1111);
 assert.equal(pathDistanceKm([{lat:0,lon:0},{lat:0,lon:180}],{lat:1,lon:0}),null);
 assert.equal(pathDistanceKm([],{lat:0,lon:0}),null);
 assert.equal(pathDistanceKm([{lat:NaN,lon:0},{lat:0,lon:10}],{lat:0,lon:0}),null);
 assert.equal(outcomeMetricsHtml({},{}),'');
});
