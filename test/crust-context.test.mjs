import test from 'node:test';
import assert from 'node:assert/strict';
import {showCrustContext} from '../public/crust-context.js';
test('crust inspector loads on demand once and ignores a removed selection',async()=>{
 const previous=globalThis.document,element=()=>({children:[],isConnected:true,append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}}),selection=element();globalThis.document={createElement:element,querySelector:()=>selection};
 try{
  let calls=0,finish;const api=()=>{calls++;return new Promise(resolve=>finish=resolve);},event={lat:5.5,lon:150.5};showCrustContext(event,{api});const root=selection.children[0];await root.ontoggle();assert.equal(calls,0);root.open=true;const pending=root.ontoggle();await root.ontoggle();assert.equal(calls,1);
  finish({cell:{lat:5.5,lon:150.5},layers:[{name:'mantle',present:true,topDepthKm:11.46,bottomDepthKm:null,vpKmPerSecond:8,vsKmPerSecond:4.5,densityGramsPerCubicCm:3.3}],provenance:{homepage:'https://igppweb.ucsd.edu/~gabi/crust1.html',citation:'CRUST1.0'}});await pending;assert.match(root.children[1].children[1].children[1].textContent,/bottom unspecified/);await root.ontoggle();assert.equal(calls,1);
  showCrustContext(event,{api});const removed=selection.children[1];removed.open=true;const late=removed.ontoggle();removed.isConnected=false;finish({});await late;assert.equal(removed.children[1].children.length,0);
 }finally{globalThis.document=previous;}
});
