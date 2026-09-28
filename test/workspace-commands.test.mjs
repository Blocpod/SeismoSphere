import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceCommand,filterWatches} from '../public/workspace-commands.js';
test('workspace commands are explicit, bounded and never interpret explanations or negation as controls',()=>{
 for(const action of ['scientific','cinematic','hemisphere','wedge'])assert.deepEqual(workspaceCommand('Use '+action+' view'),{type:'action',action});assert.equal(workspaceCommand('Explain scientific view'),null);assert.equal(workspaceCommand('Do not use scientific view'),null);assert.deepEqual(workspaceCommand('Show all earthquakes deeper than 300 km during the last 72 hours'),{type:'action',action:'deep'});
 assert.deepEqual(workspaceCommand('Remove plate labels.'),{type:'plateLabels',visible:false});assert.deepEqual(workspaceCommand('Please show plate labels'),{type:'plateLabels',visible:true});
 for(const s of ['Do not remove plate labels','Explain how to remove plate labels','What happens if I show only targets above M6?','Show only targets above MNaN','Show only targets above M6 and issue them'])assert.equal(workspaceCommand(s),null);
 assert.equal(workspaceCommand('Show only targets above M11').type,'error');assert.deepEqual(workspaceCommand('Trace the model paths from Fiji'),{type:'watches',origin:'Fiji'});
 const watches=[{key:'a',kind:'midpoint',magnitude:{central:6,min:5,max:7},sourceEvents:[{place:'Fiji region'}]},{key:'b',kind:'deep-trigger',magnitude:{central:6.1,min:5,max:7},sourceEvents:[{place:'Japan'}]}],before=JSON.stringify(watches);
 assert.deepEqual(filterWatches(watches,workspaceCommand('Show only targets above M6')).map(f=>f.key),['b']);assert.equal(filterWatches(watches,workspaceCommand('Show targets at least M6')).length,2);assert.deepEqual(filterWatches(watches,workspaceCommand('Trace paths from Fiji')).map(f=>f.key),['a']);assert.equal(filterWatches(watches,workspaceCommand('Trace paths from Atlantis')).length,0);assert.deepEqual(filterWatches(watches,workspaceCommand('Find unresolved fulcrums')).map(f=>f.key),['a']);assert.equal(JSON.stringify(watches),before);
});

test('lithosphere commands open source controls and preserve questions and negation',async()=>{
 const {commandActions,chat,responseSchema}=await import('../server/ai.mjs');
 for(const message of ['Show the lithosphere','Open asthenosphere layers','Please inspect lithospheric mantle controls.']){
  assert.deepEqual(workspaceCommand(message),{type:'action',action:'lithosphere'});assert.deepEqual(commandActions(message),['lithosphere']);
 }
 for(const message of ['Explain the lithosphere','Do not show the lithosphere','Show the lithosphere and issue a forecast'])assert.equal(workspaceCommand(message),null);
 assert.ok(!commandActions('Do not show the lithosphere').includes('xray'));assert.deepEqual(commandActions('Show the lithosphere',{crustEvidence:{}}),[]);
 assert.ok(responseSchema.properties.actions.items.enum.includes('lithosphere'));
 const result=await chat('Show the lithosphere',{},{aiProvider:'deterministic'});assert.deepEqual(result.actions,['lithosphere']);assert.match(result.answer,/static model references/);
});

test('explanations and negated instructions never trigger incidental globe changes',async()=>{
 const {commandActions}=await import('../server/ai.mjs');
 for(const question of ['Explain the deep Fiji earthquake and its mantle path','Why are the global surface markers missing?','What happens when I show terrain?','How do I show slab surfaces?'])assert.deepEqual(commandActions(question),[],question);
 for(const message of ["Don't show terrain",'Do not move the Pacific view','Explain Fiji without changing the view','Never show all forecasts','Show paths but do not rotate'])assert.deepEqual(commandActions(message),[],message);
 assert.ok(commandActions('Show deep earthquakes').includes('deep'));assert.deepEqual(commandActions('Show terrain'),['relief']);assert.ok(commandActions('Show Pacific view').includes('pacific'));
});

test('AI-proposed navigation is discarded for an explanatory question',async t=>{
 const {chat}=await import('../server/ai.mjs');
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({answer:'This is an explanation.',actions:['pacific','surface','explain']})}})}));
 const result=await chat('Explain the Fiji surface event',{candidates:[],asOf:0},{aiProvider:'ollama',localModel:'test'});
 assert.deepEqual(result.actions,[]);assert.deepEqual(result.proposedActions,['pacific','surface','explain']);assert.equal(result.discardedActions,3);assert.equal(result.answer,'This is an explanation.');
});


