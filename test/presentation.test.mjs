import test from 'node:test';
import assert from 'node:assert/strict';
import {commandActions,commandEventView,chat} from '../server/ai.mjs';
test('presentation commands require an explicit mode request and never change forecast actions',async()=>{
  for(const [message,action]of [['Use scientific view','scientific'],['Please switch to scientific mode.','scientific'],['Turn off cinematic effects','scientific'],['Restore cinematic view','cinematic'],['Turn on cinematic effects!','cinematic']])assert.deepEqual(commandActions(message),[action]);
  for(const message of ['What is scientific mode?','Do not use scientific view','Scientific mode proves the forecasts','Explain scientific validity','Turn off cinematic effects and issue a forecast'])assert.equal(commandActions(message).some(a=>['scientific','cinematic'].includes(a)),false);
  const result=await chat('Use scientific view',{}, {aiProvider:'deterministic'});assert.deepEqual(result.actions,['scientific']);assert.match(result.answer,/scores remain unchanged/);
});
test('show all deep earthquakes keeps the narrower filter instead of immediately resetting it',()=>{
 for(const message of ['Show all earthquakes deeper than 300 km during the last 72 hours','Show all deep earthquakes'])assert.deepEqual(commandActions(message),['deep']);
 for(const message of ['Show all earthquakes','Reset filter'])assert.deepEqual(commandActions(message),['all']);
});
test('deep command evidence uses the displayed 72-hour cutoff and strict depth threshold',()=>{
 const now=100*86400000,base={place:'Test',mag:4,magType:'mb',depth:301},events=[{...base,id:'recent',time:now-1},{...base,id:'edge',time:now-72*3600000},{...base,id:'older',time:now-72*3600000-1},{...base,id:'future',time:now+1},{...base,id:'not-deep',time:now-1,depth:300}];
 const view=commandEventView('Show all deep earthquakes',events,now);assert.equal(view.count,2);assert.deepEqual(view.records.map(e=>e.id),['recent','edge']);assert.equal(view.records[0].magType,'mb');assert.equal(view.omitted,0);assert.equal(commandEventView('Show all earthquakes',events,now),undefined);
});
