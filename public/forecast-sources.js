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
