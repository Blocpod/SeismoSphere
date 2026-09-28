const day=n=>Number.isFinite(n)?new Date(n).toISOString().slice(0,10):'unavailable';
export const comparisonAvailable=(r,cutoff,strict,etas=false)=>(etas?(r.holdout?.end??r.fit.options.end):r.end)<=cutoff&&(!strict||r.createdAt<=cutoff);
const value=n=>Number.isFinite(n)?n.toFixed(4):'unavailable';
export function comparisonEvidence(ds,etas){
 const h=etas?.holdout,o=etas?.fit.options,region=etas?.region??etas?.fit.region;
 return {
  policy:'Saved evidence side by side, not a common skill ranking. DS hit fraction and ETAS log likelihood measure different outcomes. Regions, magnitude floors and intervals may differ. These historical results do not establish prospective skill.',
  ds:ds?`Saved DS backtest ${ds.experimentId}
${day(ds.start)} through ${day(ds.end)}
Region: ${ds.targetBounds?JSON.stringify(ds.targetBounds):'No regional bounds retained'}
Catalog floor M${ds.config?.minMagnitude??'unknown'}
${(ds.summary??[]).map(s=>`${s.engine}: ${s.hits}/${s.forecasts} full hits; hit fraction ${value(s.precision)}`).join('\n')}
Original saved results; later assessment reviews may differ.`:'No completed DS backtest available at this cutoff.',
  etas:etas?`Saved ${etas.fit.version}
Run ${etas.id}
Training ${day(o.start)} through ${day(o.end)}
Region: ${region&&Number.isFinite(region.south)?`latitude ${region.south} to ${region.north}°, longitude ${region.west} to ${region.east}°`:`center ${o.lat}°, ${o.lon}°; radius ${o.radiusKm} km`}
Catalog floor M${o.minMagnitude}
${h?`Holdout ${day(h.start)} through ${day(h.end)}; ${h.events} events\nETAS log likelihood: ${value(h.logLikelihood)}\nBits/event vs ${'bitsPerEventVsKDE' in h?'training KDE':'Poisson'}: ${value(h.bitsPerEventVsKDE??h.bitsPerEvent)}\n${h.method??''}`:'No holdout scored.'}`:'No ETAS result available at this cutoff.'
 };
}
export function setupModelComparison({api,getState}){
 const dialog=document.createElement('dialog');dialog.id='model-comparison-dialog';dialog.className='wide-dialog';dialog.innerHTML='<div class="dialog-heading"><div><span class="eyebrow">RETAINED RESEARCH EVIDENCE</span><h2>DS and ETAS comparison</h2></div><button class="icon-btn" aria-label="Close model comparison">×</button></div><p role="status"></p><div class="form-grid"><label>DS backtest<select data-ds></select></label><label>ETAS fit<select data-etas></select></label></div><p data-policy class="muted"></p><div class="research-grid"><section><h3>DS and matched controls</h3><pre data-ds-output style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></section><section><h3>ETAS held-out evidence</h3><pre data-etas-output style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><a data-export class="secondary" hidden download>Export selected ETAS evidence</a></section></div>';
 document.body.append(dialog);const dsSelect=dialog.querySelector('[data-ds]'),etasSelect=dialog.querySelector('[data-etas]'),status=dialog.querySelector('[role=status]');let ds=[],etas=[],serial=0;
 const render=()=>{const a=ds.find(r=>r.experimentId===dsSelect.value),b=etas.find(r=>r.id===etasSelect.value),e=comparisonEvidence(a,b);dialog.querySelector('[data-policy]').textContent=e.policy;dialog.querySelector('[data-ds-output]').textContent=e.ds;dialog.querySelector('[data-etas-output]').textContent=e.etas;const link=dialog.querySelector('[data-export]');link.hidden=!b;if(b)link.href='/api/statistical-export?id='+encodeURIComponent(b.id);else link.removeAttribute('href');};
 dsSelect.onchange=etasSelect.onchange=render;dialog.querySelector('.icon-btn').onclick=()=>{serial++;dialog.close();};
 return {async open(){const ticket=++serial,state=getState(),cutoff=state.live?Date.now():state.asOf,strict=state.mode==='strict';dialog.showModal();status.textContent='Loading saved comparisons…';ds=[];etas=[];dsSelect.replaceChildren();etasSelect.replaceChildren();render();try{const [a,b]=await Promise.all([api('experiments'),api('statistical-runs')]);if(ticket!==serial)return;ds=a.experiments.filter(r=>comparisonAvailable(r,cutoff,strict));etas=b.runs.filter(r=>comparisonAvailable(r,cutoff,strict,true));for(const r of ds)dsSelect.add(new Option(`${day(r.start)} – ${day(r.end)} · ${r.experimentId.slice(0,8)}`,r.experimentId));for(const r of etas)etasSelect.add(new Option(`${r.fit.version.startsWith('rectangular')?'Spatial':'Temporal'} · ${day(r.fit.options.end)} · ${r.id.slice(0,8)}`,r.id));status.textContent=`${ds.length} DS runs · ${etas.length} ETAS runs available at ${new Date(cutoff).toISOString()}. Select the saved runs to inspect. No new forecasts or fits are issued.`;render();}catch(error){if(ticket===serial)status.textContent=error.message;}}};
}
