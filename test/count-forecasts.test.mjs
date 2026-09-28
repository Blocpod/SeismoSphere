import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../server/store.mjs';import {CountForecasts} from '../server/count-forecasts.mjs';
test('prospective counts freeze six models only after strict current-data inference',async()=>{
 const store=new Store(':memory:');let requested;const now=Date.now(),snapshot=store.snapshot([],now,'fixture'),cells=Array(72).fill(.5),learned={tectonic:()=>({createdAt:now-1000,report:{fit:{cells}}}),predict:async(...args)=>{requested=args;return {report:{grid:{rows:6,columns:12},version:'fixture',weightsSha256:'weights',inputSnapshotId:'training'},projection:{cells,componentCells:Object.fromEntries(['graph','noNeighbors','trainingMean','recentRate'].map(n=>[n,cells])),inputSnapshotId:snapshot,ensembleWeights:{graph:1}}};}},manager=new CountForecasts(store,learned),feed={status:'live',fetchedAt:now,generated:now};
 try{
  await assert.rejects(manager.issue('parent',{...feed,status:'stale'}),/Refresh/);assert.equal(manager.busy,false);assert.equal(manager.list().length,0);
  const f=await manager.issue('parent',feed);assert.equal(requested[2],'strict');assert.equal(requested[3],'ensemble');assert.ok(f.validFrom>=f.inputCutoff);assert.equal(f.validUntil-f.validFrom,7*86400000);assert.equal(Object.keys(f.models).length,6);assert.equal(manager.list()[0].totals.graph,36);assert.deepEqual(manager.get(f.id),f);
  assert.throws(()=>store.db.exec("UPDATE count_forecasts SET body='{}'"),/immutable/);assert.throws(()=>store.db.exec('DELETE FROM count_forecasts'),/immutable/);
  store.db.exec('DROP TRIGGER frozen_count_forecasts_update');const {id,...corrupt}=f;corrupt.models.graph[0]=100;store.db.prepare('UPDATE count_forecasts SET body=? WHERE id=?').run(JSON.stringify(corrupt),id);assert.throws(()=>manager.get(id),/integrity/);
  learned.tectonic=()=>({createdAt:Date.now()+1000,report:{fit:{cells}}});await assert.rejects(manager.issue('parent',feed),/just prepared/);assert.equal(manager.busy,false);
 }finally{store.close();}
});
