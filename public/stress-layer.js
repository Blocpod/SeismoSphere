import * as THREE from 'three';
import {stressPosition,stressColor,ruptureCorners} from './stress-geometry.js';
import {finiteFaultAvailability} from './finite-fault.js';
export class StressLayer{
  constructor(earth,explorer){
    Object.assign(this,{earth,explorer});earth.stressLayer=this;this.group=new THREE.Group();earth.scene.add(this.group);this.group.visible=false;
    this.caption=document.createElement('section');this.caption.className='stress-map-caption panel';this.caption.hidden=true;this.caption.innerHTML='<strong>STATIC STRESS · MODEL CALCULATION</strong><p></p><button class="secondary" data-inspect>Inspect samples</button><button class="secondary" data-hide>Hide stress</button>';document.querySelector('#workspace').append(this.caption);
    this.button=document.createElement('button');this.button.id='stress-open';this.button.textContent='Static stress';this.button.setAttribute('aria-label','Inspect static stress calculations');this.button.onclick=()=>earth.mechanisms.open();document.querySelector('.globe-toolbar').append(this.button);
    this.note=document.createElement('div');this.note.className='stress-source-caption';this.note.hidden=true;document.querySelector('#workspace').append(this.note);
    this.caption.querySelector('[data-inspect]').onclick=()=>explorer.node.closest('dialog').showModal();this.caption.querySelector('[data-hide]').onclick=()=>{explorer.node.querySelector('[data-globe]').checked=false;this.sync();};
  }
  sync(){
    const e=this.explorer,c=e.cutoff(),source=e.source,record=e.record,projection=e.projection,limit=Number(e.node.querySelector('[data-limit]').value);
    const ready=source&&record&&projection?.sourceId===source.id&&projection.validation.supported&&projection.validation.earthRadiusKm===6371.0088&&!finiteFaultAvailability(source,source.product,c)&&Number.isFinite(limit)&&limit>0&&(c.mode!=='strict'||Math.max(record.createdAt,projection.createdAt,e.baseline?.createdAt??0)<=c.asOf);
    e.node.querySelector('[data-globe]').disabled=!ready;e.node.querySelector('[data-locate]').disabled=!ready;e.node.querySelector('[data-geographic]').disabled=!ready;e.node.querySelector('[data-rupture]').disabled=!ready;const valid=ready&&e.node.querySelector('[data-globe]').checked;
    this.group.visible=!!valid;if(this.caption.hidden===!!valid)this.caption.hidden=!valid;if(this.note.hidden===!!valid)this.note.hidden=!valid;if(!valid){if(this.key){this.earth.clear(this.group);this.key=null;}return;}
    const report=e.difference??e.plotReport,key=[record.id,projection.id,e.baseline?.id,limit,this.earth.depthScale,e.node.querySelector('[data-rupture]').checked].join(':');
    if(key!==this.key){
      this.earth.clear(this.group);this.key=key;const positions=[],colors=[],indices=[];
      report.points.forEach((p,i)=>{const value=report.values[i];if(!value)return;indices.push(i);positions.push(...stressPosition(source.model.origin,p,this.earth.depthScale));colors.push(...new THREE.Color(...stressColor(value.coulombPa,limit)).convertSRGBToLinear().toArray());});
      const geometry=new THREE.BufferGeometry();geometry.userData.sampleIndices=indices;geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      this.group.add(new THREE.Points(geometry,new THREE.PointsMaterial({vertexColors:true,size:5,sizeAttenuation:false,toneMapped:false,depthTest:true,depthWrite:false})));
      if(e.node.querySelector('[data-rupture]').checked){
        const vertices=[];for(const patch of source.model.patches){const corners=ruptureCorners(patch).map(p=>stressPosition(source.model.origin,p,this.earth.depthScale));for(const [a,b]of [[0,1],[1,2],[2,3],[3,0]])vertices.push(...corners[a],...corners[b]);}
        const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));this.group.add(new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:0xf2ce8e,transparent:true,opacity:.75,depthTest:true,depthWrite:false})));
      }
    }
    for(const object of this.group.children){object.material.clippingPlanes=this.earth.geology?.section?this.earth.geology.planes:[];object.material.clipIntersection=true;}
    const provenance=`STATIC STRESS · ${record.report.solver} ${record.report.solverVersion} · source ${source.event.place} · projection receipt ${projection.id.slice(0,12)} · ${e.difference?'difference between saved calculations':'saved calculation'} · not a forecast`;if(this.note.textContent!==provenance)this.note.textContent=provenance;
    const caption=`${e.difference?'Current − baseline':'Coulomb change'} · blue −${limit} / orange +${limit} MPa · ${report.points.length-report.excludedCount} unmasked samples · ${e.grid.depth} km depth · ${this.earth.depthScale}× depth scale${this.earth.depthScale>1?' (exaggerated)':''}. Fixed-size sample symbols, no interpolation. Use X-ray to see below the surface; click or tap a sample to inspect its values.${e.node.querySelector('[data-rupture]').checked?' Amber outlines show published source rupture patches, not stress colors.':''}`;if(this.caption.querySelector('p').textContent!==caption)this.caption.querySelector('p').textContent=caption;
  }
  pick(event){
    this.sync();if(!this.group.visible||!this.earth.xray)return false;
    const geometry=this.group.children[0].geometry,rect=this.earth.renderer.domElement.getBoundingClientRect();let best=-1,distance=event.pointerType==='touch'?20:8,depth=Infinity;
    for(let i=0;i<geometry.attributes.position.count;i++){
      const world=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i);
      if(this.earth.geology?.section&&this.earth.geology.planes.every(p=>p.distanceToPoint(world)<0))continue;
      const p=world.project(this.earth.camera);if(p.z< -1||p.z>1)continue;
      const d=Math.hypot(rect.left+(p.x+1)*rect.width/2-event.clientX,rect.top+(1-p.y)*rect.height/2-event.clientY);
      if(d<distance||d===distance&&p.z<depth){best=geometry.userData.sampleIndices[i];distance=d;depth=p.z;}
    }
    if(best<0)return false;
    const e=this.explorer,sample=e.node.querySelector('[data-sample]');sample.value=String(best);e.draw();e.node.closest('dialog').showModal();sample.focus();sample.scrollIntoView({block:'center'});return true;
  }
  show(){this.sync();if(!this.group.visible)return;this.earth.setXray(true);this.earth.focus(this.explorer.source.model.origin,1.35,false,{regional:true});this.explorer.node.closest('dialog').close();}
  evidence(){this.sync();if(!this.group.visible)return null;const e=this.explorer;return {rupturePatches:e.node.querySelector('[data-rupture]').checked,sourceId:e.source.id,sourceHash:e.source.receipt.sha256,result:e.record,baseline:e.baseline??null,projection:e.projection,limitMPa:Number(e.node.querySelector('[data-limit]').value),depthScale:this.earth.depthScale,policy:'Static calculation, not an observed stress field or timed forecast. Spherical source mapping checked against companion patch centers. Actual sample depth with displayed scaling and 0.04-radius core clamp. Fixed five-pixel symbols, masked samples omitted, no interpolation. Colors use current minus baseline when a baseline is selected.'};}
}
