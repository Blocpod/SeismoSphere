import {readFileSync} from 'node:fs';
import {hash,canonical} from './store.mjs';
import {distance,insideBounds,validateBounds} from './geo.mjs';
import {coverageComplete} from './import-jobs.mjs';
export const DETECTION_VERSION='catalog-envelope-detection-0.1.0';
export function detectionReport(events,forecasts,options){
 const {start,end,minMagnitude,provider}=options,bounds=options.bounds?validateBounds(options.bounds):null;
 if(![start,end,minMagnitude].every(Number.isFinite)||start>=end||minMagnitude< -2||minMagnitude>10||!['USGS','EMSC'].includes(provider))throw new Error('Invalid detection domain');
 const eligible=events.filter(e=>e.type==='earthquake'&&e.status!=='deleted'&&(!e.provider||e.provider===provider)&&e.time>start&&e.time<=end&&e.mag>=minMagnitude&&insideBounds(e,bounds));
 const identities=new Set();for(const e of eligible){if(!e.id||![e.time,e.mag,e.lat,e.lon].every(Number.isFinite)||Math.abs(e.lat)>90||Math.abs(e.lon)>180)throw new Error('Invalid event coordinates');for(const id of new Set([e.id,...e.aliases??[]])){if(identities.has(id))throw new Error('Associate duplicate catalog identities before evaluation');identities.add(id);}}
 if(eligible.length*forecasts.length>25000000)throw new Error('Evaluation exceeds 25 million comparisons; increase the magnitude threshold');
 const engines=['DS','Recent-rate','Null'];
 for(const f of forecasts)if(!f.id||!engines.includes(f.engine)||![f.validFrom,f.validUntil,f.radiusKm,f.center?.lat,f.center?.lon,f.magnitude?.min,f.magnitude?.max].every(Number.isFinite)||f.validFrom<start||f.validUntil>end||f.validFrom>=f.validUntil||f.radiusKm<=0||Math.abs(f.center.lat)>90||Math.abs(f.center.lon)>180||f.magnitude.min>f.magnitude.max||(f.catalogProvider??f.config?.catalogProvider??'USGS')!==provider)throw new Error('Forecast is outside the declared experiment domain');
 if(new Set(forecasts.map(f=>f.id)).size!==forecasts.length)throw new Error('Duplicate forecast identity');
 return {version:DETECTION_VERSION,domain:{start,end,minMagnitude,provider,bounds},eligibleEvents:eligible.map(e=>e.id),engines:engines.map(engine=>{
  const alerts=forecasts.filter(f=>f.engine===engine),covered=new Set(),matches=alerts.map(f=>{
   const sources=new Set([...(f.sources??[]),...(f.sourceEvents??[]).flatMap(e=>[e.id,...e.aliases??[]])]);
   const eventIds=eligible.filter(e=>e.time>f.validFrom&&e.time<=f.validUntil&&e.mag>=f.magnitude.min&&e.mag<=f.magnitude.max&&![e.id,...e.aliases??[]].some(id=>sources.has(id))&&distance(f.center,e)<=f.radiusKm).map(e=>e.id);
   eventIds.forEach(id=>covered.add(id));return {forecastId:f.id,eventIds};
  }),missedEventIds=eligible.filter(e=>!covered.has(e.id)).map(e=>e.id),empty=matches.filter(m=>!m.eventIds.length).length;
  return {engine,events:eligible.length,coveredEvents:covered.size,missedEvents:missedEventIds.length,eventRecall:eligible.length?covered.size/eligible.length:null,forecasts:alerts.length,emptyForecasts:empty,emptyForecastFraction:alerts.length?empty/alerts.length:null,missedEventIds,matches};
 }),policy:'Retrospective review of a revised single-provider catalog. Domain is (experiment start, end], at or above the chosen magnitude threshold, inside the saved target rectangle or global. Each catalog identity counts once per engine, including times with no active alerts. Full space/time/magnitude envelopes only; source identities and events at the issuance instant are not detections. A forecast may cover multiple events; overlapping alerts do not multiply detected events. Empty-forecast fraction uses forecasts as its denominator, not events. No true-negative space-time grid is defined, so no false-positive rate or F1 is reported. Retrieval coverage is not earthquake detection completeness. This review does not change original forecast results or demonstrate prospective skill.'};
}
export class DetectionReviews{
 constructor(store){this.store=store;this.implementation={version:DETECTION_VERSION,sourceFiles:Object.fromEntries(['server/detection.mjs','server/geo.mjs'].map(f=>[f,readFileSync(f,'utf8')]))};store.db.exec(`CREATE TABLE IF NOT EXISTS detection_reviews(id TEXT PRIMARY KEY,created_at INTEGER,body TEXT NOT NULL); CREATE TRIGGER IF NOT EXISTS frozen_detection_update BEFORE UPDATE ON detection_reviews BEGIN SELECT RAISE(ABORT,'Detection reviews are immutable'); END; CREATE TRIGGER IF NOT EXISTS frozen_detection_delete BEFORE DELETE ON detection_reviews BEGIN SELECT RAISE(ABORT,'Detection reviews are immutable'); END;`);}
 run(experimentId,minMagnitude){
  const experiment=this.store.experiment(String(experimentId));if(!experiment)throw new Error('Saved backtest not found');
  const options={start:experiment.start,end:experiment.end,minMagnitude,provider:experiment.config.catalogProvider??'USGS',bounds:experiment.targetBounds??null};
  if(!Number.isFinite(minMagnitude)||minMagnitude< -2||minMagnitude>10)throw new Error('Choose a finite magnitude threshold from -2 to 10');
  if(options.end>Date.now())throw new Error('The evaluation interval has not elapsed');
  const coverage=this.store.get('coverage',[]);if(!coverageComplete(coverage,options))throw new Error('Import full catalog retrieval coverage for the saved interval, region and chosen threshold first');
  if(!this.store.verify().valid)throw new Error('Forecast ledger integrity failed');
  const wanted=new Set(experiment.forecastIds),forecasts=this.store.ledger().filter(f=>wanted.has(f.id)).map(({resolution,...f})=>f);
  if(wanted.size!==experiment.forecastIds.length||forecasts.length!==wanted.size||forecasts.some(f=>f.experimentId!==experimentId||f.mode!=='hindcast'))throw new Error('Experiment forecast linkage failed');
  const events=this.store.events({asOf:options.end,start:options.start,provider:options.provider}),report=detectionReport(events,forecasts,options),input={options,experiment,forecasts,events,coverage,implementation:this.implementation},id=hash(input);
  const old=this.store.db.prepare('SELECT body FROM detection_reviews WHERE id=?').get(id);if(old)return {...JSON.parse(old.body),reused:true};
  const body={id,createdAt:Date.now(),input,report,reportHash:hash(report)};this.store.db.prepare('INSERT INTO detection_reviews VALUES(?,?,?)').run(id,body.createdAt,canonical(body));return body;
 }
 get(id){const row=this.store.db.prepare('SELECT body FROM detection_reviews WHERE id=?').get(String(id));if(!row)throw new Error('Detection review not found');const body=JSON.parse(row.body);if(hash(body.input)!==body.id||hash(body.report)!==body.reportHash)throw new Error('Detection review integrity failed');return body;}
}
