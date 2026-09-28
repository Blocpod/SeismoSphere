import * as THREE from 'three';
const R=6371008.8;
export function lithospherePositions(nodes,boundary,scale=1){
 if(nodes.length%39||![0,1,2,3].includes(boundary)||!Number.isFinite(scale)||scale<1||scale>25)throw new Error('Invalid lithosphere geometry');
 const out=new Float32Array(nodes.length/39*3);
 for(let i=0;i<nodes.length/39;i++){
  const at=i*39,lat=nodes[at]*Math.PI/180,lon=nodes[at+2]*Math.PI/180,depth=nodes[at+3+boundary*9],radius=Math.max(.04,1-depth*scale/R);
  out.set([radius*Math.cos(lat)*Math.cos(lon),radius*Math.sin(lat),-radius*Math.cos(lat)*Math.sin(lon)],i*3);
 }
 return out;
}
// Intersect corresponding top/bottom facets with the section plane, then clip
// the filled polygon to the exact angular endpoints of the selected corridor.
export function lithosphereSection(top,bottom,faces,frame){
 if(top.length!==bottom.length||top.length%3||faces.length%3)throw new Error('Invalid boundary meshes');
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),vertex=(array,index)=>[array[index*3],array[index*3+1],array[index*3+2]],out=[];
 const angle=frame.lengthKm/2/(R/1000),planes=[frame.tangent.map((v,i)=>v*Math.cos(angle)+frame.radial[i]*Math.sin(angle)),frame.tangent.map((v,i)=>-v*Math.cos(angle)+frame.radial[i]*Math.sin(angle))];
 const clip=(polygon,normal)=>{const result=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=dot(a,normal),db=dot(b,normal);if(da>=0)result.push(a);if((da<0)!==(db<0))result.push(mix(a,b,da/(da-db)));}return result;};
 for(let i=0;i<faces.length;i+=3){
  const ids=[faces[i],faces[i+1],faces[i+2]],a=ids.map(id=>vertex(top,id)),dist=a.map(p=>{const d=dot(p,frame.normal);return Math.abs(d)<1e-12?0:d;}),on=dist.flatMap((d,j)=>d===0?[j]:[]);
  if(on.length!==2&&(dist.every(d=>d>=0)||dist.every(d=>d<=0)))continue;
  const b=ids.map(id=>vertex(bottom,id)),upper=[],lower=[];
  if(on.length===2){for(const j of on){upper.push(a[j]);lower.push(b[j]);}}
  else for(let j=0;j<3;j++){const k=(j+1)%3;if((dist[j]<0)===(dist[k]<0))continue;upper.push(mix(a[j],a[k],dist[j]/(dist[j]-dist[k])));const dj=dot(b[j],frame.normal),dk=dot(b[k],frame.normal);lower.push(mix(b[j],b[k],dj/(dj-dk)));}
  if(upper.length!==2)continue;
  let polygon=[upper[0],upper[1],lower[1],lower[0]];for(const plane of planes)polygon=clip(polygon,plane);
  for(let j=1;j+1<polygon.length;j++)out.push(...polygon[0],...polygon[j],...polygon[j+1]);
 }
 return new Float32Array(out);
}
export class Lithosphere {
 constructor(earth){
  this.earth=earth;earth.lithosphere=this;this.enabled=[false,false];this.group=new THREE.Group();earth.scene.add(this.group);this.sectionGroup=new THREE.Group();earth.scene.add(this.sectionGroup);
  const button=document.createElement('button');button.id='lithosphere-open';button.textContent='◉ Lithosphere';document.querySelector('.globe-toolbar').append(button);
  this.dialog=document.createElement('dialog');this.dialog.className='wide-dialog';this.dialog.innerHTML='<div class="dialog-heading"><div><span class="eyebrow">LITHO1.0 · PUBLISHED REFERENCE</span><h2>Lithosphere & asthenosphere</h2></div><button class="icon-btn" aria-label="Close lithosphere layers">×</button></div><p>Peel between the mantle lid and underlying asthenosphere. These are static model boundaries, not observed pressure or earthquake forecasts.</p><div class="form-grid"><label class="check"><input type="checkbox" data-litho="0" disabled>Lithospheric mantle lid · teal</label><label class="check"><input type="checkbox" data-litho="1" disabled>Asthenosphere · amber</label><label>Boundary opacity<input id="lithosphere-opacity" type="range" min="0.05" max="0.6" step="0.05" value="0.2"></label></div><p role="status"></p><p class="muted">Both top and bottom boundaries are shown. Facets join original tessellation nodes; surfaces between nodes are display interpolation. Crust is separate from the mantle lid. Earth depth exaggeration applies and is labeled. In cutaway, filled bands intersect these same faceted boundaries with the central section plane and stop at the selected corridor endpoints. The bands overlay the schematic interior cap; corridor earthquakes are projected onto that plane.</p><a href="https://igppweb.ucsd.edu/~gabi/litho1.0.html" target="_blank" rel="noreferrer">Pasyanos et al. (2014) · LITHO1.0 source</a>';
  document.body.append(this.dialog);this.status=this.dialog.querySelector('[role="status"]');this.dialog.querySelector('.icon-btn').onclick=()=>this.dialog.close();button.onclick=()=>{this.dialog.showModal();this.load().catch(error=>this.status.textContent=error.message);};
  this.dialog.querySelectorAll('[data-litho]').forEach(input=>input.onchange=()=>{this.enabled[Number(input.dataset.litho)]=input.checked;if(input.checked&&!earth.geology?.section)earth.setXray(true);this.sync();earth.geology?.updateCaption();});
  this.opacity=.2;this.dialog.querySelector('#lithosphere-opacity').oninput=e=>{this.opacity=Number(e.target.value);this.sync();};
  this.caption=document.createElement('div');this.caption.className='geology-caption';this.caption.hidden=true;document.querySelector('#workspace').append(this.caption);
 }
 async load(){
  if(this.metadata)return;if(this.loading)return this.loading;
  this.status.textContent='Loading verified original boundary nodes…';
  this.loading=(async()=>{
   const response=await fetch('/assets/litho1/metadata.json');if(!response.ok)throw new Error('LITHO1.0 assets missing. Run the lithosphere setup scripts.');const metadata=await response.json();
   const buffers=await Promise.all([metadata,metadata.mesh].map(async pin=>{const r=await fetch('/assets/litho1/'+pin.file);if(!r.ok)throw new Error('LITHO1.0 geometry unavailable');const bytes=await r.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==pin.bytes||hash!==pin.sha256)throw new Error('LITHO1.0 source integrity mismatch');return bytes;}));
   this.nodes=new Float32Array(buffers[0]);this.faces=new Uint32Array(buffers[1]);this.metadata=metadata;
   for(let i=0;i<4;i++){const geometry=new THREE.BufferGeometry();geometry.setIndex(new THREE.BufferAttribute(this.faces,1));geometry.setAttribute('position',new THREE.BufferAttribute(lithospherePositions(this.nodes,i),3));this.group.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:i<2?0x6be3d4:0xffb968,transparent:true,opacity:this.opacity,side:THREE.DoubleSide,depthWrite:false})));}
   this.dialog.querySelectorAll('[data-litho]').forEach(input=>input.disabled=false);this.sync();
  })();try{await this.loading;}finally{this.loading=null;}
 }
 sync(){
  if(!this.metadata)return;const earth=this.earth,scale=earth.depthScale,section=earth.geology?.section;
  this.group.children.forEach((mesh,i)=>{mesh.visible=this.enabled[Math.floor(i/2)]&&(earth.xray||section);mesh.material.opacity=this.opacity;mesh.material.clippingPlanes=section?earth.geology.planes:[];mesh.material.clipIntersection=true;mesh.material.needsUpdate=true;if(this.scale!==scale){mesh.geometry.setAttribute('position',new THREE.BufferAttribute(lithospherePositions(this.nodes,i,scale),3));mesh.geometry.computeBoundingSphere();}});this.scale=scale;
  const frame=section?earth.geology.frame:null;
  if(frame!==this.sectionFrame){
   earth.clear(this.sectionGroup);this.sectionFrame=frame;
   if(frame)for(let layer=0;layer<2;layer++){
    const positions=lithosphereSection(this.group.children[layer*2].geometry.attributes.position.array,this.group.children[layer*2+1].geometry.attributes.position.array,this.faces,frame),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:layer?0xffb968:0x6be3d4,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));mesh.renderOrder=4;this.sectionGroup.add(mesh);
   }
  }
  this.sectionGroup.children.forEach((mesh,i)=>mesh.visible=this.enabled[i]);this.sectionGroup.visible=!!section;
  this.caption.hidden=!!section||!this.group.children.some(mesh=>mesh.visible);this.caption.textContent=`LITHO1.0 · ${this.enabled[0]?'mantle lid (teal) ':''}${this.enabled[1]?'asthenosphere (amber) ':''}· depth ${scale}×${scale>1?' EXAGGERATED':''} · static, faceted model boundaries${section?" · filled central-section bands":""}`;
  this.status.textContent=`${this.metadata.nodeCount.toLocaleString()} original nodes · ${this.metadata.mesh.triangles.toLocaleString()} display facets per boundary · depth ${scale}×.`;
 }
 evidence(){return this.metadata&&this.group.children.some(mesh=>mesh.visible)?{provenance:this.metadata,layers:{mantleLid:this.enabled[0],asthenosphere:this.enabled[1]},depthScale:this.scale,opacity:this.opacity,section:this.sectionFrame?{frame:this.sectionFrame,method:'Filled intersection of corresponding faceted model boundaries with the central section plane, clipped to corridor endpoints. Inspection overlay on schematic cap.'}:null,policy:'Static model reference, including during replay. Facets interpolate original node boundaries for display; not local observations, pressure transfer or forecast input.'}:null;}
}
