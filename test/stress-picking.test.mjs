import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../public/vendor/three.module.js';
const source=readFileSync(new URL('../public/stress-layer.js',import.meta.url),'utf8')
  .replace("'three'",JSON.stringify(new URL('../public/vendor/three.module.js',import.meta.url).href))
  .replace("'./stress-geometry.js'",JSON.stringify(new URL('../public/stress-geometry.js',import.meta.url).href))
  .replace("'./finite-fault.js'",JSON.stringify(new URL('../public/finite-fault.js',import.meta.url).href));
const {StressLayer}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('globe stress picking opens the original unmasked sample and respects visibility',()=>{
  const camera=new THREE.PerspectiveCamera(35,1,.01,100);camera.position.set(0,0,3);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,.9,0,0,-.9,0,0,4],3));geometry.userData.sampleIndices=[7,12,99];
  let opened=0,drawn=0,focused=0;const sample={value:'',focus(){focused++;},scrollIntoView(){}};
  const layer=Object.assign(Object.create(StressLayer.prototype),{sync(){},group:{visible:true,children:[{geometry}]},earth:{camera,xray:true,renderer:{domElement:{getBoundingClientRect:()=>({left:10,top:20,width:400,height:400})}}},explorer:{draw(){drawn++;},node:{querySelector:()=>sample,closest:()=>({showModal(){opened++;}})}}});
  const event={clientX:210,clientY:220,pointerType:'mouse'};
  assert.equal(layer.pick(event),true);assert.equal(sample.value,'7');assert.equal(opened,1);assert.equal(drawn,1);assert.equal(focused,1);
  assert.equal(layer.pick({...event,clientX:225}),false);assert.equal(layer.pick({...event,clientX:225,pointerType:'touch'}),true);
  layer.earth.geology={section:true,planes:[new THREE.Plane(new THREE.Vector3(1,0,0),-1)]};assert.equal(layer.pick(event),false);
  layer.earth.geology=null;layer.earth.xray=false;assert.equal(layer.pick(event),false);
  layer.earth.xray=true;layer.group.visible=false;assert.equal(layer.pick(event),false);
});
