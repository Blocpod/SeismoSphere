import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,copyFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('hidden launcher retains setup failure details and NoBrowser exits without a dialog',{skip:process.platform!=='win32'},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'seismo-launch-failure-')),script=path.join(dir,'Start-SeismoSphere.ps1');copyFileSync('Start-SeismoSphere.ps1',script);
 // Deliberately incomplete copy: setup.mjs does not exist, so no download or server start occurs.
 const run=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-NoBrowser'],{encoding:'utf8',timeout:15000,windowsHide:true});
 assert.equal(run.error,undefined);assert.notEqual(run.status,0);const log=readFileSync(path.join(dir,'logs/startup-error.log'),'utf8');assert.match(log,/Asset setup failed/);assert.match(run.stderr,/Asset setup failed/);
});
