import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {Store} from '../server/store.mjs';
import {Access} from '../server/access.mjs';

test('trust replacement is reviewed, restart-safe and atomic; old trust and sessions cannot authenticate afterward',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'seismo-rotation-')),store=new Store(':memory:');let access=new Access(store,{directory,test:true,localPort:15418});
  const handler=async(req,res)=>{if(await access.guard(req,res,new URL(req.url,'https://127.0.0.1').pathname)){res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');}};
  const settings={host:'127.0.0.1',port:15438,bootstrapPort:15419};
  const get=(ca,route='/api/access',headers={})=>new Promise((resolve,reject)=>{https.get('https://127.0.0.1:15438'+route,{ca,headers,agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));}).on('error',reject);});
  try{
    await access.prepare('127.0.0.1');
    // Exercise migration of the original installation's flat TLS directory.
    for(const file of ['root.pem','root.cer','issuer.pem','issuer-key.pem','server-key.pem','server-chain.pem','metadata.json'])copyFileSync(path.join(access.certificateDirectory,file),path.join(directory,file));store.set('tlsState',{});
    const old=access.info().certificate,oldCA=readFileSync(path.join(directory,'root.pem')),oldLeaf=readFileSync(path.join(directory,'server-chain.pem'));
    await access.start(handler,settings);const code=access.invite().code,paired=access.pair(code,'Old phone','fixture'),cookie=access.cookie(paired.token);
    await assert.rejects(access.prepareRotation('127.0.0.1'),/Turn off/);await access.stop();
    const preparing=access.prepareRotation('127.0.0.1');await assert.rejects(access.start(handler,settings),/already running/);await preparing;
    let pending=access.info().pendingRotation;assert.notEqual(pending.certificate.rootFingerprint,old.rootFingerprint);assert.equal(access.info().certificate.rootFingerprint,old.rootFingerprint);assert.deepEqual(readFileSync(path.join(directory,'server-chain.pem')),oldLeaf);assert.ok(!existsSync(path.join(access.generationDirectory(pending.id),'root-key.pem')));
    await assert.rejects(access.activateRotation(pending.id,old.rootFingerprint),/stale/);
    await access.cancelRotation();assert.ok(!existsSync(path.join(access.generationDirectory(pending.id),'issuer-key.pem')));await assert.rejects(access.activateRotation(pending.id,pending.certificate.rootFingerprint),/stale/);
    await access.prepareRotation('127.0.0.1');pending=access.info().pendingRotation;access.close();access=new Access(store,{directory,test:true,localPort:15418});assert.equal(access.info().pendingRotation.id,pending.id);
    const staged=access.generationDirectory(pending.id),newLeaf=readFileSync(path.join(staged,'server-chain.pem'));writeFileSync(path.join(staged,'server-chain.pem'),oldLeaf);await assert.rejects(access.activateRotation(pending.id,pending.certificate.rootFingerprint),/validation/);assert.equal(access.info().certificate.rootFingerprint,old.rootFingerprint);writeFileSync(path.join(staged,'server-chain.pem'),newLeaf);
    const publicRoot=readFileSync(path.join(staged,'root.cer'));copyFileSync(path.join(directory,'root.cer'),path.join(staged,'root.cer'));await assert.rejects(access.activateRotation(pending.id,pending.certificate.rootFingerprint),/validation/);writeFileSync(path.join(staged,'root.cer'),publicRoot);
    const original=store.set.bind(store),mock=t.mock.method(store,'set',(key,value)=>{if(key==='sharing')throw new Error('Controlled database failure');return original(key,value);});await assert.rejects(access.activateRotation(pending.id,pending.certificate.rootFingerprint),/Controlled database failure/);mock.mock.restore();assert.equal(access.info().certificate.rootFingerprint,old.rootFingerprint);assert.ok(existsSync(path.join(directory,'issuer-key.pem')));
    // Even stale persisted credentials must be revoked by the committed replacement.
    store.set('deviceSessions',{fixture:paired.session});store.set('deviceInvite',{fixture:true});await access.activateRotation(pending.id,pending.certificate.rootFingerprint);
    assert.equal(access.info().certificate.rootFingerprint,pending.certificate.rootFingerprint);assert.equal(access.info().pendingRotation,null);assert.deepEqual(store.get('deviceSessions'),{});assert.equal(store.get('deviceInvite'),null);assert.ok(!existsSync(path.join(directory,'issuer-key.pem')));assert.ok(!existsSync(path.join(directory,'server-key.pem')));assert.equal(access.info().replacedTrust.rootFingerprint,old.rootFingerprint);
    access.close();access=new Access(store,{directory,test:true,localPort:15418});await access.start(handler,settings);const ca=readFileSync(path.join(access.certificateDirectory,'root.pem'));assert.equal(await get(ca),200);await assert.rejects(get(oldCA));assert.equal(await get(ca,'/api/events',{Cookie:cookie}),401);assert.equal(await get(ca,'/api/sharing/activate-rotation'),403);
    const cer=Buffer.from(await(await fetch('http://127.0.0.1:15419/certificate.cer')).arrayBuffer());assert.deepEqual(cer,readFileSync(path.join(access.certificateDirectory,'root.cer')));
    await access.stop();const before=access.certificateDirectory;await access.prepare('127.0.0.1');assert.notEqual(access.certificateDirectory,before);assert.equal(access.info().certificate.rootFingerprint,pending.certificate.rootFingerprint);assert.ok(!existsSync(path.join(before,'issuer-key.pem')));await access.start(handler,settings);assert.equal(await get(ca),200);await access.stop();
  }finally{access.close();store.close();}
});

