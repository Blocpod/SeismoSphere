import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('async function refreshCatalogOnOpen(){'),source.indexOf("$('#refresh').onclick="));
function harness({role='owner',pending=null,loaded=true,feed={status:'live'}}={}){
 const elements={'#refresh':{disabled:false},'#feed-status':{textContent:''}},calls=[],messages=[];
 const create=new Function('deviceRole','loadPending','api','load','$','toast','let catalogSyncing=false,lastCatalogSync=0;'+body+';return {run:refreshCatalogOnOpen,synced:()=>lastCatalogSync};');
 const controller=create(role,pending,async()=>{calls.push('fetch');return feed;},async()=>{calls.push('load');return loaded;},s=>elements[s],s=>messages.push(s));return {...controller,elements,calls,messages};
}
test('launch refresh waits for older workspace requests and only marks rendered success',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),h=harness({pending});
 const run=h.run();await Promise.resolve();assert.deepEqual(h.calls,['fetch']);assert.equal(h.elements['#refresh'].disabled,true);
 release(true);await run;assert.deepEqual(h.calls,['fetch','load']);assert.ok(h.synced()>0);assert.equal(h.elements['#refresh'].disabled,false);
 const failed=harness({loaded:false});await failed.run();assert.equal(failed.synced(),0);assert.equal(failed.elements['#feed-status'].textContent,'CACHED · SYNC FAILED');assert.match(failed.messages[0],/workspace could not update/);assert.equal(failed.elements['#refresh'].disabled,false);
 const offline=harness({feed:{status:'stale',error:'offline'}});await offline.run();assert.equal(offline.synced(),0);assert.match(offline.messages[0],/offline/);
 const viewer=harness({role:'viewer'});await viewer.run();assert.deepEqual(viewer.calls,[]);
});
