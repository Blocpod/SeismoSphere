import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spatialRank,commonComparison,addComparisonModels} from '../server/common-comparison.mjs';
import {region} from '../server/spatial-etas.mjs';
import {DAY} from '../server/geo.mjs';
test('paired spatial rank handles ties, empty outcomes and incompatible arrays',()=>{
 assert.equal(spatialRank([1,1,1,1],[0,0,0,2]).eventWeightedSpatialRank,.5);
 assert.equal(spatialRank([0,1,2,3],[0,0,0,2]).eventWeightedSpatialRank,.875);
 assert.equal(spatialRank([0,1,2,3],[2,0,0,0]).eventWeightedSpatialRank,.125);
 assert.equal(spatialRank([0,0],[0,0]).eventWeightedSpatialRank,null);
 for(const cells of [[1],[1,NaN],[1,-1],Array(2)])assert.throws(()=>spatialRank(cells,[0,1]));
});
test('all models share outcome boundaries and outcomes cannot change input maps',()=>{
 const options={start:40*DAY,end:50*DAY,historyDays:5,minMagnitude:5,provider:'USGS',south:-5,north:5,west:175,east:-175};
 const etas={id:'fixture',fit:{version:'rectangular-gaussian-spatial-etas-0.1.0',options,region:region(options),frozenHistory:[],parameters:{mu:1,A:.1,alpha:.1,c:.1,p:1.2,sigmaKm:5,gamma:0}}};
 const config=JSON.parse(readFileSync('config/default.json','utf8')),e={id:'hit',provider:'USGS',type:'earthquake',status:'reviewed',lat:0,lon:-179,mag:5,time:51*DAY,depth:10};
 const run=events=>commonComparison({etas,events,config,routes:{version:'test',routes:[]},size:4});
 const first=run([e,{...e,id:'boundary',time:57*DAY},{...e,id:'left',time:50*DAY},{...e,id:'late',time:57*DAY+1},{...e,id:'small',mag:4},{...e,id:'wrong',provider:'EMSC'},{...e,id:'outside',lon:0}]);
 assert.deepEqual(first.outcomes.map(e=>e.id),['hit','boundary']);
 assert.ok(first.ranking.every(s=>s.events===2));
 assert.deepEqual(run([]).models,first.models);
 assert.equal(first.models.ETAS.reduce((a,b)=>a+b,0),7);
});

test('all-family adapters preserve the shared outcomes, coarse ties and selection cutoffs',()=>{
 const cells=Array.from({length:72},(_,i)=>i+1),report={provider:'USGS',minMagnitude:5,cutoff:100,grid:{centers:[{lat:0,lon:0},{lat:0,lon:1},{lat:0,lon:31},{lat:0,lon:32}]},models:{Uniform:[1,1,1,1]},observed:[0,0,1,1],limitations:[]};
 const learned={report:{id:'parent',options:{minMagnitude:5,validationEnd:90},grid:{rows:6,columns:12}},projection:{cutoff:100,days:7,cells,componentCells:{graph:cells}}},tectonic={report:{parentRunId:'parent',training:{end:80},fit:{cells}}},calibrated={calibration:{intervals:{trainEnd:80}},analysis:{asOf:100,config:{windowDays:7,catalogProvider:'USGS'},candidates:[{center:{lat:0,lon:0},radiusKm:400,magnitude:{max:6}}]}};
 const before=structuredClone({report,learned,tectonic,calibrated}),r=addComparisonModels(report,{learned,tectonic,calibrated});
 assert.deepEqual(Object.keys(r.models).sort(),['DS-AI','Ensemble','Graph','Tectonic','Uniform']);
 assert.deepEqual(r.models.Graph,[43,43,44,44]);assert.deepEqual(r.models['DS-AI'],[1,1,0,0]);assert.ok(r.ranking.every(s=>s.events===2));
 assert.deepEqual({report,learned,tectonic,calibrated},before);
 assert.throws(()=>addComparisonModels({...report,minMagnitude:4.5},{learned,tectonic}),/USGS M5/);
 assert.throws(()=>addComparisonModels({...report,cutoff:89},{learned,tectonic}),/selected before/);
 assert.throws(()=>addComparisonModels(report,{learned,tectonic:{report:{...tectonic.report,parentRunId:'other'}}}),/share/);
 assert.throws(()=>addComparisonModels(report,{calibrated:{...calibrated,calibration:{intervals:{trainEnd:101}}}}),/selection interval/);
});
