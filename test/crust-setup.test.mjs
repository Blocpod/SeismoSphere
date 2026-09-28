import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('crust setup recreates missing assets from the retained verified source',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'seismo-crust-setup-'));
 for(const dir of ['scripts','config','data/geology/crust1'])mkdirSync(path.join(root,dir),{recursive:true});
 for(const file of ['scripts/setup-crust.mjs','scripts/setup-crust.py','config/crust1.json','data/geology/crust1/crust1.0.tar.gz'])copyFileSync(file,path.join(root,file));
 const result=spawnSync(process.execPath,['scripts/setup-crust.mjs'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,result.stderr);
 const metadata=JSON.parse(readFileSync('config/crust1.json','utf8'));
 for(const field of Object.values(metadata.files)){
  const bytes=readFileSync(path.join(root,'public/assets/crust1',field.file));
  assert.equal(bytes.length,field.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),field.sha256);
 }
});
