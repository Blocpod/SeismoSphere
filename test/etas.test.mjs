import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY} from '../server/geo.mjs';
import {omoriMass,compensator,intensity,logLikelihood,fitTemporalETAS,evaluateTemporalETAS,projectTemporalETAS} from '../server/etas.mjs';

test('ETAS compensator matches numerical quadrature with conditioning and future parents excluded',()=>{
  const p={mu:2,A:.2,alpha:1,c:.08,p:1.3},h=[{t:-1,mag:5},{t:.5,mag:4},{t:10,mag:9}];
  const steps=100000,dx=2/steps;let numeric=0;
  for(let i=0;i<steps;i++)numeric+=intensity((i+.5)*dx,h,p,4)*dx;
  assert.ok(Math.abs(numeric-compensator(0,2,h,p,4))<1e-5);
  assert.ok(Math.abs(omoriMass(0,1e100,p.c,p.p)-1)<1e-10);
});
test('zero productivity gives exact Poisson likelihood and coincident events cannot trigger each other',()=>{
  const p={mu:3,A:0,alpha:1,c:.1,p:1.2},h=[{t:.2,mag:5},{t:.2,mag:8},{t:1,mag:4}];
  assert.ok(Math.abs(logLikelihood(h,0,2,p,4)-(3*Math.log(3)-6))<1e-12);
  assert.equal(intensity(.2,h,{...p,A:1},4),3);
});
test('fitting ignores holdout data, freezes parameters and returns an honest conditional projection',()=>{
  const start=100*DAY,end=120*DAY,options={start,end,historyDays:5,minMagnitude:4,lat:0,lon:0,radiusKm:500,provider:'USGS'};
  const events=Array.from({length:40},(_,i)=>({id:'e'+i,provider:'USGS',type:'earthquake',time:start+(.1+i*.49)*DAY,lat:0,lon:0,mag:4+(i%5)*.1}));
  const future={id:'future',provider:'USGS',type:'earthquake',time:end+DAY,lat:0,lon:0,mag:8};
  const a=fitTemporalETAS(events,options),b=fitTemporalETAS([...events,future],options);
  assert.deepEqual(a,b);assert.equal(a.training.events,40);assert.ok(a.parameters.n<1);assert.ok(a.parameters.alpha<a.parameters.beta);
  const serialized=JSON.stringify(a),evaluation=evaluateTemporalETAS(a,[...events,future],end+2*DAY);
  assert.equal(evaluation.events,1);assert.equal(JSON.stringify(a),serialized);assert.ok(Number.isFinite(evaluation.informationGainNats));
  const projection=projectTemporalETAS(a,[...events,future]);assert.equal(projection.points.length,101);assert.ok(projection.points.every(p=>p.rate>=a.parameters.mu));
  assert.deepEqual(projection,projectTemporalETAS(a,events));assert.throws(()=>fitTemporalETAS([],options),/at least 30/);
});
