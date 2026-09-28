import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../public/vendor/three.module.js';

// Exercise the real geometry builder without constructing a browser/WebGL renderer.
const source=readFileSync(new URL('../public/globe.js',import.meta.url),'utf8')
  .replace("'three'",JSON.stringify(new URL('../public/vendor/three.module.js',import.meta.url).href))
  .replace("import {OrbitControls} from '/vendor/OrbitControls.js';",'');
const {Earth}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('small earthquakes retain outlined surface markers on both hemispheres',()=>{
  globalThis.document={querySelector:()=>null};
  try{
    const earth=Object.assign(Object.create(Earth.prototype),{eventGroup:new THREE.Group(),depthScale:1,container:{clientHeight:900},renderer:{getPixelRatio:()=>1},camera:{fov:35},glow:new THREE.Texture(),syncPresentation(){}});
    const events=[{id:'Nevada',lat:38,lon:-115,depth:6,mag:2.5,time:0},{id:'Chile',lat:-33,lon:-72,depth:29,mag:4.5,time:0},{id:'Japan',lat:35,lon:140,depth:20,mag:4,time:0}];
    for(const scientific of [false,true]){
      earth.scientific=scientific;earth.setEvents(events,0);
      const projected=earth.eventGroup.children.find(p=>p.userData.projection);
      assert.equal(projected.geometry.attributes.position.count,3);
      assert.equal(projected.material.uniforms.earthquakeOutline.value,scientific?0:1);
      projected.userData.events.forEach((event,i)=>{
        const p=new THREE.Vector3().fromBufferAttribute(projected.geometry.attributes.position,i);
        assert.ok(Math.abs(p.length()-1.009)<1e-6);
        assert.ok(Math.abs(Math.atan2(-p.z,p.x)*180/Math.PI-event.lon)<1e-4);
      });
    }
    earth.clear(earth.eventGroup);
  }finally{delete globalThis.document;}
});


test('saved review selection is frozen in export evidence and cleared with geometry',async()=>{
  const {sceneEvidence,reviewEventLegend}=await import('../public/figure.js');
  const earth=Object.assign(Object.create(Earth.prototype),{selectionGroup:new THREE.Group(),eventGroup:new THREE.Group(),events:[],asOf:1000,plates:{visible:true},pathGroup:{visible:false},field:{visible:false},forecastGroup:{visible:false},presentationEvidence:()=>({style:'scientific'})});
  const review={reviewId:'0123456789abcdef',reportHash:'retained-result-hash',createdAt:2000,engine:'DS',event:{id:'USGS:saved',time:1000,mag:4.8,depth:27.7,lat:38,lon:143}};
  earth.selectionGroup.add(new THREE.Group());earth.selectionGroup.userData.reviewEvent=review;
  const state={analysis:{asOf:1000},asOf:1000,status:{config:{catalogProvider:'USGS'}}};
  const evidence=()=>sceneEvidence(earth,state,'test',{camera:{}});
  const frozen=evidence();assert.deepEqual(frozen.savedReviewEvent,review);
  review.event.mag=5;assert.equal(frozen.savedReviewEvent.event.mag,4.8);
  assert.match(reviewEventLegend(frozen.savedReviewEvent).join(' '),/USGS:saved.*M4.8.*current revised catalog/);
  earth.clear(earth.eventGroup);assert.ok(evidence().savedReviewEvent);
  earth.selectionGroup.visible=false;assert.equal(evidence().savedReviewEvent,null);
  earth.selectionGroup.visible=true;earth.clear(earth.selectionGroup);
  assert.equal(evidence().savedReviewEvent,null);assert.equal(earth.selectionGroup.userData.reviewEvent,undefined);
  assert.equal(frozen.savedReviewEvent.reportHash,'retained-result-hash');
});