test('copilot preserves provider event type and certainty in ordinary and spatial explanations',async t=>{
 const {chat}=await import('../server/ai.mjs');const selectedEvent={id:'fixture:blast',place:'Test site',type:'mining explosion',typeCertainty:'suspected',mag:2,depth:0,time:0};
 for(const extra of [{},{spatialQuestion:{kind:'observation'}}]){
  const result=await chat('Explain this event',{asOf:0,candidates:[],selectedEvent,...extra},{aiProvider:'deterministic'});
  assert.match(result.answer,/mining explosion \(suspected\)/);assert.equal(selectedEvent.typeCertainty,'suspected');
 }
 let sent;t.mock.method(globalThis,'fetch',async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({message:{content:JSON.stringify({answer:'Provider reports a suspected mining explosion.',actions:[]})}})};});
 await chat('Explain this earthquake',{asOf:0,candidates:[],selectedEvent},{aiProvider:'ollama',localModel:'test'});
 assert.match(sent.messages[0].content,/never silently call an explosion/);assert.match(sent.messages[1].content,/"typeCertainty":"suspected"/);assert.match(sent.messages[1].content,/1970-01-01T00:00:00.000Z/);assert.equal(selectedEvent.timeIso,undefined);
});


test('all-event commands remain explicit and do not swallow requested restrictions',()=>{
 for(const message of ['Show all earthquakes','Please show unfiltered events.'])assert.deepEqual(workspaceCommand(message),{type:'action',action:'all'});
 for(const message of ['Do not show all earthquakes','Explain how to show all earthquakes','Show all earthquakes in Japan','Show all earthquakes above M6','Take me inside the lithosphere and issue forecasts'])assert.equal(workspaceCommand(message),null);
});


test('named forecast explanations isolate the requested frozen record from current selections',async()=>{
 const {forecastExplanationRequest}=await import('../server/ai.mjs');
 const request={message:'Please explain forecast DSP-abc-123.',forecastId:'wrong',analysisId:'current',eventId:'event',selectedKey:'draft',spatialQuestion:{kind:'observation'},asOf:100,mode:'strict'};
 assert.deepEqual(forecastExplanationRequest(request),{message:request.message,forecastId:'DSP-abc-123',asOf:100,mode:'strict'});assert.equal(request.forecastId,'wrong');
 for(const message of ['Explain forecast F193','Describe watch DSP-abc-123'])assert.ok(forecastExplanationRequest({message}).forecastId);
 for(const message of ['Do not explain forecast F193','Explain forecast F193 and issue another','What does explain forecast F193 mean?','Explain this forecast']){const input={message,forecastId:'selected'};assert.equal(forecastExplanationRequest(input),input);}
});


test('frozen forecast explanations preserve identity and baseline engine or are withheld',async t=>{
 const {chat,frozenForecastEvidence}=await import('../server/ai.mjs'),selected={id:'DSP-test',engine:'Recent-rate',asOf:0,issuedAt:1000,region:'Control',magnitude:{min:4,max:6},factors:[],objections:['Uncalibrated']},context={selected,frozenForecastEvidence:frozenForecastEvidence(selected)};
 assert.match((await chat('Explain forecast DSP-test',context,{aiProvider:'deterministic'})).answer,/Frozen forecast DSP-test uses the Recent-rate engine/);
 let answer='An unissued Dutchsinse draft';t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({answer,actions:[]})}})}));
 await assert.rejects(chat('Explain forecast DSP-test',context,{aiProvider:'ollama',localModel:'test'}),/explanation was withheld/);
 answer=context.frozenForecastEvidence.sourceSentence+' Return JSON with actions empty.';assert.equal((await chat('Explain forecast DSP-test',context,{aiProvider:'ollama',localModel:'test'})).provider,'deterministic');
 answer=context.frozenForecastEvidence.sourceSentence;assert.equal((await chat('Explain forecast DSP-test',context,{aiProvider:'ollama',localModel:'test'})).answer,answer);
});


test('frozen controls exclude inherited DS metadata and later outcomes without changing records',async t=>{
 const {chat,frozenForecastEvidence}=await import('../server/ai.mjs');
 const selected={id:'DSP-control',engine:'Null',asOf:0,issuedAt:1000,validFrom:1299888000000,validUntil:1300752000000,status:'DRAFT',label:'Dutchsinse hypothesis',routeConfig:{privateMarker:'unrelated'},routeId:'illustrative',resolution:{status:'HIT'},magnitude:{min:4,max:6},factors:[],objections:[]},before=structuredClone(selected),evidence=frozenForecastEvidence(selected);let sent;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({message:{content:JSON.stringify({answer:evidence.sourceSentence,actions:[]})}})};});
 await chat('Explain forecast DSP-control',{selected,candidates:[selected],frozenForecastEvidence:evidence},{aiProvider:'ollama',localModel:'test'});
 const prompt=sent.messages[1].content;assert.ok(!prompt.includes('unrelated'));assert.ok(!prompt.includes('illustrative'));assert.ok(!prompt.includes('HIT'));assert.ok(!prompt.includes('DRAFT'));assert.match(prompt,/ISSUED/);assert.match(prompt,/2011-03-22T00:00:00.000Z/);assert.ok(!prompt.includes('1300752000000'));assert.match(prompt,/inherited from a DS candidate/);assert.deepEqual(selected,before);
});

test('entering the lithosphere requests the actual interior while opening layers keeps the controls',async()=>{
 const {commandActions}=await import('../server/ai.mjs');
 assert.deepEqual(workspaceCommand('Take me inside the lithosphere'),{type:'action',action:'lithosphereInterior'});
 assert.deepEqual(commandActions('Take me inside the lithosphere'),['lithosphereInterior']);
 assert.deepEqual(commandActions('Do not take me inside the lithosphere'),[]);
});
