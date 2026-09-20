import {waveformRuns} from '../public/spectrum-data.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {hash,canonical} from '../server/store.mjs';
import {instrumentSourceValid} from '../server/instruments.mjs';
import {instrumentResponse} from '../server/response.mjs';
import {phasePicks} from '../server/phase.mjs';
const payload=JSON.parse(readFileSync(process.argv[2]??'artifacts/phase-real-arrivals.json','utf8')),{record,source,rawSource,response,parents=[]}=payload;
for(const r of [record,source,rawSource,response,...parents].filter(Boolean)){const {id,...body}=r;assert.equal(hash(body),id);}
assert.equal(instrumentSourceValid(rawSource??source),true);if(response)assert.equal(instrumentSourceValid(response),true);assert.equal(hash(record.event),record.query.eventHash);assert.equal(source.id,record.query.waveformId);
let child=record;for(const parent of parents){assert.equal(parent.id,child.parentId);assert.equal(hash(parent.arrivals),hash(record.arrivals));assert.equal(parent.query.waveformId,source.id);child=parent;}assert.equal(child.parentId,null,'Export must include the complete parent chain');
const runs=waveformRuns(source,true,1),first=source.segments.reduce((n,s)=>Math.min(n,s.samples[0]?.[0]??Infinity),Infinity),last=source.segments.reduce((n,s)=>Math.max(n,s.samples.at(-1)?.[0]??-Infinity),-Infinity);for(const a of record.arrivals){assert.equal(a.inRecordingInterval,a.timeUs>=first&&a.timeUs<=last);assert.equal(a.inRecordedRun,runs.some(r=>a.timeUs>=r.startUs&&a.timeUs<=r.endUs));}
const calculated=await instrumentResponse({model:record.query.model,phases:record.query.phases,event:record.event,station:source.station},'phase');assert.deepEqual(calculated.implementation,record.implementation);assert.equal(calculated.distanceDegrees,record.distanceDegrees);assert.equal(calculated.arrivals.length,record.arrivals.length);for(let i=0;i<calculated.arrivals.length;i++){const expected=calculated.arrivals[i],actual=record.arrivals[i];for(const [key,value]of Object.entries(expected))assert.equal(canonical(actual[key]),canonical(value));assert.equal(actual.timeUs,Math.round(record.event.time*1000+expected.timeSeconds*1e6));}
assert.deepEqual(phasePicks(source,record.arrivals,record.picks),record.picks);assert.equal(record.summary.manualPicks,record.picks.length);assert.equal(record.summary.arrivals,record.arrivals.length);assert.equal(record.summary.arrivalsInInterval,record.arrivals.filter(a=>a.inRecordingInterval).length);
console.log(JSON.stringify({recordId:record.id,model:record.query.model,arrivals:record.arrivals.length,picks:record.picks.length,parentRecords:parents.length,allExact:true,scope:'Reference-model calculation and operator sample-selection reproduction; no confirmed phase or event association'}));
