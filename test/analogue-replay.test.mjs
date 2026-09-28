import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analogueFrame} from '../public/analogue-replay.js';
test('analogue browsing preserves source identity and never steps past completed search evidence',()=>{
 const DAY=86400000,report={cutoff:100*DAY,windowDays:10,matches:[{source:{id:'a',time:10*DAY}},{source:{id:'b',time:40*DAY}}]};
 assert.deepEqual(analogueFrame(report,1,10),{source:report.matches[1].source,cutoff:50*DAY,index:1,day:10,windowDays:10,total:2});
 assert.equal(analogueFrame(report,0).cutoff,10*DAY);
 for(const [index,day] of [[-1,0],[2,0],[0,11],[0,-1],[0,NaN]])assert.throws(()=>analogueFrame(report,index,day));
 assert.throws(()=>analogueFrame({...report,cutoff:45*DAY},1));
 assert.equal(analogueFrame({...report,windowDays:7.5},0,7.5).cutoff,17.5*DAY);
});
