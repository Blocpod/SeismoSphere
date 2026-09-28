import {RouteHistory} from '../server/routes.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
const dir=mkdtempSync('artifacts/calibration-acceptance-'),db=dir+'/test.sqlite',store=new Store(db),now=Date.now(),config=JSON.parse(readFileSync('config/default.json'));store.set('config',{...config,windowDays:7,radiusKm:100,aiProvider:'deterministic'});store.set('feed',{status:'live',fetchedAt:now,generated:now});store.ingest(Array.from({length:80},(_,i)=>({id:'USGS:cal'+i,provider:'USGS',type:'earthquake',lat:0,lon:i%2?0:10,mag:5,magType:'mw',depth:350,time:now-(81-i)*86400000})),now);new RouteHistory(store,{captureKm:100,maxHops:3,routes:[{id:'r',name:'Test',points:[0,5,10,15].map(lon=>({lat:0,lon})),direction:'forward',kind:'research-corridor',termination:false,provenance:{status:'illustrative'}}]});store.set('coverage',[{provider:'USGS',start:now-100*86400000,end:now,minMagnitude:-3}]);store.close();
const port=46318,base='http://127.0.0.1:'+port,child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),SEISMO_TEST_MODE:'1',SEISMO_DB:db,SEISMO_TLS_DIR:dir+'/tls'},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(logs)),15000);child.stdout.on('data',b=>{if(String(b).includes('SeismoSphere running')){clearTimeout(timer);resolve();}});});
 const post=async(path,body)=>{const response=await fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
 const calibration=await post('calibrate-depth',Object.fromEntries([['start',71],['trainEnd',36],['end',1]].map(([k,days])=>[k,new Date(now-days*86400000).toISOString()])));
 const input={name:'Synthetic calibrated protocol',hypothesis:'Test saved threshold prospectively',calibrationId:calibration.id,start:now+86400000,issuances:1,stepDays:10,settleDays:2};
 const preview=await post('protocol-preview',input);assert.equal(preview.spec.calibration.id,calibration.id);assert.equal(preview.spec.config.triggerDepth,calibration.report.selectedConfig.triggerDepth);
 const registered=await post('protocol-register',{...input,previewHash:preview.previewHash});assert.equal(registered.spec.calibration.id,calibration.id);
 const exported=await(await fetch(base+'/api/protocol-export?id='+registered.id)).json();writeFileSync(dir+'/protocol.json',JSON.stringify(exported));const result=JSON.parse(execFileSync(process.execPath,['scripts/reproduce-protocol.mjs',dir+'/protocol.json'],{encoding:'utf8',windowsHide:true}));assert.equal(result.allExact,true);
 assert.equal((await(await fetch(base+'/api/status')).json()).config.triggerDepth,config.triggerDepth);assert.equal((await(await fetch(base+'/api/ledger')).json()).integrity.count,0);
 console.log(JSON.stringify({calibration:calibration.id,protocol:registered.id,selectedDepth:preview.spec.config.triggerDepth,canonicalUnchanged:true,issuedForecasts:0,exportVerified:true}));
}finally{child.kill();if(child.exitCode===null)await once(child,'exit');}
