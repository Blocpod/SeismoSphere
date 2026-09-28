import {analogueEvents} from './catalog.mjs';
import {DAY,distance} from './geo.mjs';

// Deterministic, rotation-independent geometry matching for magnitude Mode D.
// Outcomes are read only after configuration selection has finished.
export function configurationAnalogues(source,events,asOf,radiusKm=400,windowDays=10){
  const all=analogueEvents(source,events,asOf).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
  function lower(time){let lo=0,hi=all.length;while(lo<hi){const mid=(lo+hi)>>>1;if(all[mid].time<time)lo=mid+1;else hi=mid;}return lo;}
  const between=(start,end)=>all.slice(lower(start),lower(end+1));
  function graph(anchor,cutoff){
    const peers=between(cutoff-10*DAY,cutoff).filter(e=>e.id!==anchor.id&&distance(anchor,e)<=3500).sort((a,b)=>b.mag-a.mag||b.time-a.time||a.id.localeCompare(b.id)).slice(0,7);
    const nodes=[anchor,...peers];
    return {cutoff,nodes:nodes.map(e=>({id:e.id,mag:e.mag,depth:e.depth,ageDays:(cutoff-e.time)/DAY})),edges:nodes.flatMap((a,i)=>nodes.slice(i+1).map((b,j)=>({from:i,to:i+j+1,km:distance(a,b)})))};
  }
  function difference(a,b){
    if(a.nodes.length!==b.nodes.length||a.nodes.length<2)return null;
    const terms=[];
    for(let i=0;i<a.nodes.length;i++){terms.push(Math.abs(a.nodes[i].mag-b.nodes[i].mag),Math.abs(a.nodes[i].depth-b.nodes[i].depth)/100,Math.abs(a.nodes[i].ageDays-b.nodes[i].ageDays)/10);}
    for(let i=0;i<a.edges.length;i++)terms.push(Math.abs(a.edges[i].km-b.edges[i].km)/Math.max(100,a.edges[i].km,b.edges[i].km));
    // Each feature must match, so unrelated geometry cannot be hidden by averaging.
    return terms.every(v=>v<=.6)?terms.reduce((sum,v)=>sum+v,0)/terms.length:null;
  }
  const query=graph(source,asOf),age=asOf-source.time;
  const eligible=all.filter(e=>e.time<asOf-30*DAY&&e.time+age+windowDays*DAY<asOf&&Math.abs(e.mag-source.mag)<.6&&Math.abs(e.depth-source.depth)<100);
  // ponytail: bounded 400-source shortlist; expose the cap rather than claiming exhaustive graph search.
  const shortlist=eligible.sort((a,b)=>(Math.abs(a.mag-source.mag)+Math.abs(a.depth-source.depth)/100)-(Math.abs(b.mag-source.mag)+Math.abs(b.depth-source.depth)/100)||b.time-a.time||a.id.localeCompare(b.id)).slice(0,400);
  const selected=query.nodes.length<2?[]:shortlist.map(e=>{const configuration=graph(e,e.time+age);return {source:e,configuration,difference:difference(query,configuration)};}).filter(a=>a.difference!==null).sort((a,b)=>a.difference-b.difference||b.source.time-a.source.time||a.source.id.localeCompare(b.source.id)).slice(0,100);
  const matches=selected.map(a=>{
    const outcomes=between(a.configuration.cutoff+1,a.configuration.cutoff+windowDays*DAY).filter(e=>distance(a.source,e)<=radiusKm&&e.mag>=source.mag-1);
    return {...a,subsequentCount:outcomes.length,largest:outcomes.length?Math.max(...outcomes.map(e=>e.mag)):null,outcomes:outcomes.map(e=>({id:e.id,time:e.time,mag:e.mag}))};
  });
  return {method:'relative-configuration-1',query,eligibleCount:eligible.length,searched:query.nodes.length<2?0:shortlist.length,shortlistLimit:400,matchLimit:100,maximumFeatureDifference:.6,contextDays:10,contextRadiusKm:3500,maximumPeers:7,conditioning:'Strongest seven neighboring events at the analysis cutoff; magnitude, depth, relative age and all pair distances. Historical cutoffs preserve source age. Uncalibrated deterministic similarity; rotation-independent, no route or boundary matching. Outcomes are subsequent source-local events at least query-source magnitude minus 1, not mapped target outcomes. Empty windows remain in evidence but are excluded from the magnitude median.',matches};
}
