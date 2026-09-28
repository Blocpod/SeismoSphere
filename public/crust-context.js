export function showCrustContext(event,{api,getState=()=>({live:true,mode:"catalog-replay"})}){
 const root=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');root.className='crust-context';summary.textContent='Crust beneath this location · CRUST1.0';root.append(summary,body);document.querySelector('#selection').append(root);
 let loading=false,loaded=false;
 root.ontoggle=async()=>{
  if(!root.open||loading||loaded)return;loading=true;body.textContent='Loading published crustal column…';
  try{
   const data=await api('crust-sample?'+new URLSearchParams({lat:event.lat,lon:event.lon}));if(!root.isConnected)return;
   body.replaceChildren();const note=document.createElement('p');note.className='muted';note.textContent=`Static one-degree cell average centered at ${data.cell.lat}°, ${data.cell.lon}°. Depths are relative to sea level; negative values are above it. This reference does not establish the earthquake’s local crustal structure, including during replay.`;body.append(note);
   for(const layer of data.layers){const row=document.createElement('details'),title=document.createElement('summary'),info=document.createElement('p');title.textContent=layer.name+(layer.present?'':' · absent (zero thickness)');
    info.textContent=`Top ${layer.topDepthKm.toFixed(2)} km; ${layer.bottomDepthKm===null?'bottom unspecified (mantle)':`bottom ${layer.bottomDepthKm.toFixed(2)} km; thickness ${layer.thicknessKm.toFixed(2)} km`}. Vp ${layer.vpKmPerSecond.toFixed(2)} km/s; Vs ${layer.vsKmPerSecond.toFixed(2)} km/s; density ${layer.densityGramsPerCubicCm.toFixed(2)} g/cm³. Values retained from the source.`;row.append(title,info);body.append(row);
   }
   const source=document.createElement('a');source.href=data.provenance.homepage;source.target='_blank';source.rel='noreferrer';source.textContent=data.provenance.citation;body.append(source);
   const download=document.createElement('a');download.className='secondary';download.href='/api/crust-sample?'+new URLSearchParams({lat:event.lat,lon:event.lon});download.download='crust1-column.json';download.textContent='Download column + provenance';body.append(download);
   const explain=document.createElement('button'),output=document.createElement('p');explain.className='secondary';explain.textContent='Explain this crust column';output.setAttribute('role','status');body.append(explain,output);
   explain.onclick=async()=>{explain.disabled=true;output.textContent='Examining the published crust column…';try{const state=getState(),answer=await api('chat',{message:'Explain this CRUST1.0 column: distinguish source cell from query coordinates, layer thickness from depth, and the static model from earthquake observations.',crustPoint:data.query,crustSha:data.provenance.source.sha256,asOf:state.live?Date.now():state.asOf,mode:state.mode});if(root.isConnected)output.textContent=answer.model+' · '+(answer.grounded?'DETERMINISTIC EVIDENCE':'AI EXPLANATION')+'\n\n'+answer.answer;}catch(error){if(root.isConnected)output.textContent=error.message;}finally{explain.disabled=false;}};
   loaded=true;
  }catch(error){if(root.isConnected)body.textContent='Crust reference unavailable: '+error.message;}finally{loading=false;}
 };
}
