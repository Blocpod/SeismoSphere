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
