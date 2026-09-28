import {routeWalks,oriented} from './routes.mjs';
import {distance,midpoint,pathMidpoint,equivalentMagnitude,moment,DAY,clamp,seeded,destination} from './geo.mjs';
import {hash} from './store.mjs';
export const VERSION='ds-research-0.3.0';
export function validateConfig(c){
  if(c.catalogProvider!==undefined&&!['USGS','EMSC'].includes(c.catalogProvider))throw new Error('Choose one research catalog: USGS or EMSC');
  const limits={triggerDepth:[0,700],minMagnitude:[0,9],lookbackDays:[1,90],windowDays:[7,10],radiusKm:[50,1000],magnitudeTolerance:[0.1,2],deepEscalation:[0,2],maxTargets:[1,40]};
  for(const [k,[lo,hi]] of Object.entries(limits))if(!Number.isFinite(c[k])||c[k]<lo||c[k]>hi)throw new Error(`${k} must be ${lo}–${hi}`);
  if(!['adjacent','escalation','moment','analogue'].includes(c.magnitudeMode))throw new Error('Unknown magnitude mode');
  if(!c.rules||['deep','midpoint','silence','spacing','routes','reflection'].some(k=>typeof c.rules[k]!=='boolean'))throw new Error('Invalid rule configuration');
  if(c.rules.swarm!==undefined&&typeof c.rules.swarm!=='boolean')throw new Error('Invalid swarm rule');
  if(!['ollama','codex','deterministic'].includes(c.aiProvider))throw new Error('Invalid AI provider');
  if(typeof c.localModel!=='string'||c.localModel.length>120||c.codexModel!=='gpt-6-astra')throw new Error('Invalid model configuration');
  if(typeof c.autoForecast!=='boolean')throw new Error('Invalid automatic forecast setting');
  return c;
}
function nearestBoundary(p,boundaryPoints){let best=Infinity;for(const b of boundaryPoints)best=Math.min(best,distance(p,b));return Number.isFinite(best)?best:null;}
export function swarms(events){
  const bins=new Map();for(const e of events){const key=`${Math.floor(e.lat/2)}:${Math.floor(e.lon/2)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(e);}
  return [...bins.values()].filter(a=>a.length>=5).map(a=>({center:{lat:a.reduce((s,e)=>s+e.lat,0)/a.length,lon:a.reduce((s,e)=>s+e.lon,0)/a.length},count:a.length,maxMagnitude:Math.max(...a.map(e=>e.mag)),moment:a.reduce((s,e)=>s+moment(e.mag),0),equivalentMagnitude:equivalentMagnitude(a.map(e=>e.mag)),eventIds:a.map(e=>e.id),method:'2-degree geographic bins; descriptive clusters, not a fitted swarm detector'})).sort((a,b)=>b.count-a.count).slice(0,20);
}
export function analogues(source,all,asOf,radius=400,windowDays=10){
  // Every analogue and its complete outcome window must precede the analysis cutoff.
  const old=all.filter(e=>e.time<asOf-30*DAY&&e.time+windowDays*DAY<asOf&&Math.abs(e.mag-source.mag)<0.6&&Math.abs(e.depth-source.depth)<100);
  return old.map(e=>{
    const future=all.filter(f=>f.time>e.time&&f.time<=e.time+windowDays*DAY&&f.time<=asOf&&distance(e,f)<=radius&&f.mag>=source.mag-1);
    return {source:e,similarity:Math.round(100*(1-clamp(Math.abs(e.mag-source.mag)/2+Math.abs(e.depth-source.depth)/400,0,1))),subsequentCount:future.length,largest:future.length?Math.max(...future.map(f=>f.mag)):null};
  }).sort((a,b)=>b.similarity-a.similarity).slice(0,100);
}
export function generate(all,asOf,config,routeConfig,boundaryPoints=[]){
  const visible=all.filter(e=>e.time<=asOf&&e.type==='earthquake'&&e.status!=='deleted'&&(!e.provider||e.provider===(config.catalogProvider??'USGS')));
  const recent=visible.filter(e=>e.time>=asOf-config.lookbackDays*DAY);
  const significant=recent.filter(e=>e.mag>=config.minMagnitude).sort((a,b)=>b.mag-a.mag||a.id.localeCompare(b.id)).slice(0,180);
  const deep=significant.filter(e=>e.depth>config.triggerDepth);
  const candidates=[];const priorCache=new Map();
  function add(center,sources,kind,path=[],route=null,routeIds=[]){
    const local=recent.filter(e=>distance(e,center)<=config.radiusKm);
    const maxLocal=local.length?Math.max(...local.map(e=>e.mag)):null;
    const flank=Math.max(...sources.map(e=>e.mag));
    const boundaryKm=nearestBoundary(center,boundaryPoints);
    const deepSource=sources.find(e=>e.depth>config.triggerDepth);
    if(!priorCache.has(sources[0].id)){const source=sources[0];priorCache.set(source.id,config.magnitudeMode==='analogue'?analogues(source,visible,asOf,config.radiusKm,config.windowDays):visible.filter(e=>e.time<asOf-30*DAY&&e.time+config.windowDays*DAY<asOf&&Math.abs(e.mag-source.mag)<0.6&&Math.abs(e.depth-source.depth)<100).slice(0,100));}
    const prior=priorCache.get(sources[0].id);
    const factors=[];
    const factor=(rule,points,detail,evidence=[])=>factors.push({rule,points,detail,evidence});
    factor('Source activity',15,`${sources.length} observed source event(s), strongest M${flank.toFixed(1)}`,sources.map(e=>e.id));
    if(config.rules.deep&&deepSource)factor('Deep trigger',20,`${deepSource.depth.toFixed(0)} km exceeds configured ${config.triggerDepth} km trigger`,[deepSource.id]);
    if(kind.includes('midpoint'))factor('Geodesic fulcrum',18,'Great-circle midpoint of two recent significant events; geometric relationship is not proof of transfer',sources.map(e=>e.id));
    if(route)factor('Configured corridor',12,`${route.name}; ${route.provenance?.status??'illustrative'} geometry, physical transfer unvalidated`,[route.id]);
    if(route?.kind==='craton-edge')factor('Configured craton-edge progression',6,'Follows this explicitly entered craton-edge hypothesis; the geological reference layer does not create routes',[route.id]);
    if(kind==='swarm-redistribution')factor('Swarm redistribution',6,`${sources.length} clustered catalog sources feed the configured path; no measured energy conservation or transfer`,sources.map(e=>e.id));
    if(kind==='equidistant-progression')factor('Along-route spacing',6,'Configured waypoint lies within 15% of the observed source spacing along the entered path',sources.map(e=>e.id));
    if(kind==='reflection')factor('Configured termination',6,'The directed walk reached an explicit termination and reverses along that same path',[route?.id]);
    if(config.rules.silence)factor('Local release contrast',maxLocal===null||maxLocal<flank-1?12:-10,maxLocal===null?'No catalog events inside this radius during the lookback; coverage is not uniform':`Largest local event M${maxLocal.toFixed(1)} versus source M${flank.toFixed(1)}`,local.slice(0,10).map(e=>e.id));
    if(boundaryKm!==null)factor('Boundary proximity',boundaryKm<100?10:boundaryKm<300?5:0,`Approximately ${boundaryKm.toFixed(0)} km to sampled PB2002 boundary vertices; not a fault-distance measurement`);
    if(config.rules.spacing&&sources.length===2){const other=significant.filter(e=>!sources.includes(e));const d=distance(sources[0],sources[1]);const matched=other.filter(e=>Math.abs(distance(e,sources[0])-d)/d<0.15);if(matched.length)factor('Repeated spacing',6,`${matched.length} other event(s) within 15% of endpoint spacing; exploratory search without multiple-testing correction`,matched.slice(0,5).map(e=>e.id));}
    factor('Recency',Math.round(8*Math.exp(-(asOf-Math.max(...sources.map(e=>e.time)))/(5*DAY))),'Exponentially decayed source recency');
    let central=flank;
    let magnitudeExplanation='Largest adjacent source magnitude';
    if(config.magnitudeMode==='moment'){central=equivalentMagnitude(sources.map(e=>e.mag));magnitudeExplanation='Mw-equivalent source moment sum (10^(1.5 M + 9.1)); heterogeneous catalog magnitude scales are an approximation, not a measured energy transfer';}
    if(config.magnitudeMode==='escalation'&&deepSource){central=deepSource.mag+config.deepEscalation;magnitudeExplanation=`Deep-source magnitude + configurable ${config.deepEscalation}; uncalibrated escalation hypothesis`;}
    if(config.magnitudeMode==='analogue'){const outcomes=prior.map(a=>a.largest).filter(Number.isFinite).sort((a,b)=>a-b);if(outcomes.length>=5){central=outcomes[Math.floor(outcomes.length/2)];magnitudeExplanation=`Median largest local follow-up in ${outcomes.length} historical source analogues; descriptive, selection-biased`;}else magnitudeExplanation='Insufficient historical analogues: explicit fallback to adjacent source magnitude';}
    central=clamp(central,0,9.5);
    const objections=['This research ruleset is uncalibrated; model match is not earthquake probability.','Midpoint and corridor patterns can arise by chance or ordinary aftershock clustering.','Route provenance is recorded per corridor; source tracing does not validate pressure transfer or predictive skill.'];
    if(maxLocal!==null&&maxLocal>=flank-1)objections.push(`Recent M${maxLocal.toFixed(1)} activity already occurred inside the target.`);
    if(prior.length<20)objections.push(`Only ${prior.length} completed source analogues in the imported catalog; no reliable calibration.`);
    if(sources.some(e=>!['mw','mww','mwc','mwb','mwr'].includes(e.magType)))objections.push('Source magnitudes include non-Mw or unspecified scales; the moment conversion is approximate.');
    const match=clamp(factors.reduce((s,f)=>s+f.points,0),0,100);
    candidates.push({key:hash({center,sources:sources.map(e=>e.id),kind,config,asOf,routeVersion:routeConfig.version,routeIds}).slice(0,16),engine:'DS',engineVersion:VERSION,kind,center,radiusKm:config.radiusKm,region:route?.name??`Fulcrum near ${center.lat.toFixed(1)}°, ${center.lon.toFixed(1)}°`,sources:sources.map(e=>e.id),sourceEvents:sources,path,routeId:route?.id??null,routeIds,routeProvenance:route?routeIds.map(id=>({id,...routeConfig.routes.find(r=>r.id===id)?.provenance})):[],modelMatch:match,magnitude:{central:+central.toFixed(2),min:+Math.max(0,central-config.magnitudeTolerance).toFixed(2),max:+Math.min(10,central+config.magnitudeTolerance).toFixed(2),mode:config.magnitudeMode,explanation:magnitudeExplanation},validFrom:asOf,validUntil:asOf+config.windowDays*DAY,asOf,factors,objections,analogueCount:prior.length,boundaryKm,status:'DRAFT',label:'Experimental Dutchsinse-style model hypothesis'});
  }
  if(config.rules.midpoint)for(let i=0;i<significant.length;i++)for(let j=i+1;j<significant.length;j++){
    const a=significant[i],b=significant[j],d=distance(a,b);
    if(d<500||d>3500||Math.abs(a.time-b.time)>7*DAY)continue;
    const m=midpoint(a,b);add(m,[a,b],'midpoint',[a,m,b]);
  }
  if(config.rules.routes){
    if(config.rules.deep)for(const e of deep.slice(0,24))for(const w of routeWalks(routeConfig,e,{reflection:config.rules.reflection}))add(w.center,[e],w.reflected?'reflection':w.route.kind==='craton-edge'?'craton-progression':'deep-cascade',w.path,w.route,w.routeIds);
    for(const route of routeConfig.routes){
      const points=oriented(route),anchors=significant.map(e=>{let index=0;for(let i=1;i<points.length;i++)if(distance(e,points[i])<distance(e,points[index]))index=i;return {e,index};}).filter(a=>distance(a.e,points[a.index])<=(routeConfig.captureKm??1400)).slice(0,8);
      for(let i=0;i<anchors.length;i++)for(let j=i+1;j<anchors.length;j++){
        const a=anchors[i],b=anchors[j];if(a.index===b.index||Math.abs(a.e.time-b.e.time)>7*DAY)continue;
        const left=a.index<b.index?a:b,right=left===a?b:a,path=points.slice(left.index,right.index+1);
        if(config.rules.midpoint)add(pathMidpoint(path),[left.e,right.e],'path-midpoint',path,route,[route.id]);
        if(config.rules.spacing&&right.e.time>left.e.time){const spacing=path.slice(1).reduce((s,p,k)=>s+distance(path[k],p),0);let onward=0;for(let k=right.index+1;k<points.length;k++){onward+=distance(points[k-1],points[k]);if(Math.abs(onward-spacing)/spacing<=.15)add(points[k],[left.e,right.e],'equidistant-progression',points.slice(left.index,k+1),route,[route.id]);if(onward>spacing*1.15)break;}}
      }
    }
    if(config.rules.swarm!==false)for(const swarm of swarms(recent).slice(0,8)){const ids=new Set(swarm.eventIds),sources=recent.filter(e=>ids.has(e.id)).sort((a,b)=>b.mag-a.mag||a.id.localeCompare(b.id)).slice(0,30);if(sources[0]?.mag<config.minMagnitude)continue;for(const w of routeWalks(routeConfig,swarm.center,{reflection:false}))add(w.center,sources,'swarm-redistribution',w.path,w.route,w.routeIds);}
  }
  const ranked=candidates.sort((a,b)=>b.modelMatch-a.modelMatch||a.key.localeCompare(b.key));const result=[];
  for(const c of ranked){if(result.every(r=>distance(r.center,c.center)>config.radiusKm*0.65))result.push(c);if(result.length>=config.maxTargets)break;}
  result.forEach(c=>c.catalogProvider=config.catalogProvider??'USGS');
  return {asOf,engineVersion:VERSION,config,routeVersion:routeConfig.version,routeStatus:routeConfig.status,candidates:result,deepEvents:deep,stats:{catalogEvents:visible.length,recentEvents:recent.length,significantEvents:significant.length,deepTriggers:deep.length,evaluatedCandidates:candidates.length},swarms:swarms(recent),limitations:['Pair search uses the strongest 180 events per window.','Geodesic geometry does not establish physical pressure transfer.','Only the selected provider supplies model input; unassociated reports from other catalogs are excluded.','Route anchoring uses explicit waypoints, not automatic geological routing; at most 24 deep sources and 64 walks per source are tested.', 'Swarm redistribution uses descriptive two-degree bins, at most eight clusters and 30 strongest sources; it is not a fitted swarm detector.', 'DS scores remain separate from temporal/spatial ETAS, the learned cell-graph count model and GEM/Slab2 reference views. Entered craton-edge routes remain hypotheses; event-graph discovery and calibrated model combination remain separate.']};
}
export function baselines(analysis,all,seed=42){
  const rng=seeded(seed);const recent=all.filter(e=>e.time<=analysis.asOf&&e.time>=analysis.asOf-analysis.config.lookbackDays*DAY&&e.mag>=analysis.config.minMagnitude&&e.status!=='deleted'&&e.type==='earthquake'&&(!e.provider||e.provider===(analysis.config.catalogProvider??'USGS')));
  const choices=recent.length?recent:[{lat:0,lon:0}];
  return analysis.candidates.flatMap((c,i)=>{
    const common={...c,factors:[],objections:['Baseline hypothesis, uncalibrated'],modelMatch:null,sourceEvents:[],sources:[],path:[]};
    const base=choices[Math.floor(rng()*choices.length)];
    const nullCenter={lat:Math.asin(2*rng()-1)*180/Math.PI,lon:360*rng()-180};
    return [{...common,key:`null-${c.key}`,engine:'Null',region:'Uniform-area null control',center:nullCenter,kind:'uniform-null'}, {...common,key:`rate-${c.key}`,engine:'Recent-rate',region:'Recent-activity empirical control',center:{lat:base.lat,lon:base.lon},sources:base.id?[base.id]:[],kind:'empirical-rate'}];
  });
}
export function scoreForecast(f,events,asOf,coverage=true){
  if(asOf<f.validUntil)return null;
  if(!coverage)return {status:'AMBIGUOUS',reason:'Outcome catalog coverage is incomplete',evaluatedAt:asOf};
  const sourceIds=new Set([...(f.sources??[]),...(f.sourceEvents??[]).flatMap(e=>e.aliases??[])]);
  const eligible=events.filter(e=>e.type==='earthquake'&&e.status!=='deleted'&&(!e.provider||e.provider===(f.catalogProvider??f.config?.catalogProvider??'USGS'))&&e.time>=f.validFrom&&e.time<=f.validUntil&&![e.id,...e.aliases??[]].some(id=>sourceIds.has(id)));
  const matches=eligible.map(e=>({event:e,spatialErrorKm:distance(f.center,e),magnitudeError:Math.abs(e.mag-f.magnitude.central),timingDays:(e.time-f.validFrom)/DAY}));
  const hit=matches.filter(m=>m.spatialErrorKm<=f.radiusKm&&m.event.mag>=f.magnitude.min&&m.event.mag<=f.magnitude.max).sort((a,b)=>a.spatialErrorKm-b.spatialErrorKm)[0];
  if(hit)return {status:'HIT',...hit,evaluatedAt:asOf};
  const partial=matches.filter(m=>m.spatialErrorKm<=f.radiusKm&&m.event.mag>=f.magnitude.min-0.5&&m.event.mag<=f.magnitude.max+0.5).sort((a,b)=>a.magnitudeError-b.magnitudeError)[0];
  return partial?{status:'PARTIAL HIT',...partial,reason:'Inside space/time; within 0.5 magnitude of forecast envelope',evaluatedAt:asOf}:{status:'MISS',evaluatedAt:asOf,reason:'No event met the frozen space/time/magnitude criteria'};
}
export function leaderboard(ledger){
  return ['DS','Recent-rate','Null'].map(engine=>{const all=ledger.filter(f=>f.engine===engine&&f.mode==='prospective');const resolved=all.filter(f=>f.resolution&&f.resolution.status!=='AMBIGUOUS');const hits=resolved.filter(f=>f.resolution.status==='HIT');return {engine,issued:all.length,resolved:resolved.length,hits:hits.length,partial:resolved.filter(f=>f.resolution.status==='PARTIAL HIT').length,misses:resolved.filter(f=>f.resolution.status==='MISS').length,precision:resolved.length?hits.length/resolved.length:null,meanSpatialErrorKm:hits.length?hits.reduce((s,f)=>s+f.resolution.spatialErrorKm,0)/hits.length:null};});
}
export function backtest(all,start,end,config,routes,boundaries,stepDays=5){
  if(end-start>90*DAY||start>=end||stepDays<1)throw new Error('Backtest must span 1–90 days');
  const trials=[];
  for(let t=start;t+config.windowDays*DAY<=end;t+=stepDays*DAY){
    const training=all.filter(e=>e.time<=t);const analysis=generate(training,t,config,routes,boundaries);
    for(const c of [...analysis.candidates,...baselines(analysis,training)])trials.push({...c,mode:'hindcast',resolution:scoreForecast(c,all,end,true)});
  }
  const summary=['DS','Recent-rate','Null'].map(engine=>{const a=trials.filter(t=>t.engine===engine);return {engine,forecasts:a.length,hits:a.filter(t=>t.resolution?.status==='HIT').length,precision:a.length?a.filter(t=>t.resolution?.status==='HIT').length/a.length:null};});
  return {start,end,stepDays,summary,trials,method:'Event-time hindcast of the currently imported revised catalog. Future events are withheld from every generation step. Does not reconstruct historical publication availability.',limitations:['Overlapping windows and targets create dependent trials.','Scores are descriptive; no prospective skill or probability calibration is implied.']};
}
