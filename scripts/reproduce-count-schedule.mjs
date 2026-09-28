import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../server/store.mjs';
import {verifyCountForecast} from './reproduce-count-forecast.mjs';
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/reproduce-count-schedule.mjs exported-schedule.json');
const p=JSON.parse(readFileSync(file,'utf8')),s=p.spec;
assert.equal(hash(s),p.id);assert.ok(p.registeredAt<s.start);
if(p.recordHash)assert.equal(hash({spec:s,registeredAt:p.registeredAt}),p.recordHash);
if(s.node)assert.equal(hash({source:s.implementation,scoring:s.scoringHash,node:s.node}),s.runtimeHash);
const ordinals=new Set(),forecasts=new Map(p.forecasts.map(f=>[f.id,f]));assert.equal(forecasts.size,p.forecasts.length);let scored=0,issued=0;
for(const {id,...slot} of p.slots){
 assert.equal(hash(slot),id);assert.equal(slot.planId,p.id);assert.ok(!ordinals.has(slot.ordinal));ordinals.add(slot.ordinal);
 if(slot.ordinal===-1){assert.equal(slot.status,'STOPPED');continue;}
 assert.ok(Number.isInteger(slot.ordinal)&&slot.ordinal>=0&&slot.ordinal<s.issuances);const due=s.start+slot.ordinal*s.stepDays*86400000;assert.equal(slot.scheduledAt,due);
 if(slot.status!=='ISSUED'){assert.ok(['CANCELLED','MISSED_WINDOW','SKIPPED_VERSION'].includes(slot.status));continue;}
 const f=forecasts.get(slot.forecastId);assert.ok(f);assert.deepEqual(f.registration,{planId:p.id,ordinal:slot.ordinal,scheduledAt:due,deadline:due+s.graceMs});assert.equal(f.parentRunId,s.parentRunId);assert.equal(f.weightsSha256,s.weightsSha256);assert.equal(f.tectonicComparison.id,s.tectonicId);assert.equal(f.scoringHash,s.scoringHash);assert.ok(f.issuedAt>=due&&f.issuedAt<=due+s.graceMs);scored+=Number(verifyCountForecast(f).scored);issued++;
}
assert.equal(issued,forecasts.size);
console.log(`PASS: registration, ${p.slots.length} slots, ${issued} linked issuances and ${scored} scored outcomes verified.`);
