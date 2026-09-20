import test from 'node:test';
import assert from 'node:assert/strict';
import {magnitudeSummary,completenessAnalysis,completenessOptions,completenessContext} from '../server/completeness.mjs';
import {DAY,seeded} from '../server/geo.mjs';
test('magnitude diagnostics recover a discrete power-law tail and disclose truncation and weak samples',()=>{
  const random=seeded(71),q=10**(-.1),magnitudes=Array.from({length:8000},()=>3+.1*Math.floor(Math.log(1-random())/Math.log(q))),options={minMagnitude:2,binWidth:.1};
  const result=magnitudeSummary(magnitudes,options,{bootstrap:true});assert.equal(result.rawMaxc,3);assert.equal(result.maxc,3.2);assert.ok(Math.abs(result.mbs.mc-3)<=.2);assert.ok(Math.abs(result.mbs.b-1)<.08);assert.equal(result.floorLimited,false);assert.ok(result.bootstrap.successes>190);assert.deepEqual(magnitudeSummary(magnitudes,options,{bootstrap:true}),result);
  const candidate=result.candidates.find(c=>c.mc===3),mean=magnitudes.reduce((s,m)=>s+m,0)/magnitudes.length,expected=Math.log1p(.1/(mean-3))/(Math.LN10*.1);assert.ok(Math.abs(candidate.b-expected)<1e-10);
  const truncated=magnitudeSummary(magnitudes,{...options,minMagnitude:3});assert.equal(truncated.floorLimited,true);assert.equal(truncated.candidates[0].fullyRetrievedBin,false);
  const constant=magnitudeSummary(Array(300).fill(4),options,{bootstrap:true});assert.equal(constant.mbs,null);assert.equal(constant.bootstrap.successes,0);assert.deepEqual(constant.bootstrap.mcPercentiles,[null,null]);
  assert.equal(magnitudeSummary(magnitudes.slice(0,50),options).status,'insufficient-events');assert.equal(magnitudeSummary([],options).mbs,null);
});
test('regional diagnostics isolate event times, provider, event type and magnitude type; partitions retain all selected events',()=>{
  const start=Date.UTC(2010,0,1),end=start+90*DAY,options=completenessOptions({start,end,minMagnitude:2,binWidth:.1,windowDays:30,provider:'USGS',bounds:{south:-30,north:-10,west:170,east:-170}}),events=Array.from({length:1000},(_,i)=>({id:String(i),provider:'USGS',type:'earthquake',time:start+(i+.5)/1000*90*DAY,lat:-29+i%18,lon:i%2?175:-175,mag:3+i%10/10,magType:i%2?'mb':'mww'}));
  const report=completenessAnalysis(events,options);assert.equal(report.events,1000);assert.equal(report.temporal.reduce((n,s)=>n+s.events,0),1000);assert.equal(report.spatial.reduce((n,s)=>n+s.events,0),1000);assert.deepEqual(report.magnitudeTypes,{mww:500,mb:500});
  assert.equal(completenessAnalysis(events,{...options,magType:'mb'}).events,500);
  const extras=[{...events[0],time:end},{...events[0],time:start-1},{...events[0],lat:0},{...events[0],provider:'EMSC'},{...events[0],type:'explosion'}];assert.deepEqual(completenessAnalysis([...events,...extras],options),report);
  assert.throws(()=>completenessOptions({...options,end:Date.now()+DAY}),/elapsed/);
  assert.throws(()=>completenessOptions({...options,bounds:{south:89.999999999999,north:90,west:0,east:1}}),/larger latitude/);
  const saved={...report,id:'test',createdAt:end+DAY},context=completenessContext(saved,end,'catalog-replay','cell-6');assert.deepEqual(context.selectedSample.mbs,report.spatial[6].mbs);assert.equal(context.selectedSample.histogram,undefined);assert.equal(context.variation.spatial.samples,16);
  assert.throws(()=>completenessContext(saved,end-1),/after the analysis cutoff/);assert.throws(()=>completenessContext(saved,end,'strict'),/unavailable/);assert.throws(()=>completenessContext(saved,end,'catalog-replay','cell-17'),/existing/);
});
