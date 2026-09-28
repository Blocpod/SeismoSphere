import {reproduceDetection} from '../scripts/reproduce-detection.mjs';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,hash} from '../server/store.mjs';
import {detectionReport,DetectionReviews} from '../server/detection.mjs';
const options={start:1000,end:10000,minMagnitude:4.5,provider:'USGS',bounds:{south:-10,north:10,west:170,east:-170}};
const event=(id,time=5000,lon=179,extra={})=>({id,time,lon,lat:0,mag:5,type:'earthquake',provider:'USGS',...extra});
const forecast=(id,engine='DS',extra={})=>({id,engine,validFrom:1000,validUntil:10000,center:{lat:0,lon:179},radiusKm:300,magnitude:{min:4.5,max:5.5},sources:['source'],...extra});
test('catalog recall counts unique events including gaps and separates empty forecast units',()=>{
 const events=[event('a'),event('b',6000,-179),event('outside',6000,171),event('gap',2000),event('source'),event('boundary',1000),event('low',5000,179,{mag:4}),event('other-provider',5000,179,{provider:'EMSC'}),event('deleted',5000,179,{status:'deleted'}),event('outside-region',5000,0),event('after',10001)];
 const forecasts=[forecast('ds1','DS',{validFrom:3000}),forecast('ds2','DS',{validFrom:3000}),forecast('empty','DS',{center:{lat:0,lon:0}}),forecast('recent','Recent-rate',{sources:[]})];
 const report=detectionReport(events,forecasts,options),ds=report.engines[0];
 assert.equal(ds.events,5);assert.equal(ds.coveredEvents,2);assert.equal(ds.missedEvents,3);assert.equal(ds.eventRecall,.4);assert.equal(ds.emptyForecasts,1);assert.equal(ds.emptyForecastFraction,1/3);assert.deepEqual(ds.matches[0].eventIds,['a','b']);assert.deepEqual(ds.missedEventIds,['outside','gap','source']);assert.equal(report.engines[2].eventRecall,0);assert.equal(report.engines[2].emptyForecastFraction,null);
 assert.equal(detectionReport([],forecasts,options).engines[0].eventRecall,null);
 assert.throws(()=>detectionReport([...events,event('duplicate',5000,179,{aliases:['a']})],forecasts,options),/duplicate/);
 assert.throws(()=>detectionReport(events,[forecast('future','DS',{validUntil:10001})],options),/domain/);
 assert.throws(()=>detectionReport(events,forecasts,{...options,minMagnitude:NaN}),/domain/);
 const alias=detectionReport([event('renamed',5000,179,{aliases:['source']})],[forecast('f')],options);assert.equal(alias.engines[0].coveredEvents,0);
 const upper=detectionReport([event('end',10000),event('too-large',5000,179,{mag:6})],[forecast('f')],options);assert.equal(upper.engines[0].coveredEvents,1);
});
test('saved detection reviews preserve evidence, reuse exact inputs and never rewrite the ledger',()=>{
 const store=new Store(':memory:');try{
 const service=new DetectionReviews(store),events=[event('a'),event('missed',5000,171)];store.ingest(events,11000);store.set('coverage',[{provider:'USGS',start:0,end:20000,minMagnitude:4}]);
 const snapshotId=store.snapshot([],1000,'hindcast'),[f]=store.issue([forecast('ignored')],{snapshotId,mode:'hindcast',experimentId:'exp',issuedAt:20000});
 store.saveExperiment('exp',{experimentId:'exp',start:1000,end:10000,forecastIds:[f.id],config:{catalogProvider:'USGS'},targetBounds:options.bounds});
 const before=store.verify(),review=service.run('exp',4.5);assert.equal(review.report.engines[0].eventRecall,.5);assert.equal(service.run('exp',4.5).reused,true);
 assert.equal(reproduceDetection(review).identical,true);
 for(const change of ['result','scope','forecast','source']){
  const altered=structuredClone(review);
  if(change==='result'){altered.report.engines[0].coveredEvents++;altered.reportHash=hash(altered.report);}
  if(change==='scope')altered.input.options.start++;
  if(change==='forecast')altered.input.forecasts=[];
  if(change==='source')altered.input.implementation.sourceFiles['server/detection.mjs']='throw new Error("Do not execute exported code");\n'+altered.input.implementation.sourceFiles['server/detection.mjs'];
  altered.id=hash(altered.input);assert.throws(()=>reproduceDetection(altered),change);
 }
assert.notEqual(service.run('exp',5).id,review.id);assert.deepEqual(store.verify(),before);assert.deepEqual(service.get(review.id),review);
 assert.throws(()=>store.db.prepare('DELETE FROM detection_reviews WHERE id=?').run(review.id),/immutable/);
 assert.throws(()=>service.run('exp',3),/coverage/);
 store.ingest([event('missed',5000,171,{status:'deleted',updated:12000})],12000);const revised=service.run('exp',4.5);assert.notEqual(revised.id,review.id);assert.equal(revised.report.engines[0].eventRecall,1);assert.equal(service.get(review.id).report.engines[0].eventRecall,.5);
 assert.equal(service.list('exp').length,3);assert.deepEqual(service.list('other-experiment'),[]);assert.equal(service.list('exp').find(r=>r.id===review.id).domain.minMagnitude,4.5);
 assert.equal(hash(review.input),review.id);assert.equal(hash(review.report),review.reportHash);
 store.db.exec('DROP TRIGGER frozen_detection_update');store.db.prepare('UPDATE detection_reviews SET body=? WHERE id=?').run(JSON.stringify({...review,report:{...review.report,eligibleEvents:[]}}),review.id);assert.throws(()=>service.list('exp'),/integrity/);assert.throws(()=>service.get(review.id),/integrity/);
 }finally{store.db.close();}
});

test('saved review selection rejects late results and mismatched experiment context',async()=>{
 const source=readFileSync(new URL('../public/experiment-history.js',import.meta.url),'utf8'),start=source.indexOf(' detectionHistory.onchange='),end=source.indexOf(' detectionForm.oninput=',start),handler=source.slice(start,end);
 for(const change of ['none','selection','experiment','threshold','wrong-link','late-error']){
  let resolve,reject,shown=0;const request=new Promise((yes,no)=>{resolve=yes;reject=no;}),select={value:'review'},first={value:'experiment'},status={textContent:''},form={elements:{minMagnitude:{value:'4.5'}}};
  const bind=new Function('api','detectionHistory','first','detectionResult','detectionStatus','detectionForm','showDetection',`let detectionSerial=0;${handler};return {run:detectionHistory.onchange,invalidate:()=>detectionSerial++};`);
  const controls=bind(()=>request,select,first,{replaceChildren(){}},status,form,()=>shown++),pending=controls.run();
  if(change==='selection')select.value='another';if(change==='experiment')first.value='another';if(['threshold','late-error'].includes(change))controls.invalidate();
  const data={input:{experiment:{experimentId:change==='wrong-link'?'another':'experiment'}},report:{domain:{minMagnitude:5}}};
  if(change==='late-error')reject(new Error('late failure'));else resolve(data);await pending;
  assert.equal(shown,change==='none'?1:0,change);assert.equal(form.elements.minMagnitude.value,change==='none'?'5':'4.5');
  if(change==='wrong-link')assert.match(status.textContent,/another experiment/);if(change==='late-error')assert.doesNotMatch(status.textContent,/late failure/);
 }
});
