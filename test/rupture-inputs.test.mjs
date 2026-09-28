import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,hash} from '../server/store.mjs';
import {RuptureInputs,stressIntegrity} from '../server/rupture-inputs.mjs';
import {parseCoulombInput} from '../server/coulomb-input.mjs';
import {destination} from '../server/geo.mjs';
const raw=`Test rupture
#reg1= 0 #reg2= 0 #fixed= 1
PR1= 0.25 PR2= 0.25
E1= 8e5 E2= 8e5
FRIC= 0.4
 # X-start Y-start X-fin Y-fin Kode rake netslip dip angle top bot
xxx xxxxxxxxxx
1 0 0 0 10 100 90 2 30 1 6 patch

Map info
1 ---- zero lon = -72
2 ---- zero lat = -31
`;
test('Coulomb input validates explicit slip encoding, counts, origins and geometry',()=>{
  const p=parseCoulombInput(raw);assert.equal(p.patches.length,1);assert.equal(p.patches[0].slipM,2);assert.equal(p.patches[0].rakeDeg,90);assert.deepEqual(p.origin,{lat:-31,lon:-72});assert.equal(p.elasticInput.poisson,.25);
  for(const bad of [raw.replace('rake netslip','rtlat reverse'),raw.replace('#fixed= 1','#fixed= 2'),raw.replace('100 90 2','200 90 2'),raw.replace('100 90 2','100 90 NaN'),raw.replace('30 1 6','0 1 6'),raw.replace('30 1 6','30 6 1'),raw.replace('zero lat = -31','zero lat = -131'),raw.replace('PR2= 0.25','PR2= 0.3'),raw.replace('E2= 8e5','E2= -1')])assert.throws(()=>parseCoulombInput(bad));
});
test('companion projection receipts preserve bytes, reject strict hindsight and retain failed checks',async t=>{
  const store=new Store(':memory:'),model=parseCoulombInput(raw),p=model.patches[0],east=(p.bottomKm-p.topKm)/Math.tan(p.dipDeg*Math.PI/180)/2,north=5,center=destination(model.origin,Math.atan2(east,north)*180/Math.PI,Math.hypot(east,north));
  const fsp=`% Coordinates are given for center of each subfault\n% LAT LON X==EW Y==NS Z SLIP RAKE TRUP RISE SF_MOMENT\n${center.lat} ${center.lon} 0 0 3.5 2 90 0 1 1e18\n`,file={kind:'Slip model (FSP)',name:'model.fsp',url:'https://earthquake.usgs.gov/product/test/model.fsp',bytes:null};
  const body={schema:'seismosphere.rupture-input.v1',event:{time:100},product:{status:'UPDATE',updateTime:200,files:[file]},model,raw,receipt:{sha256:hash(raw)},createdAt:250},source={...body,id:hash(body)},service=new RuptureInputs(store,{});store.db.prepare('INSERT INTO rupture_inputs VALUES(?,?,?,?)').run(source.id,'test',250,JSON.stringify(source));
  let requests=0;t.mock.method(globalThis,'fetch',async url=>{requests++;assert.equal(url,file.url);return new Response(fsp);});
  try{
    const request={sourceId:source.id,asOf:300};await assert.rejects(service.registerProjection({...request,mode:'strict'}),/No archived/);
    await assert.rejects(service.registerProjection({...request,fileName:'https://evil.test'}),/published companion/);assert.equal(requests,0);
    const saved=await service.registerProjection(request);assert.equal(saved.validation.supported,true);assert.equal(saved.raw,fsp);assert.equal(saved.receipt.sha256,hash(fsp));assert.equal((await service.registerProjection(request)).reused,true);assert.equal(requests,1);
    await assert.rejects(service.registerProjection({...request,asOf:saved.createdAt-1,mode:'strict'}),/No archived/);assert.equal((await service.registerProjection({...request,asOf:Date.now(),mode:'strict'})).id,saved.id);
    const {id,...record}=service.projection(saved.id);assert.equal(hash(record),id);assert.throws(()=>store.db.exec('DELETE FROM rupture_projections'),/immutable/);assert.throws(()=>store.db.exec("UPDATE rupture_projections SET body='{}'"),/immutable/);
    const wrong={...body,model:{...model,origin:{lat:0,lon:0}}},wrongSource={...wrong,id:hash(wrong)};store.db.prepare('INSERT INTO rupture_inputs VALUES(?,?,?,?)').run(wrongSource.id,'wrong',250,JSON.stringify(wrongSource));
    const rejected=await service.registerProjection({...request,sourceId:wrongSource.id});assert.equal(rejected.validation.supported,false);assert.match(rejected.validation.reason,/50 m tolerance/);assert.equal(rejected.raw,fsp);
  }finally{store.close();}
});
test('rupture source archives exact bytes once, enforces source identity/cutoffs and remains immutable',async t=>{
  const store=new Store(':memory:'),detail={properties:{products:{'finite-fault':[{id:'source',type:'finite-fault',status:'UPDATE',updateTime:200,contents:{'coulomb.inp':{url:'https://earthquake.usgs.gov/product/test/coulomb.inp',length:Buffer.byteLength(raw)}}}]}}};
  const body={event:{id:'USGS:test',time:100},createdAt:250,raw:JSON.stringify(detail),receipt:{sha256:hash(JSON.stringify(detail))}},parent={...body,id:hash(body)},service=new RuptureInputs(store,{get:id=>{assert.equal(id,parent.id);return parent;}}),input={recordId:parent.id,productId:'source',fileName:'coulomb.inp',asOf:300};let requests=0;
  t.mock.method(globalThis,'fetch',async url=>{requests++;assert.equal(url,'https://earthquake.usgs.gov/product/test/coulomb.inp');return new Response(raw);});
  try{
    await assert.rejects(service.query({...input,asOf:199}),/revised/);
    await assert.rejects(service.query({...input,mode:'strict'}),/No archived/);
    await assert.rejects(service.query({...input,fileName:'https://evil.test'}),/published/);
    const saved=await service.query(input),{id,...record}=service.get(saved.id);assert.equal(hash(record),id);assert.equal(record.raw,raw);assert.equal(record.receipt.sha256,hash(raw));assert.equal((await service.query(input)).reused,true);assert.equal(requests,1);
    await assert.rejects(service.query({...input,mode:'strict'}),/No archived/);
    assert.equal((await service.query({...input,asOf:Date.now(),mode:'strict'})).id,id);
    const request={sourceId:id,asOf:Date.now(),mode:'strict',poisson:.25,shearModulusGPa:32,friction:.4,receiver:{strike:0,dip:30,rake:90},points:[{xKm:20,yKm:20,depthKm:10}]};
    const stress=await service.calculate(request);assert.ok(Number.isFinite(stress.report.values[0].coulombPa));assert.equal(stress.sourceHash,record.receipt.sha256);assert.equal(hash(stress.implementation),stress.implementationHash);
    assert.ok(Object.values(stressIntegrity(stress,saved)).every(Boolean));assert.equal(stressIntegrity({...stress,sourceId:'wrong'},saved).sourceLinked,false);assert.equal(stressIntegrity(stress,{...saved,raw:raw+'changed'}).sourceValid,false);assert.equal(stressIntegrity({...stress,report:{}},saved).recordValid,false);
    assert.equal(service.history({...request,asOf:Date.now()}).length,1);assert.equal(service.history({...request,asOf:stress.createdAt-1}).length,0);assert.equal(service.history({...request,mode:'catalog-replay',asOf:300}).length,1);
    assert.equal((await service.calculate(request)).reused,true);await assert.rejects(service.calculate({...request,asOf:300}),/receipt/);
    const {id:stressId,...stressBody}=service.stress(stress.id);assert.equal(hash(stressBody),stressId);assert.throws(()=>store.db.exec('DELETE FROM rupture_stress'),/immutable/);
    assert.throws(()=>store.db.exec('DELETE FROM rupture_inputs'),/immutable/);assert.throws(()=>store.db.exec("UPDATE rupture_inputs SET body='{}'"),/immutable/);
  }finally{store.close();}
});