test('keyboard globe navigation respects bounds, cancels flight, and leaves other shortcuts alone',()=>{
 globalThis.document={querySelector:()=>null};
 try{
  let stopped=0,prevented=0;const earth=Object.assign(Object.create(Earth.prototype),{camera:new THREE.PerspectiveCamera(),baseDistance:4,controls:{enabled:true,minDistance:1.2,maxDistance:6,update(){}},onExternalFocus(){stopped++;}});
  earth.camera.position.set(4,0,0);
  const key=(key,options={})=>earth.navigateKeyboard({key,preventDefault(){prevented++;},...options});
  key('ArrowRight');assert.ok(Math.abs(Math.atan2(-earth.camera.position.z,earth.camera.position.x)*180/Math.PI-5)<1e-9);
  key('ArrowUp',{shiftKey:true});assert.ok(Math.abs(Math.asin(earth.camera.position.y/4)*180/Math.PI-15)<1e-9);
  for(let i=0;i<30;i++)key('+');assert.ok(Math.abs(earth.camera.position.length()-1.2)<1e-9);
  for(let i=0;i<30;i++)key('-');assert.ok(Math.abs(earth.camera.position.length()-6)<1e-9);
  key('Home');assert.ok(Math.abs(earth.camera.position.length()-4)<1e-9);
  const before=earth.camera.position.clone(),count=prevented;key('Tab');key('+',{ctrlKey:true});earth.spatialView={active:true};key('ArrowLeft');assert.equal(prevented,count);assert.deepEqual(earth.camera.position,before);assert.equal(stopped,prevented);
  earth.targetCamera=new THREE.Vector3();earth.cameraMove={};earth.controls.autoRotate=true;earth.setReducedMotion(true);assert.equal(earth.controls.enableDamping,false);assert.equal(earth.controls.autoRotate,false);assert.equal(earth.targetCamera,null);assert.equal(earth.cameraMove,null);
  earth.setReducedMotion(false);assert.equal(earth.controls.enableDamping,true);assert.equal(earth.controls.autoRotate,false);
  earth.scientific=true;earth.setReducedMotion(false);assert.equal(earth.controls.enableDamping,false);
 }finally{delete globalThis.document;}
});

test('section selection follows the real curved projection and ignores hidden original markers',async()=>{
 const {curvedSection}=await import('../public/curved-section.js');
 const geologySource=readFileSync(new URL('../public/geology.js',import.meta.url),'utf8').replace("'three'",JSON.stringify(new URL('../public/vendor/three.module.js',import.meta.url).href)).replace("import {setupSectionTools} from './section-tools.js';",'').replace("'./section-geometry.js'",JSON.stringify(new URL('../public/section-geometry.js',import.meta.url).href)).replace("'./curved-section.js'",JSON.stringify(new URL('../public/curved-section.js',import.meta.url).href));
 const {Geology}=await import('data:text/javascript;base64,'+Buffer.from(geologySource).toString('base64'));
 const geology=Object.assign(Object.create(Geology.prototype),{curvedPath:curvedSection([{lat:0,lon:170},{lat:0,lon:-170},{lat:20,lon:-170}],100)});
 const event={id:'projected',lat:.5,lon:179,depth:300,mag:4.5,time:0};const projected=geology.projectEvent(event);assert.ok(Math.abs(projected.point.length()-(1-300/6371.0088))<1e-12);assert.ok(Math.abs(projected.point.y)<1e-10);assert.ok(Math.abs(projected.surface.length()-1)<1e-12);
 assert.equal(geology.projectEvent({...event,lat:40}),null);
 const earth=Object.assign(Object.create(Earth.prototype),{geology,eventGroup:new THREE.Group(),selectionGroup:new THREE.Group(),glow:new THREE.Texture(),syncPresentation(){}});
 const hidden=new THREE.Points();hidden.userData.events=[event];hidden.visible=false;earth.eventGroup.add(hidden);geology.curvedPoints=new THREE.Points();geology.curvedPoints.userData.events=[event];
 assert.deepEqual(earth.pickableEventObjects(),[geology.curvedPoints]);earth.selectEvent(event);assert.equal(earth.selectionGroup.children.length,2);assert.ok(earth.selectionGroup.children[0].position.distanceTo(projected.point)<1e-12);
 const annotationSource=readFileSync(new URL('../public/focus-annotation.js',import.meta.url),'utf8').replace("'three'",JSON.stringify(new URL('../public/vendor/three.module.js',import.meta.url).href));const {FocusAnnotation}=await import('data:text/javascript;base64,'+Buffer.from(annotationSource).toString('base64'));earth.asOf=1000;const annotation=Object.assign(Object.create(FocusAnnotation.prototype),{earth,getState:()=>({selectedEvent:event})}).sample();assert.equal(annotation.anchor,'PROJECTED CURVED PROFILE');assert.ok(annotation.point.distanceTo(projected.point)<1e-12);
 earth.selectEvent({...event,lat:40});assert.equal(earth.selectionGroup.children.length,0);geology.curvedPoints=null;assert.deepEqual(earth.pickableEventObjects(),[]);
});
