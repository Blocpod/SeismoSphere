import {backtest,validateConfig,VERSION as engineVersion} from './engine.mjs';
import {DAY} from './geo.mjs';
import {hash} from './store.mjs';
import {readFileSync} from 'node:fs';
export const CALIBRATION_VERSION='ds-depth-selection-1';
function readCalibration(store,id){
 const row=store.db.prepare('SELECT body FROM calibration_runs WHERE id=?').get(String(id));
 if(!row)throw new Error('Saved calibration not found');
 const b=JSON.parse(row.body),r=b.report;
 if(hash(b.input)!==id||hash(r)!==b.reportSha256||hash(b.implementation)!==b.input.implementationSha256)throw new Error('Calibration evidence integrity failed');
 return b;
}
export function calibrationVariant(store,id){
 const b=readCalibration(store,id),r=b.report;
 for(const name of ['engine','configuration-analogues','catalog','swarm-assessment','routes','geo'])if(b.implementation['server/'+name+'.mjs']!==readFileSync(new URL('./'+name+'.mjs',import.meta.url),'utf8'))throw new Error('The calibrated engine has changed. Fit a new calibration before scheduling this variant.');
 return {config:r.selectedConfig,routes:b.input.routes,boundaries:b.input.boundaries,calibration:{id,createdAt:r.createdAt,reportSha256:b.reportSha256,inputSnapshotId:b.input.inputSnapshotId,implementationSha256:b.input.implementationSha256,intervals:r.options,triggerDepth:r.selectedConfig.triggerDepth,objective:r.selection.objective}};
}
export function calibrationOptions(input,config,now=Date.now()){
 const options=Object.fromEntries(['start','trainEnd','end'].map(k=>[k,typeof input[k]==='number'?input[k]:Date.parse(input[k])]));
 options.testStart=options.trainEnd+DAY;options.stepDays=config.windowDays;
 if(!Object.values(options).every(Number.isFinite)||options.start<Date.UTC(1900,0,1)||options.end>now||options.trainEnd-options.start<config.windowDays*DAY||options.trainEnd-options.start>90*DAY||options.end-options.testStart<config.windowDays*DAY||options.end-options.testStart>90*DAY)throw new Error('Use elapsed training and test intervals, each between one forecast window and 90 days. Testing starts one day after training ends.');
 return options;
}
export function calibrateDepth({events,options,config,routes,boundaries=[]}){
 validateConfig(config);options=calibrationOptions(options,config);if(!config.rules.deep||!config.rules.routes)throw new Error('Depth calibration requires the Deep and Routes hypotheses.');
 if(events.length>100000)throw new Error('Calibration supports at most 100,000 catalog events.');
 const training=events.filter(e=>e.time<=options.trainEnd),thresholds=[...new Set([config.triggerDepth,200,300,400])];
 const assess=(catalog,start,end,c)=>{const r=backtest(catalog,start,end,c,routes,boundaries,options.stepDays),ds=r.summary.find(s=>s.engine==='DS'),recent=r.summary.find(s=>s.engine==='Recent-rate'),steps=Math.floor((end-start-c.windowDays*DAY)/(options.stepDays*DAY))+1;return {summary:r.summary,issuanceSteps:steps,extraHitsPerIssuance:(ds.hits-recent.hits)/steps,forecastDigest:hash(r.trials),dsForecasts:ds.forecasts};};
 const candidates=thresholds.map(triggerDepth=>({triggerDepth,...assess(training,options.start,options.trainEnd,{...config,triggerDepth})}));
 const eligible=candidates.filter(c=>c.dsForecasts>=5);if(!eligible.length)throw new Error('Each selectable depth needs at least five training forecasts. Import a longer interval with deep activity.');
 eligible.sort((a,b)=>b.extraHitsPerIssuance-a.extraHitsPerIssuance||Math.abs(a.triggerDepth-config.triggerDepth)-Math.abs(b.triggerDepth-config.triggerDepth)||a.triggerDepth-b.triggerDepth);
 const selectedConfig={...config,triggerDepth:eligible[0].triggerDepth};
 // The selection above never receives test-period observations or outcomes.
 const holdout=assess(events,options.testStart,options.end,selectedConfig),unchanged=assess(events,options.testStart,options.end,config);
 return {version:CALIBRATION_VERSION,engineVersion,options,baseConfig:config,selectedConfig,selection:{parameter:'triggerDepth',objective:'DS minus matched recent-rate hits per scheduled issuance',minimumTrainingForecasts:5,tieBreak:'Closest to unchanged threshold, then lowest threshold',candidates,selected:eligible[0]},holdout,unchanged,
  limitations:['This is training-based selection of one parameter, not calibrated earthquake probabilities.','Revised-catalog hindcast; source publication history is not reconstructed.','Targets within an issuance remain dependent; test scores are descriptive, without significance claims.','Repeated exploration of test intervals consumes their independence. Register a separate prospective experiment before claiming skill.','Canonical workspace settings and issued forecasts are not modified.','The threshold grid is bounded to the existing threshold and 200, 300 and 400 km; it does not learn route geometry or other rules.']};
}

export function calibrationContext(store,id,asOf){
 const b=readCalibration(store,id),r=b.report;
 if(!Number.isFinite(asOf)||r.createdAt>asOf)throw new Error('This calibration was unavailable at the requested observation cutoff');
 const ds=r.holdout.summary.find(s=>s.engine==='DS'),base=r.unchanged.summary.find(s=>s.engine==='DS');
 return {id,createdAt:new Date(r.createdAt).toISOString(),engineVersion:r.engineVersion,intervals:Object.fromEntries(['start','trainEnd','testStart','end'].map(k=>[k,new Date(r.options[k]).toISOString()])),selectedDepth:r.selectedConfig.triggerDepth,unchangedDepth:r.baseConfig.triggerDepth,selection:r.selection,holdout:r.holdout,unchanged:r.unchanged,sourceSentence:`Selected depth: ${r.selectedConfig.triggerDepth} km. Later DS full hits: ${ds.hits}/${ds.forecasts}; unchanged DS full hits: ${base.hits}/${base.forecasts}.`,limitations:r.limitations};
}
