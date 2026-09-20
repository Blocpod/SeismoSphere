import {commandActions,chat} from '../server/ai.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSection,sectionFromEndpoints,sectionCoordinates,sectionVector,clipSectionSegment,cutawayNormals,SECTION_EARTH_KM as R} from '../public/section-geometry.js';
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('oblique sections preserve depths and surface corridor width independently of depth',()=>{
  const s=makeSection({lat:0,lon:0,bearing:90,lengthKm:4000,halfWidthKm:150});
  const p=sectionCoordinates({lat:1,lon:5},s);close(p.alongKm,5*Math.PI/180*R);close(Math.abs(p.crossKm),Math.PI/180*R);assert.equal(p.inside,true);
  assert.deepEqual(sectionCoordinates({lat:1,lon:5,depth:700},s),p);assert.equal(sectionCoordinates({lat:2,lon:5},s).inside,false);
  const v=sectionVector(p.alongKm,650,s);close(Math.hypot(...v),1-650/R);close(v.reduce((x,a,i)=>x+a*s.normal[i],0),0);
  for(const bearing of [0,45,90,178,270]){const frame=makeSection({lat:70,lon:178,bearing,lengthKm:6000});close(sectionCoordinates(frame.start,frame).alongKm,-3000);close(sectionCoordinates(frame.end,frame).alongKm,3000);}
});
test('two endpoint sections take the minor arc across dateline and poles, with reversible direction',()=>{
  for(const [a,b] of [[{lat:0,lon:170},{lat:0,lon:-170}],[{lat:80,lon:0},{lat:80,lon:180}],[{lat:-30,lon:140},{lat:48,lon:-160}]]){
    const s=sectionFromEndpoints(a,b),reverse=sectionFromEndpoints(b,a);close(sectionCoordinates(a,s).alongKm,-s.lengthKm/2);close(sectionCoordinates(b,s).alongKm,s.lengthKm/2);close(sectionCoordinates(a,s).crossKm,0);close(reverse.lengthKm,s.lengthKm);
    close(sectionCoordinates(a,reverse).alongKm,s.lengthKm/2);
  }
  assert.throws(()=>sectionFromEndpoints({lat:0,lon:0},{lat:0,lon:0}));assert.throws(()=>sectionFromEndpoints({lat:0,lon:0},{lat:0,lon:180}));assert.throws(()=>makeSection({lat:0,lon:0,halfWidthKm:0}));
});
test('section clipping retains crossing segments with both endpoints outside and excludes seam/outside lines',()=>{
  const s=makeSection({lat:0,lon:0,lengthKm:1000,halfWidthKm:100});
  const segment=clipSectionSegment({alongKm:-800,crossKm:-200},{alongKm:800,crossKm:200},s);close(segment[0].alongKm,-400);close(segment[1].alongKm,400);close(segment[0].crossKm,-100);
  assert.equal(clipSectionSegment({alongKm:0,crossKm:101},{alongKm:400,crossKm:150},s),null);
  assert.equal(clipSectionSegment({alongKm:-20000,crossKm:0},{alongKm:20000,crossKm:0},s),null);
});

test('central cutaway planes remove one quarter or either complementary hemisphere without changing projection',()=>{
 for(const bearing of [0,37,90,270]){const frame=makeSection({lat:31,lon:177,bearing}),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),wedge=cutawayNormals(frame),left=cutawayNormals(frame,'hemisphere',1),right=cutawayNormals(frame,'hemisphere',-1);assert.equal(wedge.length,2);assert.equal(left.length,1);assert.deepEqual(right[0],left[0].map(v=>-v));let w=0,l=0,r=0;
 for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1]){const point=frame.radial.map((v,i)=>(v*a+frame.tangent[i]*b+frame.normal[i]*c)/Math.sqrt(3)),removed=normals=>normals.every(n=>dot(n,point)<0);w+=removed(wedge);l+=removed(left);r+=removed(right);assert.notEqual(removed(left),removed(right));}assert.equal(w,2);assert.equal(l,4);assert.equal(r,4);for(const distance of [-2000,0,2000])close(dot(left[0],sectionVector(distance,600,frame)),0);
 }assert.throws(()=>cutawayNormals(makeSection({lat:0,lon:0}),'other'));assert.throws(()=>cutawayNormals(makeSection({lat:0,lon:0}),'hemisphere',0));
});

test('explicit cutaway commands map to presentation controls and stay inert in explanation-only contexts',async()=>{
 assert.deepEqual(commandActions('Use hemisphere cutaway'),['hemisphere']);assert.deepEqual(commandActions('Restore radial wedge view'),['wedge']);assert.deepEqual(commandActions('Do not use hemisphere cutaway'),[]);assert.deepEqual(commandActions('Use hemisphere cutaway',{phaseEvidence:{}}),[]);assert.deepEqual(commandActions('Use hemisphere cutaway',{prospectiveExperiment:{}}),[]);const r=await chat('Show hemisphere cutaway',{candidates:[]},{aiProvider:'deterministic'});assert.deepEqual(r.actions,['hemisphere']);assert.match(r.answer,/one half/);assert.match(r.answer,/schematic/);
});

test('presentation requests withhold unrelated analytical context from the language model',async t=>{
 let sent;t.mock.method(globalThis,'fetch',async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({message:{content:JSON.stringify({answer:'Hemisphere cutaway uses a central plane and schematic reference layers.',actions:['hemisphere']})}})};});
 const result=await chat('Use hemisphere cutaway',{asOf:1000,mode:'strict',selected:{region:'UNRELATED_WATCH_SENTINEL'},candidates:[{key:'UNRELATED_WATCH_SENTINEL'}]},{aiProvider:'ollama',localModel:'fixture'});assert.deepEqual(result.actions,['hemisphere']);assert.ok(!JSON.stringify(sent).includes('UNRELATED_WATCH_SENTINEL'));assert.match(JSON.stringify(sent),/one half/);
});
