import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {DAY} from '../server/geo.mjs';
test('spatial API stores reusable immutable runs with separate training/outcome evidence',async()=>{
  const file=path.join(mkdtempSync(path.join(os.tmpdir(),'seismo-spatial-api-')),'test.sqlite'),store=new Store(file),end=Date.now()-3*DAY,start=end-20*DAY,holdoutEnd=end+2*DAY;
  const defaults=JSON.parse(readFileSync(new URL('../config/default.json',import.meta.url)));store.set('config',{...defaults,aiProvider:'deterministic'});
  const events=Array.from({length:40},(_,i)=>({id:'e'+i,provider:'USGS',type:'earthquake',status:'reviewed',mag:4+(i%4)*.2,depth:10,lat:31+(i%5)*.1,lon:131+(i%7)*.1,time:start+(.1+i*.49)*DAY}));
  events.push({...events[0],id:'outcome1',time:end+DAY,mag:8},{...events[1],id:'outcome2',time:end+1.2*DAY,mag:5});store.ingest(events,Date.now());store.set('coverage',[{provider:'USGS',start:start-5*DAY,end:holdoutEnd,minMagnitude:4,bounds:{south:30,north:35,west:130,east:135}}]);store.close();
  const root='http://127.0.0.1:14319',child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'14319',SEISMO_DB:file,SEISMO_TEST_MODE:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Test server did not start')),10000);child.stdout.on('data',b=>{if(String(b).includes('SeismoSphere running')){clearTimeout(timeout);resolve();}});child.on('error',reject);});
    const body={start:new Date(start).toISOString(),end:new Date(end).toISOString(),holdoutEnd:new Date(holdoutEnd).toISOString(),historyDays:5,minMagnitude:4,south:30,north:35,west:130,east:135};
    const fit=()=>fetch(root+'/api/spatial-etas-fit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const response=await fit(),run=await response.json();assert.equal(response.status,200,JSON.stringify(run));assert.equal(run.fit.training.events,40);assert.equal(run.holdout.events,2);assert.equal(run.fit.frozenHistory.some(e=>e.id==='outcome1'),false);
    const repeat=await(await fit()).json();assert.equal(repeat.reused,true);assert.equal(repeat.id,run.id);
    const exported=await(await fetch(root+'/api/statistical-export?id='+run.id)).json();assert.equal(exported.snapshots.length,2);assert.equal(exported.snapshots[0].events.length,40);assert.equal(exported.snapshots[1].events.length,2);
    const list=await(await fetch(root+'/api/statistical-runs?family=spatial')).json();assert.equal(list.runs.length,1);assert.equal((await(await fetch(root+'/api/statistical-runs?family=temporal')).json()).runs.length,0);
    const chat=await fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asOf:end,mode:'catalog-replay',statisticalRunId:run.id,horizonDays:7,message:'Explain this statistical model'})});assert.equal(chat.status,200);const explanation=await chat.json();assert.match(explanation.answer,/Spatial ETAS was fitted on 40 events/);assert.match(explanation.answer,/Holdout results are withheld/);assert.ok(explanation.actions.includes('research'));assert.equal(explanation.actions.includes('explain'),false);
    const strictChat=await fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asOf:end,mode:'strict',statisticalRunId:run.id,message:'Explain this model'})});assert.equal(strictChat.status,400);assert.match((await strictChat.json()).error,/not available at the strict observation cutoff/);
    const diagnosticBody={start,end,minMagnitude:4,bounds:{south:30,north:35,west:130,east:135}},diagnose=input=>fetch(root+'/api/completeness',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const diagnosticResponse=await diagnose(diagnosticBody),diagnostic=await diagnosticResponse.json();assert.equal(diagnosticResponse.status,200,JSON.stringify(diagnostic));assert.equal(diagnostic.events,40);assert.equal(diagnostic.pooled.status,'insufficient-events');assert.equal((await(await diagnose(diagnosticBody)).json()).reused,true);
    const diagnosticExport=await(await fetch(root+'/api/diagnostic-export?id='+diagnostic.id)).json();assert.equal(diagnosticExport.snapshotValid,true);assert.equal(diagnosticExport.snapshot.events.length,40);assert.equal((await(await fetch(root+'/api/catalog-diagnostics')).json()).runs[0].id,diagnostic.id);
    assert.equal((await diagnose({...diagnosticBody,bounds:{south:29,north:35,west:130,east:135}})).status,400);assert.equal((await diagnose({...diagnosticBody,minMagnitude:3})).status,400);
    const explainDiagnostic=(asOf,mode='catalog-replay')=>fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asOf,mode,diagnosticRunId:diagnostic.id,message:'Explain this completeness diagnostic'})});
    const diagnosticAnswer=await(await explainDiagnostic(end)).json();assert.match(diagnosticAnswer.answer,/40 earthquakes/);assert.match(diagnosticAnswer.answer,/no stable threshold/);assert.equal(diagnosticAnswer.actions.includes('explain'),false);assert.ok(diagnosticAnswer.actions.includes('research'));assert.equal((await explainDiagnostic(end-1)).status,400);assert.equal((await explainDiagnostic(end,'strict')).status,400);
    const db=new DatabaseSync(file);assert.throws(()=>db.prepare('UPDATE statistical_runs SET body=? WHERE id=?').run('{}',run.id),/immutable/);assert.throws(()=>db.prepare('DELETE FROM statistical_runs WHERE id=?').run(run.id),/immutable/);assert.throws(()=>db.prepare('UPDATE catalog_diagnostics SET body=? WHERE id=?').run('{}',diagnostic.id),/immutable/);assert.throws(()=>db.prepare('DELETE FROM catalog_diagnostics WHERE id=?').run(diagnostic.id),/immutable/);db.close();
  }finally{child.kill();}
});
