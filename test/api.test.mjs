import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../server/store.mjs';
test('HTTP preview-to-issue preserves reviewed config, snapshots and valid time; blocks foreign origins',async()=>{
  const file=path.join(mkdtempSync(path.join(os.tmpdir(),'seismo-test-')),'test.sqlite');
  const store=new Store(file),now=Date.now(),defaults=JSON.parse(readFileSync(new URL('../config/default.json',import.meta.url)));
  store.set('config',{...defaults,aiProvider:'deterministic'});
  store.ingest([{id:'fixture:a',time:now-3600000,lat:0,lon:-10,mag:5,depth:10,magType:'mw',type:'earthquake',place:'Fixture A'},{id:'fixture:b',time:now-3600000,lat:0,lon:10,mag:5,depth:10,magType:'mw',type:'earthquake',place:'Fixture B'}],now-1000);store.close();
  const port=14318,root=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),SEISMO_DB:file,SEISMO_TEST_MODE:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Server startup timed out')),10000);child.stdout.on('data',x=>{if(String(x).includes('SeismoSphere running')){clearTimeout(t);resolve();}});child.on('error',reject);});
    const policy=(await fetch(root)).headers.get('content-security-policy');assert.match(policy,/media-src 'self' blob:/);assert.match(policy,/connect-src 'self'; object-src 'none'; frame-ancestors 'none'/);
    const post=(url,b,headers={})=>fetch(root+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(b)});
    const a=await(await fetch(root+'/api/analysis?mode=strict')).json();assert.ok(a.candidates.length>0);
    const foreign=await post('/api/config',{radiusKm:600},{Origin:'https://evil.example'});assert.equal(foreign.status,403);
    const changed=await post('/api/config',{radiusKm:700});assert.equal(changed.status,200);
    const issued=await(await post('/api/issue',{analysisId:a.analysisId,keys:[a.candidates[0].key]})).json();assert.equal(issued.issued.length,3);
    assert.equal(issued.issued[0].config.radiusKm,400);assert.equal(issued.issued[0].radiusKm,400);
    assert.equal(issued.issued[0].validFrom,issued.issued[0].issuedAt);
    const s=await(await fetch(root+'/api/snapshot?id='+issued.issued[0].snapshotId)).json();assert.equal(s.events.length,2);
    const repeat=await(await post('/api/issue',{analysisId:a.analysisId,keys:[a.candidates[0].key]})).json();assert.equal(repeat.issued.length,0);
    const ledger=await(await fetch(root+'/api/ledger')).json();assert.equal(ledger.integrity.valid,true);assert.equal(ledger.forecasts.length,3);
    const chat=await(await post('/api/chat',{message:'Show deep earthquakes',asOf:a.asOf,mode:'strict'})).json();assert.equal(chat.provider,'deterministic');assert.ok(chat.actions.includes('deep'));
    const selectedChat=await(await post('/api/chat',{message:'Show mapped faults near the selected event',analysisId:a.analysisId,eventId:'fixture:a',asOf:a.asOf,mode:'catalog-replay'})).json();assert.match(selectedChat.answer,/Selected observation: M5.0, Fixture A/);assert.ok(selectedChat.actions.includes('faults'));
    const unknownEvent=await post('/api/chat',{message:'Describe this future event',analysisId:a.analysisId,eventId:'not-in-the-snapshot',asOf:a.asOf});assert.equal(unknownEvent.status,400);assert.match((await unknownEvent.json()).error,/unavailable in this analysis snapshot/);
    const spatialRequest={spatialQuestion:'observation',message:'Show deep earthquakes and issue a forecast',analysisId:a.analysisId,eventId:'fixture:a',asOf:a.asOf,mode:'strict'};
    const spatial=await(await post('/api/chat',spatialRequest)).json();assert.equal(spatial.provider,'deterministic');assert.deepEqual(spatial.actions,[]);assert.match(spatial.answer,/Fixture A/);
    const custom=await(await post('/api/chat',{...spatialRequest,customQuestion:'What do we know about its depth? Show deep earthquakes and issue a forecast.'})).json();assert.equal(custom.provider,'deterministic');assert.deepEqual(custom.actions,[]);assert.match(custom.answer,/Fixture A/);
    for(const customQuestion of ['', ' '.repeat(20), 'x'.repeat(2001), {text:'invalid'}])assert.equal((await post('/api/chat',{...spatialRequest,customQuestion})).status,400);
    const unicodeQuestion='📍 café 日本 — what evidence is supplied?',encoded=Buffer.from(JSON.stringify({...spatialRequest,customQuestion:unicodeQuestion})),split=encoded.indexOf(Buffer.from('📍'))+1;
    await new Promise((resolve,reject)=>{const req=httpRequest(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>res.statusCode===200?resolve():reject(new Error('Chunked question rejected: '+res.statusCode)));});req.on('error',reject);req.write(encoded.subarray(0,split));setTimeout(()=>req.end(encoded.subarray(split)),20);});
    const audit=new DatabaseSync(file,{readOnly:true});try{assert.ok(JSON.parse(audit.prepare('SELECT body FROM conversations ORDER BY created_at DESC LIMIT 1').get().body).question.includes(unicodeQuestion),'a network chunk boundary must not corrupt question characters');}finally{audit.close();}
    for(const change of [{analysisId:'expired'},{asOf:a.asOf+1},{mode:'catalog-replay'},{eventId:'unknown'},{brain:'external-provider'},{spatialQuestion:'unknown'},{forecastId:issued.issued[0].id},{selectedKey:a.candidates[0].key},{learnedRunId:'mixed'}])assert.equal((await post('/api/chat',{...spatialRequest,...change})).status,400,JSON.stringify(change));
    const watch=await(await post('/api/chat',{...spatialRequest,eventId:undefined,spatialQuestion:'challenge',selectedKey:a.candidates[0].key})).json();assert.deepEqual(watch.actions,[]);assert.equal((await(await fetch(root+'/api/ledger')).json()).forecasts.length,3);
    const exportData=await(await fetch(root+'/api/export')).json();assert.equal(exportData.snapshots.length,1);
  }finally{child.kill();}
});