test('pairing codes are single-use, tokens stay hashed, sessions expire and can be revoked',()=>{
  const store=new Store(':memory:'),access=new Access(store,{test:true});access.tls={};
  try{
    const invite=access.invite('viewer');assert.equal(invite.code.replaceAll('-','').length,12);
    const paired=access.pair(invite.code,'Test phone','a');assert.equal(paired.session.role,'viewer');
    const persisted=JSON.stringify(store.get('deviceSessions'));assert.ok(!persisted.includes(paired.token));
    assert.throws(()=>access.pair(invite.code,'Other phone','b'),/invalid or expired/);
    const req={headers:{cookie:access.cookie(paired.token)},socket:{once(){}}};
    assert.equal(access.session(req).id,paired.session.id);
    req.socket.destroy=()=>{};access.revoke(paired.session.id);assert.equal(access.session(req),null);
    const code=access.invite().code,record=store.get('deviceInvite');store.set('deviceInvite',{...record,expiresAt:Date.now()-1});assert.throws(()=>access.pair(code,'Test','c'),/expired/);
    for(let i=0;i<6;i++)assert.throws(()=>access.pair('incorrect','Test','rate'),/invalid/);
    assert.throws(()=>access.pair('incorrect','Test','rate'),/Too many/);
  }finally{access.tls=null;access.close();store.close();}
});

test('TLS chain validates; unauthenticated, cross-origin, owner-only and viewer mutations are blocked',async()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'seismo-tls-')),store=new Store(':memory:');
  const access=new Access(store,{directory,test:true,localPort:15318});
  try{
    await access.prepare('127.0.0.1');
    const ca=readFileSync(path.join(access.certificateDirectory,'root.pem'));
    const handler=async(req,res)=>{const p=new URL(req.url,'https://127.0.0.1').pathname;if(!await access.guard(req,res,p))return;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({allowed:true,role:req.access?.role}));};
    await access.start(handler,{host:'127.0.0.1',port:15338,bootstrapPort:15319});
    const request=(url,method='GET',body=null,headers={})=>new Promise((resolve,reject)=>{const req=https.request('https://127.0.0.1:15338'+url,{ca,method,headers:{...(method==='POST'?{'Content-Type':'application/json',Origin:'https://127.0.0.1:15338'}:{}),...headers}},res=>{let raw='';res.on('data',d=>raw+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:raw?JSON.parse(raw):null}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
    assert.equal((await request('/api/events')).status,401);
    const code=access.invite('viewer').code;
    const pair=await request('/api/pair','POST',{code,name:'Browser fixture'});assert.equal(pair.status,200);
    const cookie=pair.headers['set-cookie'][0].split(';')[0];assert.match(pair.headers['set-cookie'][0],/Secure; HttpOnly; SameSite=Strict/);
    assert.equal((await request('/api/events','GET',null,{Cookie:cookie})).status,200);
    assert.equal((await request('/api/config','POST',{}, {Cookie:cookie})).status,403);
    assert.equal((await request('/api/transcribe','POST',{}, {Cookie:cookie})).status,403);
    assert.equal((await request('/api/sharing/status','GET',null,{Cookie:cookie})).status,403);
    assert.equal((await request('/api/midpoint','POST',{}, {Cookie:cookie,Origin:'https://evil.example'})).status,403);
    assert.equal((await request('/api/midpoint','POST',{}, {Cookie:cookie,Origin:''})).status,403);
    assert.equal((await request('/api/midpoint','POST',{}, {Cookie:cookie})).status,200);
    const bootstrap=await fetch('http://127.0.0.1:15319/');assert.equal(bootstrap.status,200);assert.ok((await bootstrap.text()).includes('fingerprint'));
    const leaked=await fetch('http://127.0.0.1:15319/api/events');assert.equal(leaked.status,404);
    await access.stop();assert.equal(Object.keys(store.get('deviceSessions')).length,0);
  }finally{access.close();store.close();}
});
