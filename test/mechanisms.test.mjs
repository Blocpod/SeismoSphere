import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,hash} from '../server/store.mjs';
import {normalize} from '../server/catalog.mjs';
import {Mechanisms,parseMechanisms,mechanismContext} from '../server/mechanisms.mjs';
import {lowerHemisphere,radiation,nodalBasis,nedToEarth,planeTensor} from '../public/mechanism-geometry.js';
import {chat} from '../server/ai.mjs';
const tensor={mrr:-1.217e17,mtt:3.0395e18,mpp:-2.9178e18,mrt:-3.1138e18,mrp:4.9381e18,mtp:-1.5926e18};
const plane1={strike:148.02,dip:89.34,rake:-59.97},plane2={strike:239.16,dip:30.03,rake:-178.69};
const product={id:'test-product',type:'moment-tensor',source:'us',code:'test_mww',status:'UPDATE',updateTime:200,preferredWeight:100,properties:{...Object.fromEntries(Object.entries(tensor).map(([k,v])=>['tensor-'+k,String(v)])),...Object.fromEntries([plane1,plane2].flatMap((p,i)=>Object.entries(p).map(([k,v])=>[`nodal-plane-${i+1}-${k}`,String(v)]))),'derived-latitude':'-5.0522','derived-longitude':'107.2057','derived-depth':'340.5','derived-eventtime':'2026-09-11T21:24:02.500Z','percent-double-couple':'0.9706','quakeml-publicid':'test-id','scalar-moment':'6.75e18'}};
const detail={id:'test',geometry:{coordinates:[106.8742,-4.9832,372]},properties:{mag:6.5,time:100,updated:150,products:{'moment-tensor':[product],'internal-moment-tensor':[{}]}}};
test('AI mechanism evidence formats scientific notation exactly and withholds exponent corruption',async t=>{
  const record={...parseMechanisms(detail,normalize(detail)),event:normalize(detail),id:'test',createdAt:250},evidence=mechanismContext(record,product.id,300);assert.equal(evidence.product.scalarMomentText,'6.75e+18 N m');let answer='Scalar moment 6.75e+24 N m.';
  t.mock.method(globalThis,'fetch',async(url,input)=>{assert.match(JSON.parse(input.body).messages[1].content,/6\.75e\+18 N m/);return new Response(JSON.stringify({message:{content:JSON.stringify({answer,actions:[]})}}));});
  await assert.rejects(chat('Explain this mechanism',{mechanismEvidence:evidence},{aiProvider:'ollama',localModel:'test'}),/withheld/);answer='Published scalar moment: 6.75e+18 N m. Both nodal planes are ambiguous.';assert.equal((await chat('Explain this mechanism',{mechanismEvidence:evidence},{aiProvider:'ollama',localModel:'test'})).answer,answer);
});
test('lower-hemisphere radiation and both source nodal planes retain orientation, signs and units',()=>{
  assert.deepEqual(lowerHemisphere(0,0),{north:-0,east:0,down:1});assert.equal(lowerHemisphere(2,0),null);
  for(const [x,y]of [[0,-1],[1,0],[.3,.4]]){const n=lowerHemisphere(x,y);assert.ok(Math.abs(Math.hypot(...Object.values(n))-1)<1e-12);}
  assert.equal(radiation(tensor,lowerHemisphere(0,0)),tensor.mrr);assert.equal(radiation(tensor,lowerHemisphere(0,-1)),tensor.mtt);assert.equal(radiation(tensor,lowerHemisphere(1,0)),tensor.mpp);
  const normal=planeTensor({strike:0,dip:45,rake:-90}),reverse=planeTensor({strike:0,dip:45,rake:90}),strike=planeTensor({strike:0,dip:90,rake:0});assert.ok(normal.mrr<0);assert.ok(reverse.mrr>0);assert.ok(strike.mtp<0);
  const first=planeTensor(plane1),second=planeTensor(plane2);for(const key of Object.keys(tensor)){assert.ok(Math.abs(first[key]-second[key])<.001,key);assert.ok(Math.abs(first[key]-tensor[key]/6.75e18)<.015,key);}
  for(const point of [{lat:0,lon:0},{lat:90,lon:180},{lat:-5,lon:107}]){const n=nedToEarth([1,0,0],point),e=nedToEarth([0,1,0],point),d=nedToEarth([0,0,1],point);for(const v of [n,e,d])assert.ok(Math.abs(Math.hypot(...v)-1)<1e-12);assert.ok(Math.abs(n.reduce((s,v,i)=>s+v*e[i],0))<1e-12);}
  const b=nodalBasis(plane1);assert.ok(Math.abs(b.normal.reduce((s,v,i)=>s+v*b.downDip[i],0))<1e-12);
});
test('USGS mechanism parsing preserves complete tensors, nulls, public status and source ambiguity',()=>{
  const event=normalize(detail),parsed=parseMechanisms(detail,event),p=parsed.products[0];assert.deepEqual(p.tensor,tensor);assert.equal(p.tensorUnits,'N m');assert.equal(p.doubleCoupleFraction,.9706);assert.equal(p.scalarMoment,6.75e18);assert.equal(p.derivedOrigin.depth,340.5);assert.equal(event.depth,372);assert.equal(p.productOrigin.depth,null);assert.equal(p.planes.length,2);assert.equal(parsed.excludedInternalProducts,1);
  const missing=structuredClone(detail);missing.properties.products['moment-tensor'][0].properties['tensor-mrr']=' ';assert.equal(parseMechanisms(missing,event).products[0].tensor,null);missing.properties.products['moment-tensor'][0].status='DELETE';assert.equal(parseMechanisms(missing,event).products[0].usable,false);
  const unknownDC=structuredClone(detail);delete unknownDC.properties.products['moment-tensor'][0].properties['quakeml-publicid'];assert.equal(parseMechanisms(unknownDC,event).products[0].doubleCoupleFraction,null);
  assert.throws(()=>parseMechanisms({...detail,id:'wrong'},event),/identity/);assert.throws(()=>parseMechanisms({...detail,properties:{...detail.properties,products:{'moment-tensor':{}}}},event),/inventory/);
});
test('mechanism receipts are immutable, cached per catalog revision and cutoff-gated',async t=>{
  const store=new Store(':memory:'),service=new Mechanisms(store);store.ingest([normalize(detail)],160);let calls=0;t.mock.method(globalThis,'fetch',async url=>{calls++;assert.match(url,/^https:\/\/earthquake\.usgs\.gov\/fdsnws\/event\/1\/query\?/);return new Response(JSON.stringify(detail));});
  try{await assert.rejects(service.query({eventId:'USGS:test',asOf:300,mode:'strict'}),/No saved/);const record=await service.query({eventId:'USGS:test',asOf:300});assert.equal(calls,1);const {id,...body}=service.get(record.id);assert.equal(hash(body),id);assert.equal(hash(body.raw),body.receipt.sha256);assert.equal((await service.query({eventId:'USGS:test',asOf:300})).reused,true);assert.equal(calls,1);
    assert.equal(mechanismContext(record,product.id,300).product.scalarMoment,6.75e18);assert.equal(mechanismContext(record,product.id,300).product.sourceProperties,undefined);assert.throws(()=>mechanismContext(record,product.id,199),/updated after/);assert.throws(()=>mechanismContext(record,product.id,99),/event occurs/);assert.throws(()=>mechanismContext(record,product.id,300,'strict'),/unavailable/);assert.throws(()=>mechanismContext(record,'invented',300),/usable/);assert.equal((await service.query({eventId:'USGS:test',asOf:Date.now(),mode:'strict'})).id,id);
    store.ingest([{...normalize(detail),updated:220}],230);await service.query({eventId:'USGS:test',asOf:300});assert.equal(calls,2);assert.equal(service.list().length,2);assert.throws(()=>store.db.exec('DELETE FROM mechanism_records'),/immutable/);assert.throws(()=>store.db.exec("UPDATE mechanism_records SET body='{}'"),/immutable/);
  }finally{store.close();}
});
