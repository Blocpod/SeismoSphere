import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analogueFrame,nextAnalogueFrame,replaySearchStillCurrent} from '../public/analogue-replay.js';
import {workspaceCommand} from '../public/workspace-commands.js';
test('analogue browsing preserves source identity and never steps past completed search evidence',()=>{
 const DAY=86400000,report={cutoff:100*DAY,windowDays:10,matches:[{source:{id:'a',time:10*DAY}},{source:{id:'b',time:40*DAY}}]};
 assert.deepEqual(analogueFrame(report,1,10),{source:report.matches[1].source,cutoff:50*DAY,index:1,day:10,windowDays:10,total:2});
 assert.equal(analogueFrame(report,0).cutoff,10*DAY);
 for(const [index,day] of [[-1,0],[2,0],[0,11],[0,-1],[0,NaN]])assert.throws(()=>analogueFrame(report,index,day));
 assert.throws(()=>analogueFrame({...report,cutoff:45*DAY},1));
 assert.equal(analogueFrame({...report,windowDays:7.5},0,7.5).cutoff,17.5*DAY);
});
test('batch replay visits every returned window in order, stops, and requires an explicit command',()=>{
 const report={cutoff:100*86400000,windowDays:7.5,matches:[{source:{time:0}},{source:{time:20*86400000}}]};
 let frame=analogueFrame(report,0),visited=[];
 while(frame){visited.push([frame.index,frame.day]);const next=nextAnalogueFrame(frame);frame=next?analogueFrame(report,next.index,next.day):null;}
 assert.equal(visited.length,18);assert.deepEqual(visited.slice(7,10),[[0,7],[0,7.5],[1,0]]);assert.deepEqual(visited.at(-1),[1,7.5]);
 assert.deepEqual(workspaceCommand('Replay this configuration through every historical analogue.'),{type:'analogueReplay'});
 for(const s of ['Do not replay this configuration through every historical analogue','Explain how to replay this configuration through every historical analogue','Replay this configuration through every historical analogue and issue watches'])assert.equal(workspaceCommand(s),null);
});

test('live refresh does not cancel graph search, but user source/time changes do',()=>{
 const start={eventId:'a',asOf:100,live:true,mode:'strict'},state={selectedEvent:{id:'a'},asOf:200,live:true,mode:'strict'};
 assert.equal(replaySearchStillCurrent(start,state),true);
 assert.equal(replaySearchStillCurrent(start,{...state,selectedEvent:{id:'b'}}),false);
 assert.equal(replaySearchStillCurrent(start,{...state,live:false}),false);
 assert.equal(replaySearchStillCurrent({...start,live:false},{...state,live:false}),false);
 assert.equal(replaySearchStillCurrent({...start,live:false},{...state,live:false,asOf:100}),true);
});
