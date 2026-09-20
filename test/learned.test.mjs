import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {Store,hash} from '../server/store.mjs';
import {LearnedModel,learnedContext,LEARNED_OPTIONS} from '../server/learned.mjs';

test('learned reports preserve immutable model/snapshot exports and cutoff-safe evidence',async()=>{
  const store=new Store(path.join(mkdtempSync(path.join(os.tmpdir(),'seismo-learned-')),'test.sqlite')),manager=new LearnedModel(store);
  try{
    await assert.rejects(manager.train(),/archive/);
    store.set('coverage',[{...LEARNED_OPTIONS}]);manager.run=async()=>{throw new Error('Training runtime unavailable');};
    await assert.rejects(manager.train(),/runtime unavailable/);assert.equal(manager.list().job.status,'failed');assert.equal(manager.list().fitting,false);
    store.set('learnedJob',{status:'running'});const recovered=new LearnedModel(store);assert.equal(recovered.list().job.status,'interrupted');recovered.close();
    const artifact={weights:[1,2,3]},snapshotId=store.snapshot([],3000,'learned-test');
    const report={id:'frozen',createdAt:4000,version:'test',options:{validationEnd:2000},artifact,weightsSha256:hash(artifact),inputSnapshotId:snapshotId,scores:{train:{lastEnd:1000},validation:{lastEnd:2000},test:{lastEnd:3000}}};
    store.db.prepare('INSERT INTO learned_runs VALUES(?,?,?)').run(report.id,4000,JSON.stringify(report));
    assert.throws(()=>store.db.exec("UPDATE learned_runs SET body='{}'"),/immutable/);
    assert.throws(()=>store.db.exec('DELETE FROM learned_runs'),/immutable/);
    assert.deepEqual(manager.export('frozen').integrity,{weightsValid:true,snapshotValid:true});
    assert.equal(manager.list().runs[0].artifact,undefined);
    assert.equal(learnedContext(report,{cutoff:2500},2500,'catalog-replay').scores.test,undefined);
    assert.ok(learnedContext(report,{cutoff:3500},3500,'catalog-replay').scores.test);
    assert.throws(()=>learnedContext(report,{cutoff:2500},2500,'strict'),/strict/);
    assert.throws(()=>learnedContext(report,{cutoff:1000},1000,'catalog-replay'),/checkpoint/);
    assert.throws(()=>learnedContext(report,{cutoff:2400},2500,'catalog-replay'),/match/);
    await assert.rejects(manager.predict('frozen',NaN),/cutoff/);
    await assert.rejects(manager.predict('frozen',2500),/different model implementation/);
  }finally{manager.close();store.close();}
});
const python=process.env.SEISMO_MODEL_PYTHON??path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python');
test('trained cell graph is deterministic and future outcomes cannot alter fitted weights',{skip:!existsSync(python),timeout:180000},async()=>{
  const {stdout}=await promisify(execFile)(python,['model/check_model.py'],{windowsHide:true,timeout:175000});assert.match(stdout,/PASS:/);
});
