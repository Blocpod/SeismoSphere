import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {instrumentResponse} from '../server/response.mjs';
test('static halfspace matches upstream strain references and physical/receiver checks',async()=>{
  const result=JSON.parse(execFileSync(path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['scripts/stress-check.py'],{windowsHide:true,encoding:'utf8',timeout:120000}));
  assert.equal(result.referencePassed,true);assert.equal(result.surfaceTractionPassed,true);assert.equal(result.scalingAndSignsPassed,true);assert.equal(result.maskPassed,true);assert.equal(result.solverVersion,'26.3.6');
  await assert.rejects(instrumentResponse({model:{patches:[]},points:[]},'stress'),/five million/);
});
