import {spawn,execFile} from 'node:child_process';
import path from 'node:path';
const workers=new Map();
export function closeResponseWorkers(){return Promise.all([...workers].map(([child,stop])=>new Promise(resolve=>{child.once('close',resolve);stop('Application is stopping');})));}
export function instrumentResponse(input,worker='response'){if(!['response','phase'].includes(worker))throw new Error('Unsupported instrument worker');return new Promise((resolve,reject)=>{
 const label=worker==='phase'?'Travel-time calculation':'Instrument response processing';
 const child=spawn(path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['-u',path.resolve('model/'+worker+'.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',failure=null;
 const stop=reason=>{if(failure)return;failure=reason;if(child.pid){if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill();}},timer=setTimeout(()=>stop(label+' exceeded 30 seconds'),30000);
 workers.set(child,stop);
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{if(failure)return;stdout+=chunk;if(stdout.length>16000000)stop('Instrument response output exceeds 16 MB');});child.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-4000));
 child.once('error',error=>{failure=error.code==='ENOENT'?'Run scripts/setup-instruments.ps1 to install the local response decoder.':error.message;});
 child.once('close',code=>{workers.delete(child);clearTimeout(timer);try{if(failure)throw new Error(failure);if(!stdout.trim())throw new Error(`${worker} worker exited ${code}: ${stderr.trim()||'no output'}`);const result=JSON.parse(stdout);if(code||result.error)throw new Error(result.error??(stderr||'Response correction failed'));result.warnings=[...new Set([...(result.warnings??[]),...(stderr.trim()?[stderr.trim()]:[])])];resolve(result);}catch(error){reject(error);}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
});}
