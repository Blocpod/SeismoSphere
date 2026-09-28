import test from 'node:test';
import assert from 'node:assert/strict';
import {showCrustContext} from '../public/crust-context.js';
test('crust inspector loads on demand once and ignores a removed selection',async()=>{
 const previous=globalThis.document,element=()=>({children:[],isConnected:true,setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}}),selection=element();globalThis.document={createElement:element,querySelector:()=>selection};
 try{
  let calls=0,finish,lastRequest;const api=(url,body)=>{lastRequest={url,body};calls++;return new Promise(resolve=>finish=resolve);},event={lat:5.5,lon:150.5};showCrustContext(event,{api});const root=selection.children[0];await root.ontoggle();assert.equal(calls,0);root.open=true;const pending=root.ontoggle();await root.ontoggle();assert.equal(calls,1);
  finish({query:event,cell:{lat:5.5,lon:150.5},layers:[{name:'mantle',present:true,topDepthKm:11.46,bottomDepthKm:null,vpKmPerSecond:8,vsKmPerSecond:4.5,densityGramsPerCubicCm:3.3}],provenance:{source:{sha256:'retained-hash'},homepage:'https://igppweb.ucsd.edu/~gabi/crust1.html',citation:'CRUST1.0'}});await pending;assert.match(root.children[1].children[1].children[1].textContent,/bottom unspecified/);await root.ontoggle();assert.equal(calls,1);
  const explanation=root.children[1].children.find(n=>n.textContent==='Explain this crust column');const asking=explanation.onclick();assert.equal(lastRequest.url,'chat');assert.deepEqual(lastRequest.body.crustPoint,event);assert.equal(lastRequest.body.crustSha,'retained-hash');assert.equal(lastRequest.body.analysisId,undefined);finish({model:'test',answer:'Source explanation',grounded:false});await asking;assert.match(root.children[1].children.at(-1).textContent,/AI EXPLANATION.*\n\nSource explanation/);
  showCrustContext(event,{api});const removed=selection.children[1];removed.open=true;const late=removed.ontoggle();removed.isConnected=false;finish({});await late;assert.equal(removed.children[1].children.length,0);
 }finally{globalThis.document=previous;}
});

test('crust evidence explanations cannot trigger globe commands',async()=>{
 const {chat,commandActions}=await import('../server/ai.mjs');
 const context={crustEvidence:{cell:{lat:5.5,lon:150.5},layers:Array.from({length:9},()=>({topDepthKm:11.46})),policy:'Static one-degree reference.'}};
 assert.deepEqual(commandActions('Show the surface and forecasts',context),[]);
 const answer=await chat('Explain this column',context,{aiProvider:'deterministic'});
 assert.deepEqual(answer.actions,[]);assert.match(answer.answer,/11.46 km below sea level/);assert.match(answer.answer,/not evidence.*historical replay/);
});
