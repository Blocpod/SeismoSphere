import * as THREE from 'three';
import {makeSection,sectionCoordinates,sectionVector,clipSectionSegment,cutawayNormals} from './section-geometry.js';
import {setupSectionTools} from './section-tools.js';
const R=6371.0088,RAD=Math.PI/180;
function xyz(lat,lon,radius=1){return new THREE.Vector3(radius*Math.cos(lat*RAD)*Math.cos(lon*RAD),radius*Math.sin(lat*RAD),-radius*Math.cos(lat*RAD)*Math.sin(lon*RAD));}
const colorAt=depth=>new THREE.Color().setHSL(.48+Math.min(700,depth)/700*.3,.6,.6);

export class Geology {
  constructor(earth,getContext=()=>null){
    this.earth=earth;this.getContext=getContext;earth.geology=this;this.section=false;this.cutawayMode='wedge';this.hemisphereSide=1;this.slabsEnabled=false;this.features=null;
    this.slabGroup=new THREE.Group();this.cap=new THREE.Group();earth.scene.add(this.slabGroup,this.cap);this.cap.visible=false;
    earth.renderer.localClippingEnabled=true;
    this.normal=new THREE.Vector3(0,0,1);
    this.caption=document.createElement('div');this.caption.className='geology-caption';this.caption.hidden=true;document.querySelector('#workspace').appendChild(this.caption);
    document.querySelector('#xray-toggle').insertAdjacentHTML('afterend','<button id="section-toggle" aria-label="Geological cutaway" aria-pressed="false">◐ <span>Cutaway</span></button><button id="slabs-toggle" aria-label="Slab2 depth contours" aria-pressed="false">≋ <span>Slabs</span></button>');
    document.querySelector('#section-toggle').onclick=()=>this.setSection(!this.section,earth.selected??{lat:-22,lon:-177});
    document.querySelector('#slabs-toggle').onclick=async()=>{
      const button=document.querySelector('#slabs-toggle');button.disabled=true;
      try{await this.load();this.slabsEnabled=!this.slabsEnabled;if(this.slabsEnabled&&!this.section)earth.setXray(true);this.drawSlabs();this.updateCaption();}
      catch(e){this.caption.hidden=false;this.caption.textContent=e.message;}
      finally{button.disabled=false;}
    };
    setupSectionTools(this);
  }
  async load(){
    if(this.features)return;
    this.caption.hidden=false;this.caption.textContent='Loading sourced USGS Slab2 contours…';
    const response=await fetch('/assets/slab2-depth.json');if(!response.ok)throw new Error('Slab2 dataset unavailable. Run node scripts/setup-geology.mjs.');
    const data=await response.json();if(!Array.isArray(data.features)||!data.provenance)throw new Error('Invalid Slab2 dataset');
    this.features=data.features;this.provenance=data.provenance;
  }
  updateCaption(){
    for(const [id,value] of [['section-toggle',this.section],['slabs-toggle',this.slabsEnabled]]){const b=document.querySelector('#'+id);b.classList.toggle('active',value);b.setAttribute('aria-pressed',String(value));}
    this.caption.hidden=!this.section&&!this.slabsEnabled;
    this.caption.innerHTML=this.section?`<strong>${this.cutawayMode==='hemisphere'?'HEMISPHERE CUTAWAY':'OBLIQUE CUTAWAY'} · TRUE DEPTH</strong><span>${this.sectionEvents?.length??0} earthquakes projected · ${this.frame.bearing.toFixed(1)}° bearing · ±${this.frame.halfWidthKm} km</span><span class="section-legend"><i style="background:#56666a"></i>Mantle <i style="background:#c18b42"></i>Outer core <i style="background:#edcf8d"></i>Inner core</span><small>${this.locked?'Fixed corridor.':'Follows selected event.'} Reference layers; uniform 35 km crust is schematic.</small><button class="secondary" id="section-configure">Configure & inspect section</button>`:`<strong>USGS SLAB2 · ${this.features?.length??0} DEPTH CONTOURS</strong><span>Published slab geometry model · Hayes et al., 2018</span><small>Not a measured slab boundary. Depth scale ${this.earth.depthScale}×.</small>`;
    this.caption.querySelector('#section-configure')?.addEventListener('click',()=>this.openTools());
    document.querySelector('#view-label').textContent=this.section?'GEOLOGICAL SECTION':this.earth.xray?'SUBSURFACE · X-RAY':'ORBITAL VIEW';
  }
  setSection(value,anchor){
    const earth=this.earth;
    if(value){earth.onExternalFocus?.();earth.spatialLayer?.clear();}
    earth.clear(earth.selectionGroup);
    if(value){
      if(!this.section){
        this.previous={xray:earth.xray,depth:earth.depthScale,clouds:earth.clouds.visible,atmosphere:earth.atmosphere.visible,grid:earth.grid.visible,field:earth.field.visible,paths:earth.pathGroup.visible,forecasts:earth.forecastGroup.visible};
        earth.setXray(false);
      }
      this.section=true;this.anchor=anchor??this.anchor??{lat:-22,lon:-177};
      this.frame=makeSection({...this.anchor,bearing:this.bearing??0,lengthKm:this.lengthKm??6000,halfWidthKm:this.halfWidthKm??100});
      this.normal.fromArray(this.frame.normal);
      const radial=new THREE.Vector3().fromArray(this.frame.radial),tangent=new THREE.Vector3().fromArray(this.frame.tangent);
      this.planes=cutawayNormals(this.frame,this.cutawayMode,this.hemisphereSide).map(n=>new THREE.Plane(new THREE.Vector3().fromArray(n),0));
      earth.surfaceMaterial.clippingPlanes=this.planes;earth.surfaceMaterial.clipIntersection=true;earth.surfaceMaterial.needsUpdate=true;
      earth.plates.traverse(child=>{if(child.material){child.material.clippingPlanes=this.planes;child.material.clipIntersection=true;child.material.needsUpdate=true;}});
      earth.depthScale=1;earth.clouds.visible=false;earth.atmosphere.visible=false;earth.grid.visible=false;earth.field.visible=false;earth.pathGroup.visible=false;earth.forecastGroup.visible=false;
      // Capped central planes expose a radial wedge or one hemisphere. Layer radii are schematic.
      earth.clear(this.cap);
      const layers=[{a:0,b:(R-5120)/R,color:0xedcf8d},{a:(R-5120)/R,b:(R-2900)/R,color:0xc18b42},{a:(R-2900)/R,b:(R-35)/R,color:0x56666a},{a:(R-35)/R,b:1,color:0xabc3bc}];
      const hemisphere=this.cutawayMode==='hemisphere',sweep=hemisphere?2*Math.PI:Math.PI,faces=hemisphere?[[radial,this.normal,this.normal.clone().multiplyScalar(this.hemisphereSide)]]:[[radial,this.normal,this.normal],[this.normal,radial.clone().negate(),radial]];
      let faceIndex=0;
      for(const [x,z,offset] of faces){
        const face=new THREE.Group();
        for(const l of layers){const mesh=new THREE.Mesh(new THREE.RingGeometry(l.a,l.b,192,1,-Math.PI/2,sweep),new THREE.MeshBasicMaterial({color:new THREE.Color(l.color).multiplyScalar(faceIndex===0?1:.52),side:THREE.DoubleSide,toneMapped:false}));face.add(mesh);}
        for(const radius of [(R-5120)/R,(R-2900)/R,(R-35)/R]){
          const pts=Array.from({length:193},(_,i)=>new THREE.Vector3(Math.cos(-Math.PI/2+i/192*sweep)*radius,Math.sin(-Math.PI/2+i/192*sweep)*radius,.001));
          face.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xd7dfd0,transparent:true,opacity:.22})));
        }
        face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,tangent,z));face.position.copy(offset).multiplyScalar(.0002);this.cap.add(face);
        faceIndex++;
      }
      this.cap.visible=true;
      const look=this.normal.clone().multiplyScalar(hemisphere?1.4*this.hemisphereSide:1.3).add(radial.clone().multiplyScalar(2.6)).add(tangent.clone().multiplyScalar(.5)).normalize();
      earth.targetCamera=look.multiplyScalar(earth.mobile?earth.baseDistance*1.06:3.9);earth.controls.autoRotate=false;
      document.querySelector('#depth-scale').value='1';document.querySelector('#depth-scale').disabled=true;
      document.querySelector('#field-toggle').disabled=true;document.querySelector('#paths-toggle').disabled=true;
    }else{
      this.section=false;this.cap.visible=false;earth.surfaceMaterial.clippingPlanes=[];earth.surfaceMaterial.needsUpdate=true;
      earth.plates.traverse(child=>{if(child.material){child.material.clippingPlanes=[];child.material.needsUpdate=true;}});
      if(this.previous){earth.depthScale=this.previous.depth;earth.clouds.visible=true;earth.atmosphere.visible=this.previous.atmosphere;earth.grid.visible=this.previous.grid;earth.field.visible=this.previous.field;earth.pathGroup.visible=this.previous.paths;earth.forecastGroup.visible=this.previous.forecasts;}
      document.querySelector('#depth-scale').disabled=false;document.querySelector('#depth-scale').value=String(earth.depthScale);
      document.querySelector('#field-toggle').disabled=false;document.querySelector('#paths-toggle').disabled=false;
      earth.setXray(this.slabsEnabled||this.previous?.xray||false);
    }
    document.querySelector('.field-caption').hidden=this.section||!earth.field.visible;
    document.querySelector('#xray-toggle').classList.toggle('active',earth.xray);document.querySelector('#xray-toggle').setAttribute('aria-pressed',String(earth.xray));
    earth.setEvents(earth.events,earth.asOf);this.drawSlabs();this.updateCaption();earth.faults?.updateClipping();earth.instruments?.updateClipping();earth.volcanoes?.updateClipping();earth.volcanoActivity?.updateClipping();earth.weeklyVolcanoes?.updateClipping();earth.cratons?.updateClipping();earth.geodesy?.updateClipping();earth.mechanisms?.update();this.drawSectionTrack?.();earth.syncPresentation();earth.relief?.sync();
  }
  projected(point){const angle=Math.atan2(point.dot(new THREE.Vector3().fromArray(this.frame.tangent)),point.dot(new THREE.Vector3().fromArray(this.frame.radial)));return new THREE.Vector3().fromArray(sectionVector(angle*R,(1-point.length())*R,this.frame));}
  contains(event){return sectionCoordinates(event,this.frame).inside;}
  evidence(){return this.section?{schema:'seismosphere.section.v1',capturedAt:new Date().toISOString(),catalogContext:structuredClone(this.getContext()),frame:structuredClone(this.frame),cutaway:{mode:this.cutawayMode,hemisphereSide:this.hemisphereSide,clippingPlanes:this.planes.map(p=>({normal:p.normal.toArray(),constant:p.constant})),capFaces:this.cap.children.length,projection:'Corridor earthquakes and slab contours projected onto the central section plane; other reference layers retain their own positions'},fixed:!!this.locked,asOf:this.earth.asOf,method:'Spherical great-circle corridor, surface cross-track distance; radial depth preserved on projection. Contour segments are clipped linearly in oblique coordinates.',events:(this.sectionEvents??[]).map(e=>({...e,...sectionCoordinates(e,this.frame)})),slabContours:this.slabsEnabled?{provenance:this.provenance,segments:this.sectionSlabs??[]}:null,referenceDepthsKm:{schematicCrust:35,mantleCore:2900,outerInnerCore:5120}}:null;}
  updateSectionEvents(){
    if(!this.section)return;
    const earth=this.earth;for(const child of earth.eventGroup.children)child.visible=false;
    const events=earth.events.filter(e=>this.contains(e)),positions=[],colors=[];this.sectionEvents=events;
    for(const e of events){positions.push(...this.projected(xyz(e.lat,e.lon,1-e.depth/R)).toArray());colors.push(...colorAt(e.depth).toArray());}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const points=new THREE.Points(geometry,new THREE.PointsMaterial({size:.018,map:earth.glow,vertexColors:true,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
    points.userData.events=events;points.userData.section=true;earth.eventGroup.add(points);this.updateCaption();earth.sonification?.checkContext();
  }
  drawSlabs(){
    this.earth.clear(this.slabGroup);this.sectionSlabs=[];this.slabGroup.visible=this.slabsEnabled;if(!this.slabsEnabled||!this.features)return;
    const positions=[],colors=[],scale=this.section?1:this.earth.depthScale;
    for(const f of this.features){
      const depth=f.properties.depth,color=colorAt(depth),radius=Math.max(.04,1-depth*scale/R);
      for(const line of f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates){
        for(let i=1;i<line.length;i++){
          let a=xyz(line[i-1][1],line[i-1][0],radius),b=xyz(line[i][1],line[i][0],radius);
          if(this.section){
            const clipped=clipSectionSegment(sectionCoordinates({lat:line[i-1][1],lon:line[i-1][0]},this.frame),sectionCoordinates({lat:line[i][1],lon:line[i][0]},this.frame),this.frame);if(!clipped)continue;
            this.sectionSlabs.push({depth,region:f.properties.name??f.properties.region??null,a:clipped[0],b:clipped[1]});
            a=new THREE.Vector3().fromArray(sectionVector(clipped[0].alongKm,depth,this.frame));b=new THREE.Vector3().fromArray(sectionVector(clipped[1].alongKm,depth,this.frame));
          }
          positions.push(...a.toArray(),...b.toArray());colors.push(...color.toArray(),...color.toArray());
        }
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this.slabGroup.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:this.section?.95:.6,depthTest:!this.section,depthWrite:false})));
  }
}
