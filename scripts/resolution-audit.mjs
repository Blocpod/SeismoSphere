import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {hash,canonical} from '../server/store.mjs';
import {scoreForecast} from '../server/engine.mjs';
import {coverageComplete} from '../server/import-jobs.mjs';
const payload=await(await fetch('http://127.0.0.1:4318/api/export')).json(),before=JSON.parse(readFileSync('artifacts/before-resolution-reviews.json')),snapshots=new Map(payload.snapshots.map(({id,...s})=>[id,s])),forecasts=new Map(payload.forecasts.map(f=>[f.id,f])),heads=new Map();assert.equal(forecasts.size,before.forecasts.length);
for(const [id,body,digest]of before.forecasts){const {resolution,latestResolution,reviewId,reviewCount,lastReviewedAt,hash:forecastHash,...f}=forecasts.get(id);assert.equal(canonical(f),body);assert.equal(forecastHash,digest);}
for(const [id,result]of before.resolutions)assert.equal(canonical(forecasts.get(id).resolution),result);
for(const {id,...r}of payload.resolutionReviews){assert.equal(hash(r),id);const f=forecasts.get(r.forecastId),snapshot=snapshots.get(r.snapshotId);assert.equal(hash(snapshot),r.snapshotId);assert.equal(r.forecastHash,f.hash);assert.equal(r.originalResolutionHash,hash(f.resolution));assert.equal(r.previousHash,heads.get(f.id)??hash({forecastId:f.id,forecastHash:f.hash,originalResolution:f.resolution}));assert.equal(r.coverageQuery.minMagnitude,f.magnitude.min-.5);assert.equal(canonical(scoreForecast(f,snapshot.events,r.observationCutoff,coverageComplete(r.coverage,r.coverageQuery))),canonical(r.result));heads.set(f.id,id);}
const report={forecastsUnchanged:forecasts.size,originalResultsUnchanged:before.resolutions.length,reviewResultsReproduced:payload.resolutionReviews.length,reviewedForecasts:heads.size,forecastIntegrity:payload.integrity,reviewIntegrity:payload.reviewIntegrity,verifiedAt:new Date().toISOString()};writeFileSync('artifacts/resolution-export-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
