import {Vector3} from 'three';
const R=6371.0088,rad=Math.PI/180;
export class FocusAnnotation{
 constructor(earth,{getState,selectEvent}){
  Object.assign(this,{earth,getState,selectEvent});earth.focusAnnotation=this;
  this.root=document.createElement('div');this.root.className='focus-annotation';this.root.hidden=true;
  this.root.innerHTML='<svg aria-hidden="true"><path/><circle r="3"/></svg><button class="focus-label"><span class="focus-kind"></span><strong></strong><span class="focus-measure"></span></button>';
  earth.container.append(this.root);this.button=this.root.querySelector('button');this.button.onclick=()=>{if(this.event)this.selectEvent(this.event);};
 }
 sample(){
  const e=this.earth,state=this.getState(),id=state.selectedEvent?.id;if(!id||state.future)return null;
  const source=e.geology?.section?e.geology.sectionEvents:e.eventGroup.children.find(p=>p.userData.events)?.userData.events;
  if(this.source!==source||this.id!==id){this.source=source;this.id=id;this.event=source?.find(v=>v.id===id)??null;}
  const event=this.event;if(!event||event.time>e.asOf)return null;
  const radius=e.geology?.section?1-event.depth/R:e.xray?Math.max(.04,1-event.depth/R*e.depthScale):1.009;
  let point=new Vector3(Math.cos(event.lat*rad)*Math.cos(event.lon*rad),Math.sin(event.lat*rad),-Math.cos(event.lat*rad)*Math.sin(event.lon*rad)).multiplyScalar(radius);
  if(e.geology?.section)point=e.geology.projected(point);else if(!e.xray)e.relief?.liftVector(point);
  const anchor=e.geology?.section?'PROJECTED SECTION':e.xray?'HYPOCENTER':'SURFACE PROJECTION',measure=`M${event.mag.toFixed(1)} ${event.magType??''} · ${event.depth.toFixed(1)} km depth`,scale=e.geology?.section?1:e.depthScale;
  return {event,point,anchor,measure,scale};
 }
 project(camera=this.earth.camera,width=this.earth.container.clientWidth,height=this.earth.container.clientHeight){
  const sample=this.sample();if(!sample)return null;const e=this.earth,{point}=sample,n=point.clone().project(camera);
  if(n.z< -1||n.z>1||Math.abs(n.x)>.98||Math.abs(n.y)>.98||!e.xray&&!e.geology?.section&&point.dot(camera.position)<=point.lengthSq())return null;
  return {...sample,x:(n.x+1)*width/2,y:(1-n.y)*height/2};
 }
 update(){
  const p=this.project(),e=this.earth;if(!p||document.querySelector('dialog[open]')){this.root.hidden=true;return;}
  const text=[p.event.id,p.event.place,p.measure,p.anchor,p.scale].join('|');if(this.text!==text){this.text=text;this.button.querySelector('.focus-kind').textContent=p.anchor;this.button.querySelector('strong').textContent=p.event.place;this.button.querySelector('.focus-measure').textContent=p.measure;this.button.setAttribute('aria-label',`Inspect ${p.event.place}, ${p.measure}, ${p.anchor.toLowerCase()}${p.scale>1?', depth display '+p.scale+' times exaggerated':''}`);}
  const width=e.container.clientWidth,height=e.container.clientHeight,w=e.mobile?164:210,h=72,bounds=e.container.getBoundingClientRect();
  const obstacles=[...document.querySelectorAll('.event-panel,.forecast-panel,#selection,#chat-panel,.scene-inspector,.globe-toolbar,.command-wrap,.timeline,.scene-layer-summary,.scene-heading,.scene-meta')].filter(n=>!n.hidden&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>{const r=n.getBoundingClientRect();return {left:r.left-bounds.left,right:r.right-bounds.left,top:r.top-bounds.top,bottom:r.bottom-bounds.top};});
  const candidates=[[p.x+22,p.y-h-16],[p.x-w-22,p.y-h-16],[p.x+22,p.y+16],[p.x-w-22,p.y+16],[p.x-w/2,p.y-h-28],[p.x-w/2,p.y+28]];
  const fit=candidates.find(([x,y])=>x>=8&&x+w<=width-8&&y>=8&&y+h<=height-8&&!obstacles.some(r=>x<r.right+6&&x+w>r.left-6&&y<r.bottom+6&&y+h>r.top-6));
  if(!fit){this.root.hidden=true;return;}const [x,y]=fit;this.root.hidden=false;this.button.style.transform=`translate(${x}px,${y}px)`;this.button.style.width=w+'px';
  const endX=Math.max(x,Math.min(x+w,p.x)),endY=Math.max(y,Math.min(y+h,p.y));this.root.querySelector('path').setAttribute('d',`M${p.x},${p.y} L${endX},${endY}`);const dot=this.root.querySelector('circle');dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y);
 }
 evidence(camera,width,height){const p=this.project(camera,width,height);return p?{eventId:p.event.id,provider:p.event.provider,sourceId:p.event.sourceId,observedAt:p.event.observedAt,time:p.event.time,place:p.event.place,measure:p.measure,anchor:p.anchor,depthScale:p.scale,world:p.point.toArray(),x:p.x,y:p.y}:null;}
}
