import {stressGeoJSON} from './stress-export.js';
import {StressLayer} from './stress-layer.js';
import {stressColor} from './stress-geometry.js';
import {stressGrid,stressDifference} from './stress-grid.js';
import {finiteFaultAvailability} from './finite-fault.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const input=(name,label,value,min,max,step='any')=>`<label>${label}<input name="${name}" type="number" required value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
export class StressExplorer{
  constructor(node,{api,getState,earth}){
    Object.assign(this,{node,api,getState});this.serial=0;node.hidden=true;node.className='stress-explorer';
    node.innerHTML=`<h3>Static stress explorer</h3><p data-source class="muted"></p><label>Geographic companion file<select data-fsp></select></label><button class="secondary" type="button" data-project>Archive &amp; verify geographic placement</button><p data-projection-status role="status"></p><a data-projection-export hidden download>Download geographic source + verification JSON ↓</a><p class="muted">Local model coordinates, not a geographic forecast. Receiver orientation and material properties below are explicit assumptions.</p><label>Saved stress calculations<select data-history><option value="">Choose a retained calculation</option></select></label><form><fieldset><legend>Receiver fault</legend><div class="stress-fields">${input('strike','Strike (° clockwise from north)',0,0,360)}${input('dip','Dip (°)',45,.01,90)}${input('rake','Rake (°; +90 reverse)',90,-180,180)}</div></fieldset><fieldset><legend>Elastic assumptions</legend><div class="stress-fields">${input('poisson','Poisson ratio',.25,0,.49)}${input('shear','Shear modulus (GPa)',32,1,100)}${input('friction','Effective friction',.4,0,1)}</div></fieldset><fieldset><legend>Sampling plane</legend><div class="stress-fields">${input('depth','Depth (km)',10,0,1000)}${input('east','Center east (km)',0,-1500,1500)}${input('north','Center north (km)',0,-1500,1500)}${input('extent','Half-width (km)',200,1,500)}<label>Grid resolution<select name="resolution"><option value="11">11 × 11</option><option value="21" selected>21 × 21</option><option value="31">31 × 31</option></select></label></div></fieldset><button class="primary" type="submit">Calculate static stress</button></form><p data-status role="status"></p><div data-output hidden><label class="check"><input type="checkbox" data-globe>Show verified stress samples on Earth</label><button type="button" class="secondary" data-locate>Locate stress in X-ray →</button><button type="button" class="secondary" data-geographic>Download geographic samples GeoJSON ↓</button><p class="muted">Globe placement requires a successful geographic companion verification above.</p><p data-assumptions class="muted"></p><label>Compare against saved calculation<select data-compare><option value="">Show current calculation only</option></select></label><p data-comparison role="status"></p><a data-baseline hidden class="secondary" download>Download baseline calculation + source JSON ↓</a><label>Color saturation limit (MPa; symmetric about zero)<input data-limit type="number" value="1" min="0.000001" max="100000" step="any"></label><div data-plot></div><p data-scale class="muted"></p><label>Inspect grid sample<input data-sample type="range" min="0" max="440" value="0" step="1"></label><p data-value role="status"></p><a data-export class="secondary" download>Download calculation + source JSON ↓</a></div><p class="muted">For an individual calculation, positive values promote slip on the assumed receiver and negative values oppose it. In comparison mode, positive means the current value is higher than the baseline. Neither is an earthquake probability. Homogeneous elastic half-space; no topography, dynamic stress or pore-pressure simulation. Samples within 100 m of a source patch are masked.</p>`;
    this.layer=new StressLayer(earth,this);node.querySelector('[data-globe]').onchange=()=>this.layer.sync();node.querySelector('[data-locate]').onclick=()=>{node.querySelector('[data-globe]').checked=true;this.layer.show();};
    node.querySelector('[data-geographic]').onclick=()=>this.exportGeographic();
    this.form=node.querySelector('form');this.status=node.querySelector('[data-status]');this.output=node.querySelector('[data-output]');
    node.querySelector('[data-history]').onchange=e=>{if(e.target.value)this.load(e.target.value);};
    node.querySelector('[data-compare]').onchange=e=>this.compare(e.target.value);
    node.querySelector('[data-project]').onclick=()=>this.verifyProjection();
    this.form.onsubmit=e=>{e.preventDefault();this.calculate();};
    this.form.oninput=()=>{this.serial++;this.record=null;this.output.hidden=true;this.status.textContent='Inputs changed. Calculate to update the result.';};
    node.querySelector('[data-limit]').oninput=()=>this.draw();node.querySelector('[data-sample]').oninput=()=>this.draw();
  }
  exportGeographic(){
    this.layer.sync();if(this.node.querySelector('[data-geographic]').disabled)return;
    try{const data=stressGeoJSON(this.source,this.record,this.projection,this.baseline),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json'})),link=document.createElement('a');link.href=url;link.download=`seismosphere-stress-${this.record.id.slice(0,12)}${this.baseline?'-difference':''}.geojson`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){this.status.textContent=error.message;}
  }
  use(source){this.node.querySelector('[data-globe]').checked=false;this.serial++;this.source=source;this.projection=null;this.projectionSerial=(this.projectionSerial??0)+1;this.node.querySelector('[data-projection-status]').textContent='';this.node.querySelector('[data-projection-export]').hidden=true;const files=source.product.files.filter(f=>f.kind==='Slip model (FSP)');this.node.querySelector('[data-fsp]').innerHTML=files.map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('');this.node.querySelector('[data-project]').disabled=!files.length;this.record=null;this.output.hidden=true;this.status.textContent='Ready to calculate with the assumptions below.';this.node.querySelector('[data-source]').textContent=`${source.event.place} · ${source.model.patches.length} source patches · origin ${source.model.origin.lat}°, ${source.model.origin.lon}° · source revised ${new Date(source.product.updateTime).toISOString()}`;this.sync();this.history().catch(e=>{if(this.source===source)this.status.textContent=e.message;});}
  clear(){this.serial++;this.source=null;this.record=null;this.node.hidden=true;this.layer.sync();}
  cutoff(){const s=this.getState();return {asOf:s.live?Date.now():s.asOf,mode:s.live?'catalog-replay':s.mode,future:s.future};}
  sync(){const c=this.cutoff();if(this.projection&&c.mode==='strict'&&this.projection.createdAt>c.asOf){this.projection=null;this.node.querySelector('[data-projection-export]').hidden=true;this.node.querySelector('[data-projection-status]').textContent='The geographic receipt was unavailable at this strict cutoff.';}const blocked=!this.source||finiteFaultAvailability(this.source,this.source.product,c);this.node.hidden=!!blocked;if(blocked){this.serial++;this.output.hidden=true;}else if(this.record){this.output.hidden=c.mode==='strict'&&this.record.createdAt>c.asOf;if(this.baseline&&c.mode==='strict'&&this.baseline.createdAt>c.asOf){this.clearComparison();this.draw();}}}
  async verifyProjection(){
    const source=this.source,serial=this.projectionSerial=(this.projectionSerial??0)+1,button=this.node.querySelector('[data-project]'),message=this.node.querySelector('[data-projection-status]');
    button.disabled=true;this.projection=null;this.node.querySelector('[data-projection-export]').hidden=true;message.textContent='Archiving companion coordinates and checking every patch center…';
    try{
      const c=this.cutoff(),record=await this.api('rupture-projection-query',{sourceId:source.id,fileName:this.node.querySelector('[data-fsp]').value,asOf:c.asOf,mode:c.mode});
      if(this.source!==source||serial!==this.projectionSerial)return;
      const cutoff=this.cutoff(),reason=finiteFaultAvailability(source,source.product,cutoff);if(reason)throw new Error(reason);
      if(cutoff.mode==='strict'&&record.createdAt>cutoff.asOf)throw new Error('The geographic receipt was unavailable at this strict cutoff.');
      this.projection=record;const v=record.validation;
      message.textContent=v.supported?`Geographic consistency verified for ${v.patches} patch centers. Maximum discrepancy ${(v.maxErrorKm*1000).toFixed(2)} m; RMS ${(v.rmsErrorKm*1000).toFixed(2)} m. ${v.projection}, radius ${v.earthRadiusKm} km. This is file agreement, not rupture-location accuracy.`:`Companion archived; geographic placement remains unavailable: ${v.reason}`;
      const link=this.node.querySelector('[data-projection-export]');link.href='/api/rupture-projection-export?id='+encodeURIComponent(record.id);link.hidden=false;
    }catch(error){if(this.source===source&&serial===this.projectionSerial)message.textContent=error.message;}
    finally{if(this.source===source&&serial===this.projectionSerial)button.disabled=false;}
  }
  async history(){
    const historyVersion=this.historyVersion=(this.historyVersion??0)+1,source=this.source,cutoff=this.cutoff(),select=this.node.querySelector('[data-history]');select.innerHTML='<option value="">Choose a retained calculation</option>';
    if(!source||finiteFaultAvailability(source,source.product,cutoff))return;
    const {records}=await this.api('rupture-stress-history?'+new URLSearchParams({sourceId:source.id,asOf:cutoff.asOf,mode:cutoff.mode}));if(this.source!==source||this.historyVersion!==historyVersion)return;
    select.innerHTML='<option value="">Choose a retained calculation</option>'+records.map(r=>`<option value="${esc(r.id)}">${esc(new Date(r.created_at).toISOString())} · ${r.samples} points · ${r.depthKm} km · receiver ${r.receiver.strike}/${r.receiver.dip}/${r.receiver.rake}°</option>`).join('');if(this.record)select.value=this.record.id;const compare=this.node.querySelector('[data-compare]'),selected=compare.value;compare.innerHTML='<option value="">Show current calculation only</option>'+[...select.options].filter(o=>o.value&&o.value!==this.record?.id).map(o=>o.outerHTML).join('');compare.value=selected;
  }
  async load(id){
    const source=this.source,serial=++this.serial;this.record=null;this.output.hidden=true;this.status.textContent='Opening saved calculation…';
    try{const bundle=await this.api('rupture-stress-export?id='+encodeURIComponent(id));if(serial!==this.serial||source!==this.source)return;
      if(!['recordValid','implementationValid','sourceRecordValid','sourceValid','sourceLinked'].every(k=>bundle.integrity?.[k]===true)||bundle.record.sourceId!==source.id)throw new Error('Saved calculation source or integrity check failed');
      const cutoff=this.cutoff(),reason=finiteFaultAvailability(source,source.product,cutoff);if(reason)throw new Error(reason);if(cutoff.mode==='strict'&&bundle.record.createdAt>cutoff.asOf)throw new Error('This result was unavailable at the strict cutoff');
      this.adopt(bundle.record);await this.history();
    }catch(e){if(serial===this.serial)this.status.textContent=e.message;}
  }
  adopt(record){
    const {grid,report}=stressGrid(record);this.clearComparison();this.record=record;this.grid=grid;this.plotReport=report;const o=record.options,r=o.receiver;
    const values={strike:r.strike,dip:r.dip,rake:r.rake,poisson:o.poisson,shear:o.shearModulusGPa,friction:o.friction,depth:grid.depth,east:grid.east,north:grid.north,extent:grid.extent,resolution:grid.n};
    const resolution=this.form.elements.resolution;if(![...resolution.options].some(p=>Number(p.value)===grid.n)){const option=document.createElement('option');option.value=String(grid.n);option.textContent=`${grid.n} × ${grid.n} (saved)`;resolution.append(option);}
    for(const [key,value]of Object.entries(values))this.form.elements[key].value=String(value);
    this.status.textContent=`Saved ${report.points.length} samples · ${report.excludedCount} masked · ${report.solver} ${report.solverVersion}.`;
    this.node.querySelector('[data-assumptions]').textContent=`Calculated at depth ${grid.depth} km · receiver ${r.strike}/${r.dip}/${r.rake}° · shear modulus ${o.shearModulusGPa} GPa · Poisson ${o.poisson} · friction ${o.friction}.`;
    this.node.querySelector('[data-export]').href='/api/rupture-stress-export?id='+encodeURIComponent(record.id);const sample=this.node.querySelector('[data-sample]');sample.max=String(report.points.length-1);sample.value=String(Math.floor(report.points.length/2));this.sync();this.draw();
  }
  clearComparison(){
    this.compareSerial=(this.compareSerial??0)+1;this.baseline=null;this.difference=null;
    this.node.querySelector('[data-compare]').value='';this.node.querySelector('[data-comparison]').textContent='';this.node.querySelector('[data-baseline]').hidden=true;
  }
  async compare(id){
    this.clearComparison();this.draw();if(!id||!this.record)return;
    const serial=this.compareSerial,current=this.record,source=this.source,revision=this.serial,message=this.node.querySelector('[data-comparison]');message.textContent='Opening baseline…';
    try{
      const bundle=await this.api('rupture-stress-export?id='+encodeURIComponent(id));
      if(serial!==this.compareSerial||revision!==this.serial||current!==this.record||source!==this.source)return;
      if(!['recordValid','implementationValid','sourceRecordValid','sourceValid','sourceLinked'].every(k=>bundle.integrity?.[k]===true))throw new Error('Baseline integrity check failed');
      const c=this.cutoff(),reason=finiteFaultAvailability(source,source.product,c);if(reason)throw new Error(reason);
      if(c.mode==='strict'&&(bundle.record.createdAt>c.asOf||current.createdAt>c.asOf))throw new Error('A comparison result was unavailable at the strict cutoff');
      this.difference=stressDifference(current,bundle.record);this.baseline=bundle.record;this.node.querySelector('[data-compare]').value=id;
      const o=bundle.record.options,r=o.receiver;
      message.textContent=`Showing current minus baseline at identical locations. Baseline receiver ${r.strike}/${r.dip}/${r.rake}° · shear modulus ${o.shearModulusGPa} GPa · Poisson ${o.poisson} · friction ${o.friction} · solver ${bundle.record.report.solver} ${bundle.record.report.solverVersion}. ${this.difference.excludedCount} samples masked in either run. Differences measure sensitivity, not accuracy.`;
      const link=this.node.querySelector('[data-baseline]');link.href='/api/rupture-stress-export?id='+encodeURIComponent(id);link.hidden=false;this.draw();
    }catch(e){if(serial===this.compareSerial&&revision===this.serial)message.textContent=e.message;}
  }
  async calculate(){
    if(!this.form.reportValidity())return;
    const cutoff=this.cutoff(),reason=finiteFaultAvailability(this.source,this.source.product,cutoff);if(reason){this.status.textContent=reason;return;}
    const values=Object.fromEntries([...new FormData(this.form)].map(([k,v])=>[k,Number(v)])),n=values.resolution,points=[];
    for(let row=0;row<n;row++)for(let col=0;col<n;col++)points.push({xKm:values.east-values.extent+2*values.extent*col/(n-1),yKm:values.north+values.extent-2*values.extent*row/(n-1),depthKm:values.depth});
    const serial=++this.serial,source=this.source,button=this.form.querySelector('button');button.disabled=true;this.output.hidden=true;this.status.textContent='Calculating the elastic stress field…';
    try{
      const record=await this.api('rupture-stress-query',{sourceId:source.id,asOf:cutoff.asOf,mode:cutoff.mode,points,receiver:{strike:values.strike,dip:values.dip,rake:values.rake},poisson:values.poisson,shearModulusGPa:values.shear,friction:values.friction});
      if(serial!==this.serial||source!==this.source)return;
      this.adopt(record);await this.history();
    }catch(e){if(serial===this.serial)this.status.textContent=e.message;}finally{button.disabled=false;}
  }
  draw(){
    if(!this.record)return;const limit=Number(this.node.querySelector('[data-limit]').value),plot=this.node.querySelector('[data-plot]');
    if(!Number.isFinite(limit)||limit<=0){plot.replaceChildren();return;}
    const report=this.difference??this.plotReport,{n,east,north,extent}=this.grid,selected=Number(this.node.querySelector('[data-sample]').value),size=440/n;let saturated=0;
    const cells=report.values.map((v,i)=>{let color='#29343e';if(v){if(Math.abs(v.coulombPa)>limit*1e6)saturated++;color=`rgb(${stressColor(v.coulombPa,limit).map(c=>Math.round(c*255)).join(',')})`;}return `<rect data-index="${i}" x="${70+i%n*size}" y="${30+Math.floor(i/n)*size}" width="${size+.1}" height="${size+.1}" fill="${color}"/>`;}).join('');
    plot.innerHTML=`<svg viewBox="0 0 560 530" role="img" aria-label="${this.difference?'Current minus baseline':'Calculated'} Coulomb stress change in MPa. Blue negative, orange positive, pale zero, dark masked. East right, north up. Use the sample slider to inspect exact values."><rect width="560" height="530" fill="#0a1923"/>${cells}<rect x="${70+selected%n*size}" y="${30+Math.floor(selected/n)*size}" width="${size}" height="${size}" fill="none" stroke="white" stroke-width="2" pointer-events="none"/><g fill="#cddfe5" font-family="system-ui" font-size="13"><text x="70" y="494">${esc(east-extent)} km E</text><text x="510" y="494" text-anchor="end">${esc(east+extent)} km E</text><text x="65" y="24">${esc(north+extent)} km N</text><text x="65" y="467" text-anchor="end">${esc(north-extent)}</text><text x="280" y="518" text-anchor="middle">Source-local offsets · samples, no interpolation</text></g></svg>`;
    for(const cell of plot.querySelectorAll('[data-index]'))cell.onclick=()=>{this.node.querySelector('[data-sample]').value=cell.dataset.index;this.draw();};
    this.node.querySelector('[data-scale]').textContent=`${this.difference?'Difference: current minus baseline. ':''}Blue −${limit} MPa · pale 0 · orange +${limit} MPa. ${saturated} samples exceed the color limit; exact values remain available. Dark cells are masked.`;
    const p=report.points[selected],v=report.values[selected],format=x=>(x/1e6).toPrecision(6)+' MPa';
    this.node.querySelector('[data-value]').textContent=`Sample ${selected+1}/${report.points.length} · east ${p.xKm.toFixed(2)} km, north ${p.yKm.toFixed(2)} km, depth ${p.depthKm} km. `+(v?`${this.difference?'Difference (current − baseline): ':''}Coulomb ${format(v.coulombPa)} · shear ${format(v.shearPa)} · unclamping ${format(v.unclampingPa)}.`:'Masked near a source patch; no value shown.');
  }
}
