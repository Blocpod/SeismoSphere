export const waveformUtc=us=>Number.isFinite(us)?new Date(Math.floor(us/1000)).toISOString().replace(/\.\d{3}Z$/,'.'+String((us%1000000+1000000)%1000000).padStart(6,'0')+'Z'):null;
// Preserve extrema and source gaps when compressing a waveform for a finite-width chart.
export function waveformPaths(segments,startUs,endUs,width=800){
  const paths=[];for(const segment of segments){let run=[],previous=null;const flush=()=>{if(!run.length)return;const buckets=new Map();for(const point of run){const bucket=Math.floor((point[0]-startUs)/(endUs-startUs)*width),entry=buckets.get(bucket);if(!entry)buckets.set(bucket,{first:point,last:point,min:point,max:point});else{entry.last=point;if(point[1]<entry.min[1])entry.min=point;if(point[1]>entry.max[1])entry.max=point;}}paths.push([...buckets.values()].flatMap(b=>[...new Map([b.first,b.min,b.max,b.last].sort((a,b)=>a[0]-b[0]).map(p=>[p[0],p])).values()]));run=[];};
    for(const point of segment.samples){if(previous!==null&&point[0]-previous>1.5e6/segment.sampleRateHz)flush();run.push(point);previous=point[0];}flush();
  }return paths;
}
