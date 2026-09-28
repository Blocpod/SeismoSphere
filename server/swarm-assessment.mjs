import {distance,equivalentMagnitude} from './geo.mjs';
import {oriented,routeWalks} from './routes.mjs';

export function swarmRouteChanges(swarm,network){
 const endpoints=point=>{
  const result=[];
  for(const w of point?routeWalks(network,point,{reflection:false}).filter(w=>w.hops===1):[]){
   const existing=result.find(e=>distance(e.center,w.center)<1&&distance(e.anchor,w.path[1])<1);
   if(existing){existing.routeIds=[...new Set([...existing.routeIds,...w.routeIds])];existing.routeProvenance.push({id:w.route.id,...w.route.provenance});}
   else result.push({center:w.center,anchor:w.path[1],routeIds:[...w.routeIds],routeId:w.route.id,provenance:w.route.provenance,routeProvenance:[{id:w.route.id,...w.route.provenance}]});
  }
  return result;
 };
 const previous=endpoints(swarm.migration?.from),anchor=swarm.migration?.to??swarm.center,current=endpoints(anchor);
 const added=swarm.migration?.from?current.filter(e=>!previous.some(p=>distance(e.center,p.center)<1)):[];
 const removed=swarm.migration?.from?previous.filter(e=>!current.some(p=>distance(e.center,p.center)<1)):[];
 const branches=[];
 for(const endpoint of current){
  let group=branches.find(b=>distance(b.anchor,endpoint.anchor)<1);
  if(!group){group={anchor:endpoint.anchor,endpoints:[]};branches.push(group);}
  const existing=group.endpoints.find(e=>distance(e.center,endpoint.center)<1);
  if(existing)existing.routeIds=[...new Set([...existing.routeIds,...endpoint.routeIds])];
  else group.endpoints.push({...endpoint,routeIds:[...endpoint.routeIds]});
 }
 return {anchor,previous,current,added,removed,branches:branches.filter(b=>b.endpoints.length>=2),
  method:'Compare immediate downstream waypoints from earlier and later centroids, using the same entered route version and capture radius. Later centroid anchors new swarm drafts; use the full centroid if no later half exists. Branch alternatives share an anchor within 1 km and have distinct endpoints at least 1 km apart. This is a configurable routing hypothesis, not inferred geological connectivity or measured transfer.'};
}

// These are observations against frozen envelopes, never replacement resolutions.
export function assessSwarm(swarm,events,forecasts,network,asOf){
 const ids=new Set(swarm.eventIds),members=events.filter(e=>ids.has(e.id)&&e.type==='earthquake'&&e.status!=='deleted'&&e.time<=asOf);
 const targets=[];
 for(const f of forecasts){
  if(f.engine!=='DS'||!f.hash||!Number.isFinite(f.issuedAt)||f.issuedAt>asOf||f.asOf>=asOf)continue;
  const sourceIds=new Set([...(f.sources??[]),...(f.sourceEvents??[]).flatMap(e=>e.aliases??[])]);
  const local=members.filter(e=>(!e.provider||e.provider===(f.catalogProvider??f.config?.catalogProvider??'USGS'))&&e.time>f.asOf&&e.time>=f.validFrom&&e.time<=f.validUntil&&![e.id,...e.aliases??[]].some(id=>sourceIds.has(id))&&distance(e,f.center)<=f.radiusKm);
  if(!local.length)continue;
  const matching=local.filter(e=>e.mag>=f.magnitude.min&&e.mag<=f.magnitude.max);
  targets.push({id:f.id,eventIds:local.map(e=>e.id),matchingEventIds:matching.map(e=>e.id),maxMagnitude:Math.max(...local.map(e=>e.mag)),equivalentMagnitude:equivalentMagnitude(local.map(e=>e.mag)),frozenMagnitude:f.magnitude,
   assessment:matching.length?'Individual swarm events meet the frozen space/time/magnitude envelope. Consult the ledger for the official coverage-aware assessment.':'Swarm activity overlaps the frozen space/time envelope, but no individual member meets its magnitude range. Summed moment does not resolve a watch.'});
 }
 const movement=[];
 const {from,to}=swarm.migration??{};
 if(from&&to)for(const route of network.routes){
  const points=oriented(route),nearest=p=>points.reduce((best,q,i)=>distance(p,q)<distance(p,points[best])?i:best,0),early=nearest(from),late=nearest(to);
  if(distance(from,points[early])>(network.captureKm??1400)||distance(to,points[late])>(network.captureKm??1400)||early===late)continue;
  movement.push({routeId:route.id,routeName:route.name,fromWaypoint:early,toWaypoint:late,direction:late>early?'forward':'reverse',provenance:route.provenance,
   assessment:`The later centroid is anchored ${late>early?'forward':'backward'} along ${route.name}, from waypoint ${early+1} to ${late+1}. This is descriptive alignment, not measured pressure transfer.`});
 }
 return {asOf,routeVersion:network.version,targets,movement,routeChanges:swarmRouteChanges(swarm,network),limitations:'Uses only retained lookback members and watches already issued at this cutoff. No overlap is not a miss; older swarm members may be outside this lookback. Magnitude-equivalent sums assume Mw and are not an individual earthquake or a revised forecast.'};
}
