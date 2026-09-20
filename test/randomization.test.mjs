import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Store,hash} from '../server/store.mjs';
import {DAY} from '../server/geo.mjs';
import {RandomizationJobs} from '../server/randomization-jobs.mjs';
import {randomizationOptions,randomizationInput,randomizedCatalog,randomizationSummary,randomizationContext,scoreCatalog} from '../server/randomization.mjs';
const start=Date.UTC(2011,0,1),config={...JSON.parse(readFileSync(new URL('../config/default.json',import.meta.url))),maxTargets:3},routes={version:'test',status:'test fixture',routes:[]},options=randomizationOptions({start:start+20*DAY,end:start+45*DAY,replicates:19,stepDays:5,seed:71,blockDays:7}),raw=Array.from({length:100},(_,i)=>({id:'USGS:test'+i,sourceId:'test'+i,provider:'USGS',type:'earthquake',time:start+i*.5*DAY,lat:i%4*6,lon:100+i%5*7,depth:i%3?20:400,mag:5+i%3*.2,magType:'mw'})),events=randomizationInput(raw,options,config);
test('randomization HTTP flow requires coverage, exports evidence and rejects mixed or future AI context',async()=>{
 const file=path.join(mkdtempSync(path.join(tmpdir(),'seismo-randomization-api-')),'test.sqlite'),store=new Store(file);store.set('config',{...config,aiProvider:'deterministic'});store.ingest(raw,Date.now());store.set('coverage',[{provider:'USGS',start:options.start-config.lookbackDays*DAY,end:options.end,minMagnitude:3.5}]);store.close();
 const root='http://127.0.0.1:14325',child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'14325',SEISMO_DB:file,SEISMO_TEST_MODE:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Test server startup timed out')),10000);child.stdout.on('data',b=>{if(String(b).includes('SeismoSphere running')){clearTimeout(timer);resolve();}});child.on('error',reject);});
  const post=(url,body,headers={})=>fetch(root+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const tooShallow=await post('/api/randomization-run',options);assert.equal(tooShallow.status,400);assert.match((await tooShallow.json()).error,/coverage/);const expanded=new Store(file);expanded.set('coverage',[{provider:'USGS',start:options.start-config.lookbackDays*DAY,end:options.end,minMagnitude:3}]);expanded.close();
  assert.equal((await post('/api/randomization-run',{...options,start:options.start-DAY})).status,400);
  assert.equal((await post('/api/randomization-run',{...options,replicates:0})).status,400);
  assert.equal((await post('/api/randomization-run',options,{Origin:'https://unrelated.example'})).status,403);
  const response=await post('/api/randomization-run',options),created=await response.json();assert.equal(response.status,202,JSON.stringify(created));let job;
  const deadline=Date.now()+30000;do{job=await(await fetch(root+'/api/randomization-job?id='+created.id)).json();if(['completed','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);
  assert.equal(job.status,'completed',JSON.stringify(job));assert.equal(job.completed,19);assert.equal((await(await post('/api/randomization-run',options)).json()).reused,true);
  const exported=await(await fetch(root+'/api/randomization-export?id='+job.id)).json();assert.deepEqual(exported.integrity,{inputValid:true,snapshotValid:true,reportValid:true});assert.equal(exported.snapshot.events.some(e=>e.time>options.end),false);
  const question={asOf:options.end,mode:'catalog-replay',randomizationRunId:job.id,message:'Explain this randomization comparison'},answer=await(await post('/api/chat',question)).json();assert.equal(answer.provider,'deterministic');assert.match(answer.answer,/Monte Carlo/i);assert.ok(answer.actions.includes('research'));assert.equal(answer.actions.includes('explain'),false);
  for(const override of [{asOf:options.end-1},{mode:'strict'},{mode:'other'},{analysisId:'other'},{forecastId:'other'},{diagnosticRunId:'other'}])assert.equal((await post('/api/chat',{...question,...override})).status,400);
  assert.equal((await post('/api/randomization-control',{id:job.id,action:'invalid'})).status,400);assert.equal((await(await fetch(root+'/api/ledger')).json()).forecasts.length,0);
 }finally{child.kill();}
});
test('timestamp permutations retain coupled marks and exact block counts, and do not mutate input or use future observations',()=>{
 const before=structuredClone(events),a=randomizedCatalog(events,options,config,0),b=randomizedCatalog(events,options,config,1);assert.deepEqual(events,before);assert.deepEqual(a,randomizedCatalog(events,options,config,0));assert.notDeepEqual(a,b);assert.deepEqual(a.map(e=>e.time).sort((a,b)=>a-b),events.map(e=>e.time).sort((a,b)=>a-b));
 const begin=options.start-config.lookbackDays*DAY;for(const e of a){const original=events.find(x=>x.id===e.id);for(const field of ['id','lat','lon','mag','depth'])assert.equal(e[field],original[field]);if(original.time<begin)assert.equal(e.time,original.time);else assert.equal(Math.floor((e.time-begin)/(7*DAY)),Math.floor((original.time-begin)/(7*DAY)));}
 assert.deepEqual(randomizationInput([...raw,{...raw[0],id:'future',time:options.end+1}],options,config),events);assert.throws(()=>randomizationOptions({...options,replicates:1}));assert.throws(()=>randomizationOptions({...options,seed:-1}));assert.throws(()=>randomizationInput(events,{...options,end:options.start+DAY},config));
 const summary=randomizationSummary({extraHitsPerIssuance:4},[1,4,5].map(extraHitsPerIssuance=>({extraHitsPerIssuance})));assert.equal(summary.atLeastObserved,2);assert.equal(summary.monteCarloTail,.75);assert.equal(randomizationSummary({extraHitsPerIssuance:100},[{extraHitsPerIssuance:0}]).monteCarloTail,.5);assert.throws(()=>randomizationSummary({},[]));
});
test('worker checkpoints pause, survive reopening, resume reproducibly and freeze reports without issuing forecasts',async()=>{
 const file=path.join(mkdtempSync(path.join(tmpdir(),'seismo-randomization-')),'test.sqlite');let store=new Store(file),manager,paused=false;
 manager=new RandomizationJobs(store,{onChange:j=>{if(!paused&&j.status==='running'&&j.completed===3){paused=true;void manager.control(j.id,'pause');}}});const first=manager.create(raw,options,config,routes,[],[]),firstExit=manager.active.promise;await firstExit;assert.equal(manager.get(first.id).status,'paused');assert.equal(manager.get(first.id).completed,3);await manager.shutdown();store.close();
 store=new Store(file);manager=new RandomizationJobs(store);manager.resume(first.id);await manager.active.promise;const job=manager.get(first.id);assert.equal(job.status,'completed');assert.equal(job.completed,19);const exported=manager.export(first.id);assert.deepEqual(exported.integrity,{inputValid:true,snapshotValid:true,reportValid:true});assert.equal(store.ledger().length,0);assert.equal(manager.create(raw,options,config,routes,[],[]).reused,true);
 for(const i of [0,2,3,18]){const catalog=randomizedCatalog(events,options,config,i),score=scoreCatalog(catalog,options,config,routes,[]);assert.equal(job.report.replicates[i].catalogDigest,hash(catalog));assert.equal(job.report.replicates[i].forecastDigest,score.forecastDigest);assert.equal(job.report.replicates[i].extraHitsPerIssuance,score.extraHitsPerIssuance);}
 assert.throws(()=>store.db.exec('DELETE FROM randomization_runs'),/immutable/);assert.throws(()=>randomizationContext(job.report,options.end-1),/beyond/);assert.throws(()=>randomizationContext(job.report,options.end,'strict'),/unavailable/);assert.equal(randomizationContext(job.report,options.end).comparison.replicates,19);
 const second=manager.create(raw,{...options,seed:72},config,routes,[],[]);await manager.control(second.id,'cancel');assert.equal(manager.get(second.id).status,'cancelled');manager.resume(second.id);await manager.active.promise;assert.equal(manager.get(second.id).status,'completed');
 const obsolete={...manager.input(first.id).input,engineVersion:'older-engine'},obsoleteId=hash(obsolete);store.db.prepare('INSERT INTO randomization_jobs VALUES(?,?,?,?,?,?)').run(obsoleteId,Date.now(),Date.now(),'paused',JSON.stringify(obsolete),JSON.stringify({observed:null,replicates:[]}));assert.throws(()=>manager.resume(obsoleteId),/original randomization and forecast engine versions/);assert.equal(manager.active,null);
 await manager.shutdown();store.close();
});
