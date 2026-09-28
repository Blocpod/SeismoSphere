import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generate,baselines,backtest} from '../server/engine.mjs';
import {insideBounds,DAY} from '../server/geo.mjs';
const config={...JSON.parse(readFileSync('config/default.json')),maxTargets:1,radiusKm:100,magnitudeMode:'adjacent',rules:{deep:false,midpoint:true,silence:false,spacing:false,routes:false,reflection:false,swarm:false}};
const routes={version:'test',routes:[]},time=Date.UTC(2026,7,1),bounds={south:-10,north:10,west:160,east:-160};
const events=[170,-170,0,20].map((lon,i)=>({id:'USGS:regional'+i,provider:'USGS',lat:0,lon,depth:10,mag:i<2?5:7,magType:'mw',type:'earthquake',time:time-DAY}));
test('regional targets rank within dateline rectangle and matched controls stay within it',()=>{
 const global=generate(events,time,config,routes),regional=generate(events,time,config,routes,[],bounds);
 assert.equal(insideBounds(global.candidates[0].center,bounds),false);assert.equal(regional.candidates.length,1);assert.equal(insideBounds(regional.candidates[0].center,bounds),true);
 for(let seed=0;seed<100;seed++){const controls=baselines(regional,events,seed);assert.equal(controls.length,2);assert.ok(controls.every(c=>insideBounds(c.center,bounds)));assert.equal(controls.find(c=>c.engine==='Recent-rate').sources[0].startsWith('USGS:regional'),true);}
 const result=backtest([...events,{...events[0],id:'USGS:outcome',lon:180,time:time+DAY}],time,time+10*DAY,config,routes,[],5,bounds);
 assert.deepEqual(result.targetBounds,bounds);assert.equal(result.trials.length,3);assert.equal(result.trials.find(c=>c.engine==='DS').resolution.status,'HIT');
 assert.deepEqual(regional.candidates,generate([...events,{...events[0],time:time+DAY}],time,config,routes,[],bounds).candidates);
 assert.throws(()=>generate(events,time,config,routes,[],{...bounds,south:20}),/latitudes/);
 assert.throws(()=>baselines({...regional,targetBounds:{south:30,north:40,west:30,east:40}},events),/No regional/);
});
