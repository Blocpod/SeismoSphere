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
 const before=store.verify(),review=service.run('exp',4.5);assert.equal(review.report.engines[0].eventRecall,.5);assert.equal(service.run('exp',4.5).reused,true);assert.notEqual(service.run('exp',5).id,review.id);assert.deepEqual(store.verify(),before);assert.deepEqual(service.get(review.id),review);
 assert.throws(()=>store.db.prepare('DELETE FROM detection_reviews WHERE id=?').run(review.id),/immutable/);
 assert.throws(()=>service.run('exp',3),/coverage/);
 store.ingest([event('missed',5000,171,{status:'deleted',updated:12000})],12000);const revised=service.run('exp',4.5);assert.notEqual(revised.id,review.id);assert.equal(revised.report.engines[0].eventRecall,1);assert.equal(service.get(review.id).report.engines[0].eventRecall,.5);
 assert.equal(hash(review.input),review.id);assert.equal(hash(review.report),review.reportHash);
 }finally{store.db.close();}
});
