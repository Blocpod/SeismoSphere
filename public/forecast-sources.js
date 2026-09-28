const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const utc=value=>Number.isFinite(value)?new Date(value).toISOString():'Not retained';
export function forecastSources(forecast){
 const ids=[...new Set(forecast.sources??[])],events=forecast.sourceEvents??[];
 if(!ids.length)return '<p class="muted">No individual source earthquakes are identified for this control.</p>';
 return '<h3>Source observations</h3><p class="muted">Retained inputs for this watch. Later catalog revisions may differ. Expand a source to inspect its original values.</p>'+ids.map(id=>{
  const e=events.find(event=>event.id===id);if(!e)return `<details class="evidence"><summary>${esc(id)}</summary><p>Source identifier retained; individual observation values are unavailable in this record.</p></details>`;
  const url=typeof e.url==='string'&&/^https:\/\/earthquake\.usgs\.gov\//.test(e.url)?`<a class="secondary" href="${esc(e.url)}" target="_blank" rel="noreferrer">Current USGS record ↗</a>`:'';
  return `<details class="evidence forecast-source"><summary>M${esc(e.mag)} · ${esc(e.depth)} km · ${esc(e.place??id)}</summary><p><strong>Retained catalog observation</strong><br>${esc(e.provider??'Provider not retained')} · ${esc(id)}<br>Origin: ${esc(utc(e.time))}<br>Latitude ${esc(e.lat)}° · longitude ${esc(e.lon)}°<br>Magnitude ${esc(e.mag)} ${esc(e.magType??'')} · depth ${esc(e.depth)} km<br>Received here: ${esc(utc(e.observedAt))}</p>${url}</details>`;
 }).join('');
}

export function forecastRoutes(forecast){
 if(['Null','Recent-rate'].includes(forecast.engine))return '<p class="muted">Matched control: magnitude, radius and time envelope are inherited from a model candidate; the control changes the center. It does not use a Dutchsinse pressure route. Any inherited route fields in a legacy record remain in its raw evidence, not as control reasoning.</p>';
 const ids=[...new Set(forecast.routeIds??(forecast.routeId?[forecast.routeId]:[]))],path=forecast.path??[];
 if(!ids.length&&!path.length)return '';
 const routes=ids.map(id=>{
  const p=forecast.routeProvenance?.find(p=>p.id===id);let link='';
  try{const url=new URL(p?.sourceUrl);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)link=`<a class="secondary" href="${esc(url.href)}" target="_blank" rel="noreferrer">Route source reference ↗</a>`;}catch{}
  return `<li><strong>${esc(id)}</strong><p>${p?'Retained provenance label: '+esc(p.status):'Route provenance not retained.'}${p?.locator?'<br>Source location: '+esc(p.locator):''}${p?.notes?'<br>'+esc(p.notes):''}</p>${link}</li>`;
 }).join('');
 const vertices=path.map((p,i)=>`<li>Vertex ${i+1}: ${esc(p.lat)}° latitude, ${esc(p.lon)}° longitude</li>`).join('');
 return `<details class="evidence forecast-route"><summary>Route ancestry and ordered path · ${ids.length} ${ids.length===1?"route":"routes"} / ${path.length} vertices</summary><p>Retained model geometry, not a measured pressure-transfer path. Source-traced labels describe entered provenance; they are not independent validation.</p>${ids.length?'<ol>'+routes+'</ol>':'<p>No configured route is identified for this candidate geometry.</p>'}${path.length?'<h4>Candidate path in stored order</h4><ol>'+vertices+'</ol>':''}</details>`;
}
