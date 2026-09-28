import {unit,EARTH_KM} from './fault-geometry.js';
export function radialSpacing(source,events,{spacingKm=1000,ringCount=4,tolerance=.15,asOf}={}){
 if(!source||!Number.isFinite(asOf)||source.time>asOf||!Number.isFinite(spacingKm)||spacingKm<100||spacingKm>3000||!Number.isInteger(ringCount)||ringCount<1||ringCount>6||spacingKm*ringCount>10000||!Number.isFinite(tolerance)||tolerance<.01||tolerance>.25)throw new Error('Use 100–3000 km spacing, 1–6 rings within 10,000 km, and 1–25% tolerance.');
 const center=unit(source),rings=Array.from({length:ringCount},(_,i)=>({ordinal:i+1,radiusKm:(i+1)*spacingKm,halfWidthKm:spacingKm*tolerance,matches:[]}));
 const eligible=events.filter(e=>e.id!==source.id&&e.time>source.time&&e.time<=asOf&&e.status!=='deleted'&&e.type==='earthquake'&&e.provider===source.provider);
 for(const event of eligible){const p=unit(event),distanceKm=EARTH_KM*Math.acos(Math.max(-1,Math.min(1,center.reduce((sum,v,i)=>sum+v*p[i],0)))),ordinal=Math.round(distanceKm/spacingKm),ring=rings[ordinal-1];if(ring&&Math.abs(distanceKm-ring.radiusKm)<=ring.halfWidthKm)ring.matches.push({event,distanceKm,offsetKm:distanceKm-ring.radiusKm});}
 return {version:'radial-spacing-1',source,asOf,spacingKm,ringCount,tolerance,rings,eligibleEvents:eligible,matchedEvents:rings.reduce((n,r)=>n+r.matches.length,0),method:'Spherical epicentral distance from the selected source. Later displayed events only; each matches the nearest spacing multiple within a band of ±tolerance × spacing. No direction or depth constraint.',limitations:['Exploratory geometry; not measured pressure or a propagating wave.','Counts depend on displayed time, magnitude and search filters and nonuniform catalog detection.','No chance expectation, significance, causal relationship or forecast is inferred.']};
}


export function discoverRadialSpacing(events,{asOf,triggerDepth=300}={}){
 if(!Number.isFinite(asOf)||!Number.isFinite(triggerDepth))throw new Error('A finite cutoff and trigger depth are required.');
 const inputEvents=events.filter(e=>e.type==='earthquake'&&e.status!=='deleted'&&e.time<=asOf);
 const sources=inputEvents.filter(e=>e.depth>triggerDepth).sort((a,b)=>b.mag-a.mag||a.id.localeCompare(b.id)).slice(0,24),matches=[];
 for(const source of sources){let best=null;
  for(let spacingKm=250;spacingKm<=2500;spacingKm+=250){
   const report=radialSpacing(source,events,{asOf,spacingKm,ringCount:Math.min(6,Math.floor(10000/spacingKm)),tolerance:.15}),occupiedRings=report.rings.filter(r=>r.matches.length).length;
   if(occupiedRings<3)continue;
   const error=report.rings.flatMap(r=>r.matches).reduce((sum,m)=>sum+Math.abs(m.offsetKm)/spacingKm,0)/report.matchedEvents;
   const candidate={source,spacingKm,ringCount:report.ringCount,tolerance:report.tolerance,occupiedRings,matchedEvents:report.matchedEvents,meanRelativeOffset:error};
   if(!best||occupiedRings>best.occupiedRings||occupiedRings===best.occupiedRings&&(candidate.matchedEvents>best.matchedEvents||candidate.matchedEvents===best.matchedEvents&&error<best.meanRelativeOffset))best=candidate;
  }
  if(best)matches.push(best);
 }
 return {version:'radial-discovery-1',inputEvents,asOf,triggerDepth,testedSourceIds:sources.map(e=>e.id),testedSources:sources.length,testedSpacings:10,results:matches.sort((a,b)=>b.occupiedRings-a.occupiedRings||b.matchedEvents-a.matchedEvents||a.meanRelativeOffset-b.meanRelativeOffset||a.source.id.localeCompare(b.source.id)),method:'Strongest 24 displayed earthquakes deeper than the configured trigger; ten spacings from 250–2500 km; 15% bands, up to six rings within 10,000 km. At least three occupied rings. Best spacing per source ranks occupied rings, matches, then mean normalized offset.',limitations:'Exploratory multiple search on displayed events, not independent validation. No chance correction, directional propagation, causal mechanism or forecast confidence is established.'};
}
