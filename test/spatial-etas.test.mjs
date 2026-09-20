import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,R} from '../server/geo.mjs';
import {region,project,inverse,gaussianMass,gaussianDensity,spatialIntensity,spatialCompensator,spatialLikelihood,fitSpatialETAS,evaluateSpatialETAS,projectSpatialETAS} from '../server/spatial-etas.mjs';
import {statisticalContext} from '../server/statistical-context.mjs';
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('equal-area region wraps dateline, inverts coordinates and preserves analytic spherical area',()=>{
  const r=region({south:-5,north:5,west:175,east:-175}),p={lat:3,lon:-178},xy=project(p,r),back=inverse(xy.x,xy.y,r);near(back.lat,p.lat);near(back.lon,p.lon);
  near(r.areaKm2,R*R*10*Math.PI/180*(Math.sin(5*Math.PI/180)-Math.sin(-5*Math.PI/180)),1e-7);
  assert.throws(()=>region({south:10,north:9,west:0,east:10}));assert.throws(()=>region({south:75,north:80,west:0,east:10}));
});
test('Gaussian finite-region mass agrees with quadrature and retains lost boundary mass',()=>{
  const p={x:0,y:0},box={xmin:0,xmax:10,ymin:0,ymax:10},sigma=2;let numeric=0;const n=500,dx=10/n;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)numeric+=gaussianDensity(((i+.5)*dx)**2+((j+.5)*dx)**2,sigma)*dx*dx;
  near(gaussianMass(p,sigma,box),numeric,1e-6);near(gaussianMass(p,sigma,{xmin:0,xmax:100,ymin:0,ymax:100}),.25,1e-7);
});
test('joint compensator agrees with space-time quadrature; zero triggering is uniform Poisson',()=>{
  const r={xmin:-10,xmax:10,ymin:-10,ymax:10,areaKm2:400},p={mu:2,A:.3,alpha:.5,c:.1,p:1.3,sigmaKm:3,gamma:.2},history=[{t:-.2,x:0,y:0,mag:4.5},{t:3,x:0,y:0,mag:9}],n=60,nt=300,ds=20/n,dt=1/nt;let value=0;
  for(let k=0;k<nt;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++)value+=spatialIntensity((k+.5)*dt,{x:-10+(i+.5)*ds,y:-10+(j+.5)*ds},history,p,4,r)*dt*ds*ds;
  near(value,spatialCompensator(0,1,history,p,4,r),.0001);
  near(spatialLikelihood([{t:.5,x:1,y:1,mag:4},{t:.5,x:1,y:1,mag:8}],0,1,{...p,A:0},4,r),2*Math.log(2/400)-2);
  near(spatialIntensity(.5,{x:1,y:1},[{t:.5,x:1,y:1,mag:9}],p,4,r),p.mu/400);
});
test('spatial fitting excludes holdout, freezes KDE/history, and cell integrals sum to region compensator',()=>{
  const start=100*DAY,end=120*DAY,o={start,end,south:30,north:35,west:130,east:135,historyDays:5,minMagnitude:4,provider:'USGS'};
  const events=Array.from({length:36},(_,i)=>({id:'t'+i,time:start+(.1+i*.53)*DAY,lat:31+(i%5)*.1,lon:131+(i%7)*.1,mag:4+(i%4)*.2,provider:'USGS',type:'earthquake'})),future={...events[0],id:'future',time:end+DAY,mag:8};
  const model=fitSpatialETAS(events,o),withFuture=fitSpatialETAS([...events,future],o);assert.deepEqual(model,withFuture);assert.ok(model.parameters.n<1);const saved=JSON.stringify(model);
  const hold=evaluateSpatialETAS(model,[...events,future],end+2*DAY),holdWithoutTraining=evaluateSpatialETAS(model,[future],end+2*DAY);assert.deepEqual(hold,holdWithoutTraining);assert.equal(hold.events,1);assert.ok(Number.isFinite(hold.bitsPerEventVsKDE));assert.equal(JSON.stringify(model),saved);
  const fullLength=structuredClone(model),shift=180-(end-start)/DAY;fullLength.options.start=end-180*DAY;fullLength.frozenHistory.forEach(e=>e.t+=shift);const fullHoldout=evaluateSpatialETAS(fullLength,[future],end+30*DAY);assert.equal(fullHoldout.events,1);assert.ok(Number.isFinite(fullHoldout.logLikelihood));
  const projection=projectSpatialETAS(model,[],[1,7],16);for(const m of projection.maps)near(m.cellSum,m.totalDirectIntensity,1e-5);assert.deepEqual(projection,projectSpatialETAS(model,[future],[1,7],16));
  const report={id:'test-run',fit:model,projection,holdout:hold,catalogMode:'revised-catalog hindcast'},context=statisticalContext(report,end,7);assert.equal(context.holdout,null);assert.equal(context.training.events,36);assert.equal(context.frozenHistory,undefined);assert.equal(context.projection.cells,undefined);assert.throws(()=>statisticalContext(report,end-DAY),/after the analysis cutoff/);assert.equal(statisticalContext(report,end+2*DAY).holdout.events,1);
});
