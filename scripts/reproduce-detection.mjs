import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {hash} from '../server/store.mjs';
import {detectionReport,DETECTION_VERSION} from '../server/detection.mjs';

export function reproduceDetection(payload){
 const {id,input,report,reportHash}=payload;
 assert.equal(hash(input),id,'Detection input hash mismatch');
 assert.equal(hash(report),reportHash,'Detection result hash mismatch');
 assert.equal(input.implementation.version,DETECTION_VERSION,'Unsupported evaluator version');
 // Only the numerical module prefix participates; storage/history changes do not change its algorithm.
 const prefix=source=>{assert.equal(typeof source,'string','Missing saved evaluator source');const end=source.indexOf('export class DetectionReviews{');assert.ok(end>0,'Unrecognized saved evaluator layout');return source.slice(0,end);};
 assert.equal(prefix(input.implementation.sourceFiles['server/detection.mjs']),prefix(readFileSync(new URL('../server/detection.mjs',import.meta.url),'utf8')),'Numerical evaluator differs; archived code is never executed');
 assert.equal(input.implementation.sourceFiles['server/geo.mjs'],readFileSync(new URL('../server/geo.mjs',import.meta.url),'utf8'),'Geographic implementation differs');
 const {experiment,options,forecasts}=input;
 assert.equal(options.start,experiment.start,'Start differs from saved experiment');
 assert.equal(options.end,experiment.end,'End differs from saved experiment');
 assert.equal(options.provider,experiment.config.catalogProvider??'USGS','Provider differs from saved experiment');
 assert.deepEqual(options.bounds,experiment.targetBounds??null,'Region differs from saved experiment');
 assert.equal(new Set(experiment.forecastIds).size,experiment.forecastIds.length,'Repeated experiment forecast IDs');
 assert.deepEqual(forecasts.map(f=>f.id).sort(),[...experiment.forecastIds].sort(),'Forecast set differs from saved experiment');
 for(const f of forecasts){assert.equal(f.experimentId,experiment.experimentId,'Forecast experiment linkage mismatch');assert.equal(f.mode,'hindcast','Expected saved hindcast forecasts');}
 const reproduced=detectionReport(input.events,forecasts,options);
 assert.equal(hash(reproduced),reportHash,'Reproduced detection report differs');
 return {id,identical:true,eligibleEvents:reproduced.eligibleEvents.length,engines:reproduced.engines.map(({engine,coveredEvents,missedEvents,emptyForecasts})=>({engine,coveredEvents,missedEvents,emptyForecasts})),scope:'Exact local numerical reproduction from retained inputs. No exported code is executed. Does not authenticate catalog retrieval, forecast issuance, external timestamps or predictive skill; use the full ledger evidence for forecast-chain verification.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv[2])throw new Error('Usage: node scripts/reproduce-detection.mjs EXPORTED_JSON');
 console.log(JSON.stringify(reproduceDetection(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
}
