export async function showDeepContext(event,{earth,getState,selectForecast}){
 if(event.depth<=300||!earth?.geology)return;
 const state=getState(),cutoff=state.asOf,root=document.createElement('section');root.className='deep-context';
 const heading=document.createElement('h3');heading.textContent='Deep-event context';
 const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');status.textContent='Loading published Slab2 reference contours…';
 const note=document.createElement('p');note.className='muted';note.textContent='Slab2 is reference geometry, not proof this earthquake lies within a slab. Linked watches are experimental hypotheses, not measured pressure transfer.';
 root.append(heading,status,note);document.querySelector('#selection').append(root);
 const related=state.analysis?.candidates.filter(f=>f.sources.includes(event.id))??[];
 const label=document.createElement('p');label.textContent=`${related.length} source-linked model watches at ${new Date(cutoff).toISOString()} (before watch-display filters).`;root.append(label);
 for(const f of related){const button=document.createElement('button');button.className='secondary full';button.textContent=`${f.region} · M${f.magnitude.min.toFixed(1)}–${f.magnitude.max.toFixed(1)} · ${f.modelMatch}/100`;button.onclick=()=>selectForecast(f);root.append(button);}
 const current=()=>root.isConnected&&getState().selectedEvent?.id===event.id&&getState().asOf===cutoff;
 try{
  await earth.geology.load();if(!current()){if(root.isConnected)status.textContent="The selected observation or time changed. Reopen the event to load its context.";return;}
  earth.geology.slabsEnabled=true;earth.geology.drawSlabs();earth.geology.updateCaption();
  status.textContent='Published Slab2 contours enabled. Use Layers to change their visibility. Contours are a static reference, including during historical replay.';
 }catch(error){if(current())status.textContent='Slab reference unavailable: '+error.message;}
}
