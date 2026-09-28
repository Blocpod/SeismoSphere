import {chat,commandActions} from '../server/ai.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calibrateDepth,calibrationOptions,calibrationVariant,calibrationContext} from '../server/calibration.mjs';
import {Store,hash} from '../server/store.mjs';
import {ProspectiveExperiments,prospectiveContext} from '../server/prospective.mjs';
import {DAY} from '../server/geo.mjs';
const config={...JSON.parse(readFileSync('config/default.json')),windowDays:7,radiusKm:100,maxTargets:16},end=Date.UTC(2026,7,30),options=calibrationOptions({start:end-70*DAY,trainEnd:end-35*DAY,end},config),events=Array.from({length:80},(_,i)=>({id:'USGS:cal'+i,provider:'USGS',type:'earthquake',lat:0,lon:i%2?0:10,mag:5,magType:'mw',depth:350,time:end-(80-i)*DAY})),routes={version:'fixture',captureKm:100,maxHops:3,routes:[{id:'r',name:'Test',points:[0,5,10,15].map(lon=>({lat:0,lon})),direction:'forward',kind:'research-corridor',termination:false,provenance:{status:'illustrative'}}]};
test('parameter selection excludes later test data and preserves canonical inputs',()=>{
 const original=structuredClone(config),a=calibrateDepth({events,options,config,routes}),b=calibrateDepth({events:events.map(e=>e.time>options.trainEnd?{...e,mag:8,lon:100}:e),options,config,routes});
 assert.deepEqual(a.selection,b.selection);assert.deepEqual(a.selectedConfig,b.selectedConfig);assert.deepEqual(config,original);assert.notDeepEqual(a.holdout,b.holdout);assert.ok(a.selection.selected.dsForecasts>=5);assert.equal(a.options.testStart,a.options.trainEnd+DAY);
 assert.throws(()=>calibrationOptions({...options,end:Date.now()+DAY},config),/elapsed/);assert.throws(()=>calibrateDepth({events:[],options,config,routes}),/five training/);
});
test('saved calibrated inputs freeze into prospective protocols without changing the workspace',()=>{
 const store=new Store(':memory:');
 try{
  store.db.exec('CREATE TABLE calibration_runs(id TEXT PRIMARY KEY,body TEXT)');
  const report={...calibrateDepth({events,options,config,routes}),createdAt:Date.now()},implementation=Object.fromEntries(['engine','routes','geo'].map(n=>['server/'+n+'.mjs',readFileSync('server/'+n+'.mjs','utf8')])),input={routes,boundaries:[],inputSnapshotId:'fixture-snapshot',implementationSha256:hash(implementation)},id=hash(input),bundle={input,implementation,report,reportSha256:hash(report)};
  store.db.prepare('INSERT INTO calibration_runs VALUES(?,?)').run(id,JSON.stringify(bundle));
  assert.throws(()=>calibrationContext(store,id,report.createdAt-1),/unavailable/);const evidence=calibrationContext(store,id,report.createdAt);assert.equal(evidence.selectedDepth,report.selectedConfig.triggerDepth);assert.equal(evidence.config,undefined);
  const v=calibrationVariant(store,id),service=new ProspectiveExperiments(store),request={name:'Calibrated variant',hypothesis:'Test the frozen learned threshold',start:Date.now()+600000,issuances:1,stepDays:10,settleDays:2};
  const preview=service.preview(request,v.config,v.routes,v.boundaries,v.calibration),registered=service.register({...request,previewHash:preview.previewHash},v.config,v.routes,v.boundaries,v.calibration);
  assert.equal(registered.spec.calibration.id,id);assert.equal(registered.spec.config.triggerDepth,report.selectedConfig.triggerDepth);assert.deepEqual(registered.spec.routes,routes);
  assert.equal(prospectiveContext(service.view(registered.id),Date.now()+1).calibration.id,id);
  const changed=service.preview(request,{...config,midpointMode:'route'},routes,[]);assert.equal(changed.spec.config.midpointMode,'route');assert.notEqual(changed.previewHash,service.preview(request,{...config,midpointMode:'great-circle'},routes,[]).previewHash);
  assert.equal(config.triggerDepth,300);assert.throws(()=>calibrationVariant(store,'missing'),/not found/);
  bundle.report.selectedConfig.triggerDepth=999;store.db.prepare('UPDATE calibration_runs SET body=? WHERE id=?').run(JSON.stringify(bundle),id);assert.throws(()=>calibrationVariant(store,id),/integrity/);
 }finally{store.close();}
});

test('calibration explanations suppress actions and withhold changed saved counts',async t=>{
 const evidence={selection:{objective:'DS minus recent-rate hits per issuance'},sourceSentence:'Selected depth: 300 km. Later DS full hits: 2/10; unchanged DS full hits: 1/10.',limitations:['No demonstrated predictive skill.']},context={calibrationEvidence:evidence};
 assert.deepEqual(commandActions('Show deep earthquakes, global view and forecasts',context),[]);
 assert.equal((await chat('Explain',context,{aiProvider:'deterministic'})).grounded,true);
 let text=evidence.sourceSentence;
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({answer:text,actions:['global']})}})}));
 assert.deepEqual((await chat('Explain global results',context,{aiProvider:'ollama',localModel:'fixture'})).actions,[]);
 text='Selected depth: 400 km. Later DS full hits: 8/10; unchanged DS full hits: 1/10.';
 await assert.rejects(chat('Explain',context,{aiProvider:'ollama',localModel:'fixture'}),/did not preserve/);
});
