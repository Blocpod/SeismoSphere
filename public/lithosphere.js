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
export class Lithosphere {
 constructor(earth){
  this.earth=earth;earth.lithosphere=this;this.enabled=[false,false];this.group=new THREE.Group();earth.scene.add(this.group);
  const button=document.createElement('button');button.id='lithosphere-open';button.textContent='◉ Lithosphere';document.querySelector('.globe-toolbar').append(button);
  this.dialog=document.createElement('dialog');this.dialog.className='wide-dialog';this.dialog.innerHTML='<div class="dialog-heading"><div><span class="eyebrow">LITHO1.0 · PUBLISHED REFERENCE</span><h2>Lithosphere & asthenosphere</h2></div><button class="icon-btn" aria-label="Close lithosphere layers">×</button></div><p>Peel between the mantle lid and underlying asthenosphere. These are static model boundaries, not observed pressure or earthquake forecasts.</p><div class="form-grid"><label class="check"><input type="checkbox" data-litho="0" disabled>Lithospheric mantle lid · teal</label><label class="check"><input type="checkbox" data-litho="1" disabled>Asthenosphere · amber</label><label>Boundary opacity<input id="lithosphere-opacity" type="range" min="0.05" max="0.6" step="0.05" value="0.2"></label></div><p role="status"></p><p class="muted">Both top and bottom boundaries are shown. Facets join original tessellation nodes; surfaces between nodes are display interpolation. Crust is separate from the mantle lid. Earth depth exaggeration applies and is labeled. In cutaway these surfaces retain their actual 3D positions, while corridor earthquakes are projected onto the section plane.</p><a href="https://igppweb.ucsd.edu/~gabi/litho1.0.html" target="_blank" rel="noreferrer">Pasyanos et al. (2014) · LITHO1.0 source</a>';
  document.body.append(this.dialog);this.status=this.dialog.querySelector('[role="status"]');this.dialog.querySelector('.icon-btn').onclick=()=>this.dialog.close();button.onclick=()=>{this.dialog.showModal();this.load().catch(error=>this.status.textContent=error.message);};
  this.dialog.querySelectorAll('[data-litho]').forEach(input=>input.onchange=()=>{this.enabled[Number(input.dataset.litho)]=input.checked;if(input.checked&&!earth.geology?.section)earth.setXray(true);this.sync();});
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
  this.caption.hidden=!this.group.children.some(mesh=>mesh.visible);this.caption.textContent=`LITHO1.0 · ${this.enabled[0]?'mantle lid (teal) ':''}${this.enabled[1]?'asthenosphere (amber) ':''}· depth ${scale}×${scale>1?' EXAGGERATED':''} · static, faceted model boundaries`;
  this.status.textContent=`${this.metadata.nodeCount.toLocaleString()} original nodes · ${this.metadata.mesh.triangles.toLocaleString()} display facets per boundary · depth ${scale}×.`;
 }
 evidence(){return this.metadata&&this.group.children.some(mesh=>mesh.visible)?{provenance:this.metadata,layers:{mantleLid:this.enabled[0],asthenosphere:this.enabled[1]},depthScale:this.scale,opacity:this.opacity,policy:'Static model reference, including during replay. Facets interpolate original node boundaries for display; not local observations, pressure transfer or forecast input.'}:null;}
}
