import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Store} from '../server/store.mjs';
import {ImportJobs,CatalogRequestError,fetchImportChunk,coverageComplete,importOptions} from '../server/import-jobs.mjs';
import {DAY,validateBounds,insideBounds,boundsContain,circleBounds} from '../server/geo.mjs';
const options={start:Date.UTC(2000,0,1),end:Date.UTC(2000,3,1),minMagnitude:5,provider:'USGS'};
const result=interval=>({events:[{id:'USGS:'+interval.start,provider:'USGS',time:interval.start+1,lat:1,lon:2,mag:5,depth:20,type:'earthquake'}],receipt:{url:'https://example.invalid/test',fetchedAt:Date.now(),receivedRows:1,sha256:'test-only'}});
async function until(predicate){const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw new Error('Import did not reach expected state');await delay(5);}}
test('durable imports pause, recover after restart, deduplicate, retain receipts and cover only committed chunks',async()=>{
  const file=path.join(mkdtempSync(path.join(tmpdir(),'seismo-import-')),'test.sqlite');let store=new Store(file),calls=0;
  let manager=new ImportJobs(store,{paceMs:0,fetchChunk:async(o,i,signal)=>{if(++calls>1)await delay(60000,undefined,{signal});return result(i);}});
  const first=manager.create(options);await until(()=>manager.get(first.id).completedChunks===1);manager.control(first.id,'pause');await manager.active.promise;assert.equal(manager.get(first.id).status,'paused');assert.equal(store.events().length,1);assert.equal(coverageComplete(store.get('coverage'),options),false);assert.equal(manager.create(options).reused,true);
  manager.control(first.id,'resume');await until(()=>manager.get(first.id).status==='running');await manager.shutdown();assert.equal(manager.get(first.id).status,'queued');const through=manager.get(first.id).coveredThrough;store.close();
  store=new Store(file);manager=new ImportJobs(store,{paceMs:0,fetchChunk:async(o,i)=>{assert.ok(i.start>=through);return result(i);}});manager.kick();await manager.active.promise;assert.equal(manager.get(first.id).status,'completed');assert.equal(store.events().length,3);assert.equal(coverageComplete(store.get('coverage'),options),true);assert.equal(manager.receipts(first.id).length,3);assert.throws(()=>store.db.exec('DELETE FROM catalog_import_receipts'),/immutable/);
  const again=manager.create(options);await manager.active.promise;assert.equal(manager.get(again.id).newRevisions,0);assert.equal(store.events().length,3);
  const cancelled=manager.create({...options,minMagnitude:6});manager.control(cancelled.id,'cancel');await manager.active.promise;assert.equal(manager.get(cancelled.id).status,'cancelled');assert.equal(store.events().length,3);await manager.shutdown();store.close();
});
test('dense chunks split, transient failures retry, and failed validation or transactions never claim missing coverage',async()=>{
  const store=new Store(':memory:');let split=false,retried=false;
  const manager=new ImportJobs(store,{paceMs:0,retryBaseMs:1,fetchChunk:async(o,i)=>{if(!split){split=true;throw new CatalogRequestError('Result limit',{split:true});}if(!retried){retried=true;throw new CatalogRequestError('Unavailable',{retryable:true});}return result(i);}});
  const job=manager.create({...options,end:options.start+DAY});await manager.active.promise;assert.equal(manager.get(job.id).status,'completed');assert.equal(manager.get(job.id).requests,4);assert.equal(manager.get(job.id).completedChunks,2);assert.equal(coverageComplete(store.get('coverage'),{...options,end:options.start+DAY}),true);
  manager.fetchChunk=async()=>{throw new CatalogRequestError('Invalid record',{receipt:{url:'test',rejected:[{id:'bad'}]}});};const bad=manager.create({...options,start:options.start+2*DAY,end:options.start+3*DAY});await manager.active.promise;assert.equal(manager.get(bad.id).status,'failed');assert.equal(manager.get(bad.id).coveredThrough,options.start+2*DAY);assert.equal(manager.receipts(bad.id)[0].rejected[0].id,'bad');assert.equal(coverageComplete(store.get('coverage'),manager.get(bad.id).options),false);
  const original=store.ingest.bind(store);store.ingest=(...args)=>{original(...args);throw new Error('Storage failure after insert');};manager.fetchChunk=async(o,i)=>result(i);manager.control(bad.id,'resume');await manager.active.promise;assert.equal(manager.get(bad.id).status,'failed');assert.equal(store.events().length,2);assert.equal(manager.receipts(bad.id).filter(r=>r.success).length,0);await manager.shutdown();store.close();
  assert.equal(coverageComplete([{...options,end:options.start+DAY},{...options,start:options.start+DAY,end:options.start+2*DAY}],{...options,end:options.start+2*DAY}),true);assert.equal(coverageComplete([{...options,end:options.start+DAY},{...options,start:options.start+DAY+1,end:options.start+2*DAY}],{...options,end:options.start+2*DAY}),false);assert.throws(()=>importOptions({...options,provider:'invented'}));
});
test('provider responses handle empty intervals, limits, retry hints and rejected rows without manufacturing coverage',async t=>{
  const signal=new AbortController().signal,interval={start:options.start,end:options.start+DAY};let response=new Response(null,{status:204});t.mock.method(globalThis,'fetch',async()=>response);
  assert.equal((await fetchImportChunk(options,interval,signal)).events.length,0);
  response=new Response('exceeds search limit of 20000',{status:400});await assert.rejects(fetchImportChunk(options,interval,signal),e=>e.split===true);
  response=new Response('Busy',{status:429,headers:{'Retry-After':'2'}});await assert.rejects(fetchImportChunk(options,interval,signal),e=>e.retryable&&e.retryAfterMs===2000);
  response=new Response(JSON.stringify({features:[{id:'broken',properties:{mag:5,time:options.start+1},geometry:{coordinates:[0,0,null]}}]}));await assert.rejects(fetchImportChunk(options,interval,signal),e=>e.receipt.rejected.length===1&&!e.retryable);
});
test('regional and dateline imports validate geographic scope without claiming global coverage',async t=>{
  const bounds=validateBounds({south:-30,north:-10,west:170,east:-170}),query={...options,bounds};
  assert.equal(coverageComplete([query],options),false);
  assert.equal(coverageComplete([options],query),true);
  assert.equal(coverageComplete([query],{...query,bounds:{south:-25,north:-15,west:175,east:-175}}),true);
  assert.equal(coverageComplete([query],{...query,bounds:{south:-25,north:-15,west:0,east:10}}),false);
  assert.ok(insideBounds({lat:-20,lon:180},bounds));assert.ok(insideBounds({lat:-20,lon:-180},bounds));assert.equal(insideBounds({lat:0,lon:179},bounds),false);
  assert.ok(boundsContain(undefined,bounds));assert.equal(boundsContain(bounds,undefined),false);
  const cap=circleBounds(0,179,500);assert.ok(cap.west>cap.east);assert.ok(insideBounds({lat:0,lon:-179},cap));assert.deepEqual(circleBounds(89,0,500).east,180);
  assert.throws(()=>validateBounds({south:10,north:0,west:0,east:1}));assert.throws(()=>importOptions({...options,bounds:null}));assert.throws(()=>validateBounds({south:0,north:10,west:180,east:-180}));
  const interval={start:options.start,end:options.start+DAY},signal=new AbortController().signal;let outside=false,urls=[];
  t.mock.method(globalThis,'fetch',async url=>{const u=new URL(url);urls.push(u);const emsc=u.hostname==='www.seismicportal.eu';return new Response(JSON.stringify({features:[{id:'regional',properties:emsc?{mag:5,time:new Date(options.start+1).toISOString(),lastupdate:new Date(options.start+2).toISOString(),depth:30,evtype:'ke'}:{mag:5,time:options.start+1},geometry:{coordinates:[outside?0:179,-20,emsc?-30:30]}}]}));});
  for(const provider of ['USGS','EMSC']){const r=await fetchImportChunk({...query,provider},interval,signal);assert.equal(r.events.length,1);assert.equal(r.events[0].depth,30);const url=urls.at(-1);assert.equal(url.searchParams.get('format'),provider==='EMSC'?'json':'geojson');assert.equal(url.searchParams.get('minlongitude'),'-190');assert.equal(url.searchParams.get('maxlongitude'),'-170');assert.equal(url.searchParams.get('minlatitude'),'-30');}
  outside=true;await assert.rejects(fetchImportChunk(query,interval,signal),e=>e.receipt.rejected.length===1);
});
