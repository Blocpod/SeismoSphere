import * as THREE from 'three';
import {stressPosition,stressColor} from './stress-geometry.js';
import {finiteFaultAvailability} from './finite-fault.js';
export class StressLayer{
  constructor(earth,explorer){
    Object.assign(this,{earth,explorer});earth.stressLayer=this;this.group=new THREE.Group();earth.scene.add(this.group);this.group.visible=false;
    this.caption=document.createElement('section');this.caption.className='stress-map-caption panel';this.caption.hidden=true;this.caption.innerHTML='<strong>STATIC STRESS · MODEL CALCULATION</strong><p></p><button class="secondary" data-inspect>Inspect samples</button><button class="secondary" data-hide>Hide stress</button>';document.querySelector('#workspace').append(this.caption);
    this.button=document.createElement('button');this.button.id='stress-open';this.button.textContent='Static stress';this.button.setAttribute('aria-label','Inspect static stress calculations');this.button.onclick=()=>explorer.node.closest('dialog').showModal();document.querySelector('.globe-toolbar').append(this.button);
    this.note=document.createElement('div');this.note.className='stress-source-caption';this.note.hidden=true;document.querySelector('#workspace').append(this.note);
    this.caption.querySelector('[data-inspect]').onclick=()=>explorer.node.closest('dialog').showModal();this.caption.querySelector('[data-hide]').onclick=()=>{explorer.node.querySelector('[data-globe]').checked=false;this.sync();};
  }
  sync(){
    const e=this.explorer,c=e.cutoff(),source=e.source,record=e.record,projection=e.projection,limit=Number(e.node.querySelector('[data-limit]').value);
    const ready=source&&record&&projection?.sourceId===source.id&&projection.validation.supported&&projection.validation.earthRadiusKm===6371.0088&&!finiteFaultAvailability(source,source.product,c)&&Number.isFinite(limit)&&limit>0&&(c.mode!=='strict'||Math.max(record.createdAt,projection.createdAt,e.baseline?.createdAt??0)<=c.asOf);
    e.node.querySelector('[data-globe]').disabled=!ready;e.node.querySelector('[data-locate]').disabled=!ready;const valid=ready&&e.node.querySelector('[data-globe]').checked;
    this.group.visible=!!valid;if(this.caption.hidden===!!valid)this.caption.hidden=!valid;if(this.note.hidden===!!valid)this.note.hidden=!valid;if(!valid){if(this.key){this.earth.clear(this.group);this.key=null;}return;}
    const report=e.difference??e.plotReport,key=[record.id,projection.id,e.baseline?.id,limit,this.earth.depthScale].join(':');
    if(key!==this.key){
      this.earth.clear(this.group);this.key=key;const positions=[],colors=[];
      report.points.forEach((p,i)=>{const value=report.values[i];if(!value)return;positions.push(...stressPosition(source.model.origin,p,this.earth.depthScale));colors.push(...new THREE.Color(...stressColor(value.coulombPa,limit)).convertSRGBToLinear().toArray());});
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      this.group.add(new THREE.Points(geometry,new THREE.PointsMaterial({vertexColors:true,size:5,sizeAttenuation:false,toneMapped:false,depthTest:true,depthWrite:false})));
    }
    this.group.children[0].material.clippingPlanes=this.earth.geology?.section?this.earth.geology.planes:[];this.group.children[0].material.clipIntersection=true;
    const provenance=`STATIC STRESS · ${record.report.solver} ${record.report.solverVersion} · source ${source.event.place} · projection receipt ${projection.id.slice(0,12)} · ${e.difference?'difference between saved calculations':'saved calculation'} · not a forecast`;if(this.note.textContent!==provenance)this.note.textContent=provenance;
    const caption=`${e.difference?'Current − baseline':'Coulomb change'} · blue −${limit} / orange +${limit} MPa · ${report.points.length-report.excludedCount} unmasked samples · ${e.grid.depth} km depth · ${this.earth.depthScale}× depth scale${this.earth.depthScale>1?' (exaggerated)':''}. Fixed-size sample symbols, no interpolation. Use X-ray to see below the surface.`;if(this.caption.querySelector('p').textContent!==caption)this.caption.querySelector('p').textContent=caption;
  }
  show(){this.sync();if(!this.group.visible)return;this.earth.setXray(true);this.earth.focus(this.explorer.source.model.origin,1.35,false,{regional:true});this.explorer.node.closest('dialog').close();}
  evidence(){this.sync();if(!this.group.visible)return null;const e=this.explorer;return {sourceId:e.source.id,sourceHash:e.source.receipt.sha256,result:e.record,baseline:e.baseline??null,projection:e.projection,limitMPa:Number(e.node.querySelector('[data-limit]').value),depthScale:this.earth.depthScale,policy:'Static calculation, not an observed stress field or timed forecast. Spherical source mapping checked against companion patch centers. Actual sample depth with displayed scaling and 0.04-radius core clamp. Fixed five-pixel symbols, masked samples omitted, no interpolation. Colors use current minus baseline when a baseline is selected.'};}
}
