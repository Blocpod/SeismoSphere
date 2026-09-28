import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analogues} from '../server/engine.mjs';
import {DAY,distance,clamp} from '../server/geo.mjs';
test('source-only selection preserves legacy rank, ties and outcomes without evaluating discarded candidates',()=>{
 const source={id:'query',type:'earthquake',provider:'USGS',lat:0,lon:0,time:4000*DAY,mag:5,depth:400};
 let discardedReads=0;
 const catalog=Array.from({length:150},(_,i)=>{
  const e={...source,id:'old'+i,time:i*20*DAY,mag:i<110?5:5.5};
  if(i>=110)Object.defineProperty(e,'lat',{enumerable:true,get(){discardedReads++;return 0;}});
  return [e,{...source,id:'follow'+i,time:(i*20+1)*DAY,mag:6,depth:0}];
 }).flat();
 const actual=analogues(source,catalog,source.time);assert.equal(discardedReads,0);
 const old=catalog.filter(e=>e.time<source.time-30*DAY&&e.time+10*DAY<source.time&&Math.abs(e.mag-source.mag)<.6&&Math.abs(e.depth-source.depth)<100);
 const expected=old.map(e=>{const future=catalog.filter(f=>f.time>e.time&&f.time<=e.time+10*DAY&&distance(e,f)<=400&&f.mag>=source.mag-1);return {source:e,similarity:Math.round(100*(1-clamp(Math.abs(e.mag-source.mag)/2+Math.abs(e.depth-source.depth)/400,0,1))),subsequentCount:future.length,largest:future.length?Math.max(...future.map(f=>f.mag)):null};}).sort((a,b)=>b.similarity-a.similarity).slice(0,100);
 assert.ok(discardedReads>0);assert.deepEqual(actual,expected);assert.equal(actual.length,100);assert.equal(actual.at(-1).source.id,'old99');
});
