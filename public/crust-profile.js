import * as THREE from 'three';
import {sectionVector} from './section-geometry.js';
const palette=[0x468ec1,0xd0efff,0xcfc291,0xb9a275,0x997c56,0xa7c3bb,0x819e98,0x627c77];
export function crustProfileSvg(profile,x,y){
 const samples=profile?.samples??[];
 return samples.map((sample,i)=>{
  const left=i?(samples[i-1].alongKm+sample.alongKm)/2:sample.alongKm,right=i+1<samples.length?(sample.alongKm+samples[i+1].alongKm)/2:sample.alongKm;
  return sample.layers.slice(0,8).map((layer,j)=>layer.present?`<rect x="${x(left)}" y="${y(layer.topDepthKm)}" width="${x(right)-x(left)}" height="${y(layer.bottomDepthKm)-y(layer.topDepthKm)}" fill="#${palette[j].toString(16).padStart(6,'0')}"/>`:'').join('');
 }).join('');
}
export async function showCrustProfile(geology){
 if(!geology.section)throw new Error('Apply a straight section before loading its crust profile.');
 const frame=geology.frame,response=await fetch('/api/crust-profile?'+new URLSearchParams(Object.fromEntries(['lat','lon','bearing','lengthKm','halfWidthKm'].map(key=>[key,frame[key]]))));
 const data=await response.json();if(!response.ok)throw new Error(data.error??'Crust profile unavailable.');
 if(!geology.section||geology.frame!==frame)return false;
 if(geology.crustGroup){geology.earth.clear(geology.crustGroup);geology.crustGroup.removeFromParent();}
 const group=new THREE.Group();
 for(let layer=0;layer<8;layer++){
  const positions=[];
  for(let i=0;i<data.samples.length;i++){
   const sample=data.samples[i],column=sample.layers[layer];if(!column.present)continue;
   const left=i?(data.samples[i-1].alongKm+sample.alongKm)/2:sample.alongKm,right=i+1<data.samples.length?(sample.alongKm+data.samples[i+1].alongKm)/2:sample.alongKm;
   const a=sectionVector(left,column.topDepthKm,frame),b=sectionVector(right,column.topDepthKm,frame),c=sectionVector(left,column.bottomDepthKm,frame),d=sectionVector(right,column.bottomDepthKm,frame);positions.push(...a,...b,...c,...b,...d,...c);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));group.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:palette[layer],side:THREE.DoubleSide,depthTest:false,depthWrite:false})));
 }
 group.renderOrder=5;group.children.forEach(child=>child.renderOrder=5);geology.cap.add(group);geology.crustGroup=group;geology.crustProfile=data;geology.updateCaption();return true;
}
