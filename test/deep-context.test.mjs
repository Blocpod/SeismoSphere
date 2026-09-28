import test from 'node:test';import assert from 'node:assert/strict';import {showDeepContext} from '../public/deep-context.js';
test('deep inspection enables sourced context, links only source watches and discards stale loads',async()=>{
 const elements=[],element=()=>{const e={children:[],isConnected:true,append(...nodes){this.children.push(...nodes);},setAttribute(){}};elements.push(e);return e;},selection=element();
 const previous=globalThis.document;globalThis.document={createElement:element,querySelector:()=>selection};
 try{
  let finish,drawn=0,chosen;const event={id:'deep',depth:500},watch={sources:['deep'],region:'linked',magnitude:{min:5,max:6},modelMatch:70},state={asOf:1000,selectedEvent:event,analysis:{candidates:[watch,{...watch,region:'unrelated',sources:['other']}]}};
  const earth={geology:{load:()=>new Promise(r=>finish=r),drawSlabs(){drawn++;},updateCaption(){}}},options={earth,getState:()=>state,selectForecast:f=>chosen=f};
  const pending=showDeepContext(event,options);assert.equal(drawn,0);finish();await pending;assert.equal(drawn,1);assert.equal(earth.geology.slabsEnabled,true);
  const buttons=elements.filter(e=>e.onclick);assert.equal(buttons.length,1);buttons[0].onclick();assert.equal(chosen,watch);
  const late=showDeepContext(event,options);state.selectedEvent={id:'another'};finish();await late;assert.equal(drawn,1);
  state.selectedEvent=event;const replay=showDeepContext(event,options);state.asOf++;finish();await replay;assert.equal(drawn,1);
  const dismissed=showDeepContext(event,options);selection.hidden=true;finish();await dismissed;assert.equal(drawn,1);
  await showDeepContext({...event,depth:20},options);assert.equal(drawn,1);
 }finally{globalThis.document=previous;}
});
