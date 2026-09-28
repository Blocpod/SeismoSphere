import {distance,equivalentMagnitude} from './geo.mjs';
import {oriented} from './routes.mjs';

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
 return {asOf,routeVersion:network.version,targets,movement,limitations:'Uses only retained lookback members and watches already issued at this cutoff. No overlap is not a miss; older swarm members may be outside this lookback. Magnitude-equivalent sums assume Mw and are not an individual earthquake or a revised forecast.'};
}
