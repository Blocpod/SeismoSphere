import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,hash} from '../server/store.mjs';
import {RuptureInputs} from '../server/rupture-inputs.mjs';
import {parseCoulombInput} from '../server/coulomb-input.mjs';
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
    assert.throws(()=>store.db.exec('DELETE FROM rupture_inputs'),/immutable/);assert.throws(()=>store.db.exec("UPDATE rupture_inputs SET body='{}'"),/immutable/);
  }finally{store.close();}
});
