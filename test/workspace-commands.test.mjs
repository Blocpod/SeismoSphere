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
