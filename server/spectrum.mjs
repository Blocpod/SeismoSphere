import {execFile} from 'node:child_process';
import path from 'node:path';
export function calculateSpectrum(input){
 return new Promise((resolve,reject)=>{
  const child=execFile(path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['-X','utf8',path.resolve('model/spectrum.py')],{windowsHide:true,timeout:15000,maxBuffer:16000000},(error,stdout)=>{
   try{const result=JSON.parse(stdout);if(error||result.error)throw new Error(result.error??'Frequency analysis did not complete within its resource limits');resolve(result);}catch(e){reject(new Error(error?.code==='ENOENT'?'Local NumPy runtime unavailable. Run scripts/setup-model.ps1.':e.message));}
  });child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
 });
}
