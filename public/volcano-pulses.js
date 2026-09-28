import * as THREE from 'three';
import {unit} from './fault-geometry.js';
import {volcanoAnimationState} from './volcano-animation-state.js';
export class VolcanoPulses{
 constructor(owner,weekly=false){
  this.owner=owner;this.weekly=weekly;this.enabled=true;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');ctx.strokeStyle='white';ctx.lineWidth=3;ctx.beginPath();ctx.arc(32,32,26,0,Math.PI*2);ctx.stroke();this.texture=new THREE.CanvasTexture(canvas);
  const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=true;input.id=weekly?'weekly-animate':'volcano-activity-animate';label.append(input,document.createTextNode('Animate fresh source markers'));owner.dialog.querySelector('.form-grid').append(label);
  this.note=document.createElement('p');this.note.className='muted';this.note.setAttribute('role','status');label.parentElement.after(this.note);input.onchange=()=>{this.enabled=input.checked;this.tick();};
 }
 draw(rows,color){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(rows.flatMap(v=>unit(v).map(x=>x*1.018)),3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(rows.flatMap(v=>new THREE.Color(color(v)).toArray()),3));
  this.points=new THREE.Points(geometry,new THREE.PointsMaterial({map:this.texture,transparent:true,opacity:.5,size:30,sizeAttenuation:false,vertexColors:true,depthWrite:false,toneMapped:false}));this.owner.group.add(this.points);this.tick();
 }
 state(){const o=this.owner,s=o.getState();return volcanoAnimationState({enabled:this.enabled&&o.enabled,eligible:o.eligible(),live:s.live,scientific:o.earth.scientific,reduced:o.earth.reduced,checkedAt:o.data?.checkedAt,weekly:this.weekly,publishedAt:Date.parse(o.data?.publication?.publishedAt),error:o.lastError||o.data?.feed?.error});}
 tick(){const state=this.state();if(this.points){this.points.visible=state.active;const phase=(performance.now()%4000)/4000;this.points.material.size=22+phase*30;this.points.material.opacity=.6*(1-phase);}const text=state.reason+'. '+state.meaning;if(this.note.textContent!==text)this.note.textContent=text;}
 evidence(){return {...this.state(),source:this.weekly?'Smithsonian weekly reports':'USGS elevated ground alert or aviation code',periodSeconds:4,sizeCssPixels:[22,52]};}
}
