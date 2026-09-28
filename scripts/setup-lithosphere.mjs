import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const local=process.platform==='win32'?'data/model-runtime/Scripts/python.exe':'data/model-runtime/bin/python';
for(const script of ['scripts/setup-lithosphere.py','scripts/setup-lithosphere-mesh.py']){
 const result=spawnSync(existsSync(local)?local:'python',[script],{stdio:'inherit',windowsHide:true});
 if(result.error||result.status!==0)throw new Error('LITHO1.0 setup requires Python with NumPy and SciPy (the existing model runtime supplies these). '+(result.error?.message??''));
}
