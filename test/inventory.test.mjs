import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function inventory(){'),source.indexOf("$('#inventory').addEventListener"));
test('inventory distinguishes loading from zero and renders retained catalog status with available inspectors',()=>{
 const output={innerHTML:''},state={status:null};
 const $=selector=>selector==='#inventory'?output:selector==='#gnss-open'?{}:null;
 const render=new Function('state','$','esc','date',body+';return inventory;')(state,$,s=>String(s),n=>String(n));
 render();assert.match(output.innerHTML,/Loading catalog status/);assert.doesNotMatch(output.innerHTML,/0 associated events|Dataset integration pending/);
 state.status={config:{catalogProvider:'EMSC'},catalogCount:0,deletionSync:{error:'Offline'}};render();assert.match(output.innerHTML,/EMSC · 0 associated events/);assert.match(output.innerHTML,/Offline/);
 state.status={config:{catalogProvider:'USGS'},catalogCount:70593,deletionSync:{checkedAt:123,unidentifiedRecords:221}};render();assert.match(output.innerHTML,/70,593 associated events/);assert.match(output.innerHTML,/221 unidentified/);assert.match(output.innerHTML,/data-inventory-open="gnss-open"/);assert.doesNotMatch(output.innerHTML,/data-inventory-open="cratons-open"/);
});
