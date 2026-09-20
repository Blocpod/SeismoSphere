import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three.module.js';
const source=(await readFile(new URL('../public/spatial-view.js',import.meta.url),'utf8')).replace("'three'",JSON.stringify(new URL('../public/vendor/three.module.js',import.meta.url).href)).replace("'./speech-capture.js'",JSON.stringify(new URL('../public/speech-capture.js',import.meta.url).href));
const {renderSpatialEarth}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('spatial render transforms shared clipping and marker scale in metres, then restores all scientific coordinates even on failure',()=>{
 const scene=new THREE.Scene(),plane=new THREE.Plane(new THREE.Vector3(1,0,0),-.1),uniform={value:600},sun={value:new THREE.Vector3(1,0,0)},stars={visible:true},material=new THREE.ShaderMaterial({uniforms:{pixelScale:uniform},clippingPlanes:[plane]});
 const light=new THREE.DirectionalLight();scene.add(light);scene.add(new THREE.Mesh(new THREE.SphereGeometry(1,8,8),material));scene.add(new THREE.Mesh(new THREE.SphereGeometry(1,8,8),material));
 const earth={scene,stars,sun:{position:new THREE.Vector3(1,0,0)},nightShader:{uniforms:{sunWorld:sun}},clouds:{material:{uniforms:{sun:{value:sun.value.clone()}}}}},matrix=new THREE.Matrix4().compose(new THREE.Vector3(1,2,-3),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2),new THREE.Vector3(.5,.5,.5)),before=plane.clone(),expected=plane.clone().applyMatrix4(matrix),camera=new THREE.PerspectiveCamera(60,1,.01,100);camera.viewport=new THREE.Vector4(0,0,1200,1000);
 let called=0;const renderer={xr:{getCamera:()=>({cameras:[camera]})},render(){called++;assert.deepEqual(light.target.position.toArray(),[1,2,-3]);assert.deepEqual(scene.matrixWorld.elements,matrix.elements);assert.ok(plane.normal.distanceTo(expected.normal)<1e-12);assert.equal(plane.constant,expected.constant);assert.equal(stars.visible,false);assert.ok(Math.abs(uniform.value-1000*camera.projectionMatrix.elements[5]*.25)<1e-10);assert.ok(sun.value.distanceTo(new THREE.Vector3(0,0,-1))<1e-10);if(called===2)throw new Error('controlled renderer failure');}};
 renderSpatialEarth(earth,renderer,camera,matrix,true);assert.throws(()=>renderSpatialEarth(earth,renderer,camera,matrix,true),/controlled/);
 assert.deepEqual(light.target.position.toArray(),[0,0,0]);assert.deepEqual(scene.matrixWorld.elements,new THREE.Matrix4().elements);assert.deepEqual(plane,before);assert.equal(uniform.value,600);assert.equal(stars.visible,true);assert.deepEqual(sun.value.toArray(),[1,0,0]);
});
