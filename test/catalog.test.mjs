import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store,associateEvents} from '../server/store.mjs';
import {normalize,normalizeDeletions} from '../server/catalog.mjs';
import {scoreForecast} from '../server/engine.mjs';
const event=(id,overrides={})=>({id,provider:'USGS',time:100,updated:150,lat:0,lon:0,depth:10,mag:5,type:'earthquake',status:'reviewed',...overrides});
test('EMSC native JSON preserves ISO origin/revision times, positive depth and explicit ISF classification',()=>{
  const feature={id:'20260901_0000016',geometry:{type:'Point',coordinates:[-178.047,-20.481,-547]},properties:{source_id:'2053839',source_catalog:'EMSC-RTS',lastupdate:'2026-09-01T06:33:52.949158Z',time:'2026-09-01T01:29:12.12Z',flynn_region:'FIJI REGION',depth:547,evtype:'ke',auth:'EMSC',mag:4.8,magtype:'mb',unid:'20260901_0000016'}};
  const n=normalize(feature,'EMSC');assert.equal(n.depth,547);assert.equal(n.time,Date.parse(feature.properties.time));assert.equal(n.updated,Date.parse(feature.properties.lastupdate));assert.equal(n.magType,'mb');assert.equal(n.place,'FIJI REGION');assert.equal(n.status,'unknown');assert.equal(n.type,'earthquake');assert.equal(n.typeCertainty,'known');assert.equal(n.providerFields.lastupdate,feature.properties.lastupdate);assert.equal(n.providerFields.sourceId,'2053839');assert.deepEqual(n.aliases,['EMSC:20260901_0000016']);
  for(const [code,type]of [['se','earthquake'],['kn','nuclear explosion'],['sm','mining explosion'],['ls','landslide'],['uk','unknown'],['xx','unknown']]){const value=normalize({...feature,properties:{...feature.properties,evtype:code}},'EMSC');assert.equal(value.type,type);assert.equal(value.sourceType,code);}
  for(const bad of [{depth:null},{depth:undefined},{time:123},{time:'not a date'},{lastupdate:undefined},{lastupdate:'invalid'}])assert.equal(normalize({...feature,properties:{...feature.properties,...bad}},'EMSC'),null);
});
test('deletions with blank provider IDs are preserved for reconciliation without inventing an identity',()=>{
  const anonymous={id:'',properties:{status:'deleted',time:100,updated:200}},identified={...anonymous,id:'known'};
  const result=normalizeDeletions([anonymous,identified],'https://earthquake.usgs.gov/');
  assert.equal(result.events.length,1);assert.equal(result.events[0].id,'USGS:known');assert.equal(result.quarantined.length,1);assert.deepEqual(result.quarantined[0].feature,anonymous);
  assert.throws(()=>normalizeDeletions([{id:'a',properties:{status:'deleted'}}],''),/cursor not advanced/);
});

test('origin-time revisions are selected before origin-time filtering',()=>{
  const s=new Store(':memory:');
  s.ingest([event('USGS:a')],200);
  s.ingest([event('USGS:a',{time:500,updated:600})],700);
  assert.equal(s.events({asOf:300}).length,0);
  assert.equal(s.events({asOf:300,strict:true})[0].time,100);
  s.close();
});
test('explicit deletions remain visible in prior observation replay and stale responses cannot resurrect them',()=>{
  const s=new Store(':memory:');s.ingest([event('USGS:a')],200);
  s.ingest([event('USGS:a',{status:'deleted',updated:300})],400);
  assert.equal(s.events({asOf:500}).length,0);
  assert.equal(s.events({asOf:250,strict:true}).length,1);
  assert.equal(s.ingest([event('USGS:a')],600),0);
  assert.equal(s.revisions()[0].status,'deleted');
  s.ingest([event('USGS:a',{updated:700})],800);
  assert.equal(s.events().length,1); // An actual later provider restoration is allowed.
  s.close();
});
test('authoritative aliases join transitively without merging colocated events or provider-local IDs',()=>{
  const a=event('USGS:a',{aliases:['USGS:a','USGS:b']}),b=event('USGS:b',{aliases:['USGS:b','USGS:c'],updated:180}),c=event('USGS:c',{updated:190});
  const other=event('USGS:d'),emsc=event('EMSC:a',{provider:'EMSC',aliases:['EMSC:a','USGS:a']});
  const result=associateEvents([a,b,c,other,emsc]);assert.equal(result.length,3);
  assert.deepEqual(result.find(e=>e.id==='USGS:c').aliases,['USGS:a','USGS:b','USGS:c']);
  assert.equal(result.find(e=>e.id==='USGS:c').associatedReports.length,3);
  const s=new Store(':memory:');s.ingest([a,b,c,other,emsc],300);
  assert.equal(s.events({provider:'USGS'}).length,2);assert.equal(s.events({provider:'EMSC'}).length,1);s.close();
});
test('normalization retains provider IDs, and source aliases cannot become forecast hits',()=>{
  const n=normalize({id:'new',geometry:{coordinates:[0,0,10]},properties:{mag:5,time:200,ids:',old,new,'}});
  assert.deepEqual(n.aliases,['USGS:new','USGS:old']);
  const f={sources:['USGS:old'],center:{lat:0,lon:0},radiusKm:100,magnitude:{min:4,max:6,central:5},validFrom:100,validUntil:300};
  assert.equal(scoreForecast(f,[n],400).status,'MISS');
  assert.equal(scoreForecast(f,[event('EMSC:x',{provider:'EMSC',time:200})],400).status,'MISS');
});
