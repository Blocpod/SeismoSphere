import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calibrateDepth,calibrationOptions} from '../server/calibration.mjs';
import {DAY} from '../server/geo.mjs';
const config={...JSON.parse(readFileSync('config/default.json')),windowDays:7,radiusKm:100,maxTargets:16},end=Date.UTC(2026,7,30),options=calibrationOptions({start:end-70*DAY,trainEnd:end-35*DAY,end},config),events=Array.from({length:80},(_,i)=>({id:'USGS:cal'+i,provider:'USGS',type:'earthquake',lat:0,lon:i%2?0:10,mag:5,magType:'mw',depth:350,time:end-(80-i)*DAY})),routes={version:'fixture',captureKm:100,maxHops:3,routes:[{id:'r',name:'Test',points:[0,5,10,15].map(lon=>({lat:0,lon})),direction:'forward',kind:'research-corridor',termination:false,provenance:{status:'illustrative'}}]};
test('parameter selection excludes later test data and preserves canonical inputs',()=>{
 const original=structuredClone(config),a=calibrateDepth({events,options,config,routes}),b=calibrateDepth({events:events.map(e=>e.time>options.trainEnd?{...e,mag:8,lon:100}:e),options,config,routes});
 assert.deepEqual(a.selection,b.selection);assert.deepEqual(a.selectedConfig,b.selectedConfig);assert.deepEqual(config,original);assert.notDeepEqual(a.holdout,b.holdout);assert.ok(a.selection.selected.dsForecasts>=5);assert.equal(a.options.testStart,a.options.trainEnd+DAY);
 assert.throws(()=>calibrationOptions({...options,end:Date.now()+DAY},config),/elapsed/);assert.throws(()=>calibrateDepth({events:[],options,config,routes}),/five training/);
});
