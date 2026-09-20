const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=t=>new Date(t).toISOString().slice(0,10);
export function setupStatisticalLab(api){
  const section=document.createElement('section');section.className='statistical-lab';
  section.innerHTML=`<div><span class="eyebrow">FITTED STATISTICAL COMPARISON</span><h3>Regional temporal ETAS</h3><p class="muted">Fit earthquake clustering through time within a fixed region. Holdout events are withheld from parameter fitting. The selected research catalog supplies every model input.</p></div>
  <form id="etas-form" class="form-grid">
    <label>Training starts (UTC)<input name="start" type="date" value="2011-02-15" required></label>
    <label>Training ends (UTC)<input name="end" type="date" value="2011-03-10" required></label>
    <label>Holdout ends (UTC)<input name="holdoutEnd" type="date" value="2011-03-20" required></label>
    <label>Conditioning history (days)<input name="historyDays" type="number" min="1" max="90" value="5" required></label>
    <label>Center latitude<input name="lat" type="number" min="-90" max="90" step="0.1" value="38" required></label>
    <label>Center longitude<input name="lon" type="number" min="-180" max="180" step="0.1" value="142" required></label>
    <label>Region radius (km)<input name="radiusKm" type="number" min="50" max="5000" value="1200" required></label>
    <label>Assumed completeness M<input name="minMagnitude" type="number" min="0" max="8" step="0.1" value="4.5" required></label>
    <button class="primary full" type="submit">Fit ETAS + score holdout →</button>
  </form><div id="etas-result" aria-live="polite"><p class="muted">A saved fit includes the likelihood, optimizer diagnostics, exact catalog snapshots, and holdout score.</p></div>`;
  document.querySelector('.research-notes').before(section);
  const result=document.querySelector('#etas-result'),form=document.querySelector('#etas-form');
  function render(r){
    const m=r.fit,p=m.parameters,h=r.holdout,points=r.projection.points,max=Math.max(.01,...points.map(p=>p.rate))*1.1;
    const line=points.map((p,i)=>`${i?'L':'M'}${50+i*5.4},${165-p.rate/max*130}`).join(' ');
    result.innerHTML=`<div class="etas-metrics"><div><strong>${m.training.events}</strong><span>training earthquakes</span></div><div><strong>${p.n.toFixed(3)}</strong><span>fitted branching ratio</span></div><div><strong>${h?.bitsPerEvent?.toFixed(3)??'—'}</strong><span>holdout bits/event vs Poisson</span></div></div>
    <p class="muted">${esc(m.options.provider)} · ${date(m.options.start)}–${date(m.options.end)} · M ≥ ${m.options.minMagnitude}<br>${m.options.lat}°, ${m.options.lon}° · ${m.options.radiusKm} km radius · ${m.training.conditioningEvents} conditioning events</p>
    <svg class="etas-chart" viewBox="0 0 640 205" role="img" aria-label="Conditional daily earthquake rate after the training cutoff, excluding future parents">
      <path d="M50 25V165H590" fill="none" stroke="#354b58"/><path d="${line}" fill="none" stroke="#91ddc9" stroke-width="3"/>
      <text x="50" y="18">${max.toFixed(1)} events/day</text><text x="50" y="189">${date(points[0].time)}</text><text x="590" y="189" text-anchor="end">${date(points.at(-1).time)}</text>
    </svg><p class="muted">${esc(r.projection.method)}</p>
    <details class="evidence" open><summary>Fit and holdout diagnostics</summary><p>
    Optimizer: ${m.fit.optimizerConverged?'converged':'did not meet convergence tolerance'} · ${m.fit.evaluations} evaluations across three starts.<br>
    ${m.fit.boundaryParameters.length?'Boundary estimates: '+esc(m.fit.boundaryParameters.join(', '))+'. Interpret cautiously.<br>':''}
    μ = ${p.mu.toFixed(5)} / day · A = ${p.A.toFixed(5)} · α = ${p.alpha.toFixed(4)} · c = ${p.c.toFixed(5)} days · p = ${p.p.toFixed(4)}<br>
    Training log likelihood: ${m.fit.logLikelihood.toFixed(2)} · constant-rate comparator: ${m.fit.poissonLogLikelihood.toFixed(2)}.<br>
    ${h?`${h.events} holdout earthquakes · ${date(h.start)}–${date(h.end)}<br>Holdout log likelihood: ${h.logLikelihood.toFixed(2)} · comparator: ${h.poissonLogLikelihood.toFixed(2)}.<br>${esc(h.method)}`:'No holdout scored.'}
    </p></details><details class="evidence"><summary>Assumptions and evidence</summary><p>${m.limitations.map(esc).join('<br><br>')}</p><p>Saved run ${esc(r.id)}<br>Training snapshot ${esc(r.trainingSnapshotId)}</p><p><a href="https://doi.org/10.1029/2006JB004697" target="_blank" rel="noreferrer">Ogata: temporal ETAS formulation ↗</a></p></details>
    <a class="secondary" href="/api/statistical-export?id=${encodeURIComponent(r.id)}" download>Export fit + catalog snapshots ↓</a>`;
  }
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;result.textContent='Fitting three starting points in a background worker. Earth controls remain available…';try{render(await api('etas-fit',Object.fromEntries(new FormData(form))));}catch(err){result.textContent=err.message;}finally{button.disabled=false;}};
  api('statistical-runs?family=temporal').then(r=>{if(r.runs[0])render(r.runs[0]);}).catch(()=>{});
  document.querySelector('#settings-form .form-grid').insertAdjacentHTML('afterend','<label class="catalog-setting">Research catalog<select name="catalogProvider"><option value="USGS">USGS · live and historical</option><option value="EMSC">EMSC · imported history</option></select><small>One provider per run prevents unassociated duplicate reports from inflating evidence.</small></label>');
}
