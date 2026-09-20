import * as THREE from 'three';
import {unit} from './fault-geometry.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=f=>f.properties.name||f.properties.fz_name||f.properties.catalog_id||'Unnamed mapped trace';
export class Faults {
  constructor(earth,{getEvent,toast}){
    this.earth=earth;earth.faults=this;this.getEvent=getEvent;this.toast=toast;this.enabled=false;this.features=null;this.selectedIndex=null;this.pending=new Map();this.serial=0;
    this.group=new THREE.Group();this.highlight=new THREE.Group();earth.scene.add(this.group,this.highlight);this.group.visible=false;
    this.button=document.createElement('button');this.button.id='faults-open';this.button.textContent='⌇ Faults';this.button.setAttribute('aria-label','Explore mapped faults');document.querySelector('.globe-toolbar').appendChild(this.button);
    this.caption=document.createElement('div');this.caption.className='fault-caption';this.caption.hidden=true;document.querySelector('#workspace').appendChild(this.caption);
    this.dialog=document.createElement('dialog');this.dialog.id='fault-dialog';this.dialog.className='wide-dialog';
    this.dialog.innerHTML='<div class="dialog-heading"><div><span class="eyebrow">GEOLOGICAL REFERENCE</span><h2>Mapped active faults</h2><p>Explore the GEM Global Active Faults Database.</p></div><button id="fault-close" class="icon-btn" aria-label="Close mapped faults">×</button></div><p class="muted">Static mapped surface traces, with uneven coverage and accuracy. This layer is not a live rupture map or a forecast input.</p><label class="check"><input id="fault-visible" type="checkbox" disabled> Show mapped fault traces on Earth</label><div id="fault-status" role="status"></div><div class="fault-tools"><label>Search name, catalog or source<input id="fault-search" type="search" placeholder="San Andreas, Hayward…" disabled></label><div><button id="fault-near-event" class="secondary" disabled>Near selected event</button><button id="fault-near-camera" class="secondary" disabled>Below camera</button></div></div><p id="fault-query" class="muted"></p><div class="fault-columns"><div id="fault-results"></div><section id="fault-detail" aria-label="Selected mapped fault"><p class="muted">Select a trace to inspect its source attributes.</p></section></div><div class="fault-source"><a href="https://github.com/GEMScienceTools/gem-global-active-faults" target="_blank" rel="noreferrer">GEM / Styron &amp; Pagani (2020) ↗</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a><p>Revision 2021-06-24. Traces and source attributes are retained; publication exports identify this mapped reference separately from cutoff-limited observations.</p><a href="/assets/gem-faults.json" download>Download full pinned dataset ↓</a></div>';
    document.body.appendChild(this.dialog);this.status=this.dialog.querySelector('#fault-status');this.results=this.dialog.querySelector('#fault-results');this.detail=this.dialog.querySelector('#fault-detail');this.search=this.dialog.querySelector('#fault-search');
    this.button.onclick=async()=>{this.dialog.showModal();try{await this.load();this.searchResults();}catch(error){this.status.textContent=error.message;}};
    this.dialog.querySelector('#fault-close').onclick=()=>this.dialog.close();
    this.dialog.querySelector('#fault-visible').onchange=e=>this.setEnabled(e.target.checked);
    this.search.oninput=()=>this.searchResults();
    this.results.onclick=e=>{const button=e.target.closest('[data-fault]');if(button)this.select(Number(button.dataset.fault));};
    this.dialog.querySelector('#fault-near-event').onclick=()=>{const event=getEvent();if(!event){toast('Select an earthquake first, then inspect nearby faults.');return;}this.nearby({lat:event.lat,lon:event.lon},`M${event.mag.toFixed(1)} · ${event.place}`,event);};
    this.dialog.querySelector('#fault-near-camera').onclick=()=>{const p=earth.camera.position.clone().normalize();this.nearby({lat:Math.asin(p.y)*180/Math.PI,lon:Math.atan2(-p.z,p.x)*180/Math.PI},'Point below camera');};
    this.detail.onclick=e=>{if(e.target.closest('#fault-focus')&&this.selectedIndex!==null){this.setEnabled(true);const feature=this.features[this.selectedIndex],line=feature.geometry.type==='LineString'?feature.geometry.coordinates:feature.geometry.coordinates[0],c=line[Math.floor(line.length/2)];earth.focus({lat:c[1],lon:c[0]},2.1);this.dialog.close();}};
  }
  async load(){
    if(this.features)return;if(this.loading)return this.loading;
    this.loading=(async()=>{
      this.status.textContent='Loading pinned fault geometry and building a background spatial index…';
      const response=await fetch('/assets/gem-faults.json');if(!response.ok)throw new Error('Fault dataset unavailable. Run node scripts/setup-faults.mjs.');
      const data=await response.json();if(!data.provenance||!Array.isArray(data.features))throw new Error('Invalid fault dataset');
      this.worker=new Worker('/fault-worker.js',{type:'module'});
      this.worker.onmessage=({data})=>{const pending=this.pending.get(data.id);if(!pending)return;this.pending.delete(data.id);clearTimeout(pending.timer);data.error?pending.reject(new Error(data.error)):pending.resolve(data);};
      this.worker.onerror=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Fault spatial worker failed'));}this.pending.clear();};
      await this.request({type:'init',features:data.features.map(f=>({geometry:f.geometry}))});
      this.features=data.features;this.provenance=data.provenance;this.draw();
      for(const id of ['fault-visible','fault-search','fault-near-event','fault-near-camera'])this.dialog.querySelector('#'+id).disabled=false;
      this.status.textContent=`${this.features.length.toLocaleString()} mapped traces · pinned source ${this.provenance.revision.slice(0,12)}`;
    })().catch(error=>{this.worker?.terminate();this.features=null;throw error;}).finally(()=>this.loading=null);
    return this.loading;
  }
  request(message){return new Promise((resolve,reject)=>{const id=++this.serial,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Fault lookup timed out'));},30000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({...message,id});});}
  setEnabled(value){this.enabled=value;this.group.visible=value;this.highlight.visible=value;this.caption.hidden=!value;this.caption.textContent='GEM MAPPED FAULTS · STATIC REFERENCE · CC BY-SA 4.0';this.button.classList.toggle('active',value);this.button.setAttribute('aria-pressed',String(value));this.dialog.querySelector('#fault-visible').checked=value;}
  draw(){
    this.earth.clear(this.group);const positions=[];
    for(const f of this.features)for(const line of f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates)for(let i=1;i<line.length;i++)for(const c of [line[i-1],line[i]])positions.push(...unit({lat:c[1],lon:c[0]}).map(v=>v*1.004));
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.group.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xffa994,transparent:true,opacity:.7,depthWrite:false})));this.updateClipping();
  }
  updateClipping(){for(const group of [this.group,this.highlight])group.traverse(child=>{if(child.material){child.material.clippingPlanes=this.earth.geology?.section?this.earth.geology.planes:[];child.material.clipIntersection=true;child.material.needsUpdate=true;}});}
  searchResults(){
    if(!this.features)return;this.querySerial=(this.querySerial??0)+1;const value=this.search.value.trim().toLowerCase(),matches=[];let count=0;
    this.features.forEach((f,index)=>{if(!value||[f.properties.name,f.properties.fz_name,f.properties.catalog_id,f.properties.catalog_name,f.properties.reference].some(x=>String(x??'').toLowerCase().includes(value))){count++;if(matches.length<100)matches.push({featureIndex:index});}});
    this.dialog.querySelector('#fault-query').textContent=`${count.toLocaleString()} matching traces${count>100?' · showing first 100; refine your search':''}`;this.renderMatches(matches);
  }
  renderMatches(matches){this.results.innerHTML=matches.length?matches.map(m=>{const f=this.features[m.featureIndex];return `<button class="fault-row" data-fault="${m.featureIndex}"><strong>${escape(label(f))}</strong><span>${escape(f.properties.slip_type||'Kinematics unspecified')} · ${escape(f.properties.catalog_id||'No source ID')}</span>${m.distanceKm!==undefined?`<small>${m.distanceKm.toFixed(2)} km to mapped surface trace</small>`:''}</button>`;}).join(''):'<p class="muted">No mapped trace matches this query. Missing coverage does not imply no active faults.</p>';}
  async nearby(point,name,event=null){
    const serial=this.querySerial=(this.querySerial??0)+1;this.dialog.querySelector('#fault-query').textContent='Finding nearest mapped segments within 500 km…';
    try{const {matches}=await this.request({type:'nearest',point});if(serial!==this.querySerial)return;
      this.lastQuery={point,name,eventId:event?.id??null,eventTime:event?.time??null,method:'Shortest spherical distance from epicenter to minor-arc surface trace segments; Earth radius 6371.0088 km; maximum 500 km; no causal association',matches};
      this.search.value='';this.dialog.querySelector('#fault-query').textContent=`${name} · ${point.lat.toFixed(3)}°, ${point.lon.toFixed(3)}°. ${matches.length} nearest mapped traces within 500 km. Surface distance only; not a fault assignment.`;this.renderMatches(matches);
    }catch(error){if(serial===this.querySerial)this.dialog.querySelector('#fault-query').textContent=error.message;}
  }
  select(index){
    const f=this.features[index];if(!f)return;this.selectedIndex=index;this.earth.clear(this.highlight);
    for(const line of f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates){const points=line.map(c=>new THREE.Vector3(...unit({lat:c[1],lon:c[0]})).multiplyScalar(1.007));this.highlight.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffffff,depthWrite:false})));}
    this.highlight.visible=this.enabled;this.updateClipping();
    this.detail.innerHTML=`<span class="eyebrow">SOURCE TRACE #${index+1}</span><h3>${escape(label(f))}</h3><button id="fault-focus" class="primary full">Locate on Earth →</button><p class="muted">Source tuples use (most likely, minimum, maximum); blank values remain unknown. Slip rates are mm/year, dip/rake are degrees, and seismogenic depths are km.</p><dl>${Object.entries(f.properties).map(([key,value])=>`<div><dt>${escape(key.replaceAll('_',' '))}</dt><dd>${value===null||value===''?'Not supplied':escape(value)}</dd></div>`).join('')}</dl><p class="muted">Feature index is specific to the pinned dataset. Duplicate source IDs are retained separately. A mapped trace does not determine which fault produced an earthquake.</p>`;
  }
  evidence(){return this.features?{enabled:this.enabled,provenance:this.provenance,selectedFeatureIndex:this.selectedIndex,selectedFeature:this.selectedIndex===null?null:this.features[this.selectedIndex],lastQuery:this.lastQuery??null}:null;}
}
