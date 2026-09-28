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

test('fixed-delay count assessments preserve boundaries, outcomes and operational exclusions',async t=>{
 let now=Date.UTC(2030,0,1);t.mock.method(Date,'now',()=>now);const store=new Store(':memory:'),cells=Array(72).fill(.5),snapshot=store.snapshot([],now,'fixture');
 const manager=new CountForecasts(store,{tectonic:()=>({createdAt:now-1,report:{fit:{cells}}}),predict:async()=>({report:{grid:{rows:6,columns:12}},projection:{cells,componentCells:Object.fromEntries(['graph','noNeighbors','trainingMean','recentRate'].map(n=>[n,cells])),inputSnapshotId:snapshot}})}),feed=()=>({status:'live',fetchedAt:now,generated:now}),issue=()=>manager.issue('parent',feed());
 try{
  const f=await issue();assert.equal(manager.tick(feed()).changes,0);now=f.assessmentDueAt;
  const e={id:'USGS:one',provider:'USGS',type:'earthquake',mag:5,lat:0,lon:0,depth:10,time:f.validUntil};store.ingest([e,{...e,id:'USGS:left',time:f.validFrom},{...e,id:'USGS:late',time:f.validUntil+1}],now-1);store.ingest([{...e,id:'USGS:unreceived'}],now+1);store.set('coverage',[{provider:'USGS',start:f.validFrom,end:f.validUntil,minMagnitude:5}]);
  assert.equal(manager.tick({status:'stale'}).changes,0);assert.equal(manager.tick(feed()).changes,1);const a=manager.assessment(f.id);assert.equal(a.status,'SCORED');assert.equal(a.scores.graph.events,1);assert.ok(Math.abs(a.scores.graph.logLikelihood-(-36+Math.log(.5)))<1e-10);assert.equal(a.snapshot.events.length,1);
  now+=10000;store.ingest([{...e,mag:6}],now);assert.equal(manager.tick(feed()).changes,0);assert.deepEqual(manager.assessment(f.id),a);assert.throws(()=>store.db.exec('DELETE FROM count_assessments'),/immutable/);
  const missed=await issue();now=missed.assessmentDueAt+300001;manager.tick(feed());assert.equal(manager.assessment(missed.id).status,'MISSED_ASSESSMENT');
  const gap=await issue();now=gap.assessmentDueAt;store.set('coverage',[]);manager.tick(feed());assert.equal(manager.assessment(gap.id).status,'INCOMPLETE_COVERAGE');assert.equal(manager.assessment(gap.id).scores,undefined);
  const changed=await issue();now=changed.assessmentDueAt;manager.scoringHash='different';manager.tick(feed());assert.equal(manager.assessment(changed.id).status,'SKIPPED_VERSION');
 }finally{store.close();}
});
