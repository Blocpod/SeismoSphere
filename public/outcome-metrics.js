import {nearestOnSegment} from './fault-geometry.js';

const coordinate=p=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180;
// Derived inspection only: never alter the immutable scorer or its saved result.
export function pathDistanceKm(path,event){
 if(!coordinate(event)||!Array.isArray(path)||path.length<2||!path.every(coordinate))return null;
 let distance=Infinity;
 for(let i=1;i<path.length;i++){
  const segment=nearestOnSegment(event,path[i-1],path[i]);
  if(segment.ambiguous)return null;
  distance=Math.min(distance,segment.distanceKm);
 }
 return Number.isFinite(distance)?distance:null;
}

export function outcomeMetricsHtml(f,result){
 if(!result?.event)return '';
 const pathDistance=pathDistanceKm(f.path,result.event);
 const number=value=>Number.isFinite(value)?value.toFixed(3):'unavailable';
 return `<dl class="outcome-metrics"><dt>Epicentral error from target center</dt><dd>${number(result.spatialErrorKm)} km</dd><dt>Magnitude error from central estimate</dt><dd>${number(result.magnitudeError)}</dd><dt>Event distance from frozen route</dt><dd>${pathDistance===null?'Unavailable — no complete, unambiguous route':number(pathDistance)+' km'}</dd><dt>Elapsed time after window start</dt><dd>${number(result.timingDays)} days</dd></dl><p class="muted">Route distance is the shortest surface distance to the frozen path segments, not a propagation distance or a scoring criterion. Elapsed time is not temporal prediction error: this forecast specifies a window, not an exact event time.</p>`;
}
