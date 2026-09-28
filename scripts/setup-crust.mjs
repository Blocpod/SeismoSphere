import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const local=process.platform==='win32'?'data/model-runtime/Scripts/python.exe':'data/model-runtime/bin/python';
const python=existsSync(local)?local:'python';
const result=spawnSync(python,['scripts/setup-crust.py'],{stdio:'inherit',windowsHide:true});
if(result.error)throw new Error(`CRUST1.0 preparation requires Python 3: ${result.error.message}`);
if(result.status!==0)throw new Error(`CRUST1.0 preparation failed (exit ${result.status}).`);
