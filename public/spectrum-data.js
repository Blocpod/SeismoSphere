// Existing records default to separate blocks. Joining additionally bounds total nominal-clock deviation.
export function waveformRuns(record,joinSegments=false,minSamples=16){
 if(!Number.isInteger(minSamples)||minSamples<1)throw new Error('Minimum run size must be a positive integer');
 if(typeof joinSegments!=='boolean')throw new Error('Source-block joining must be a boolean');
 const runs=[];
 for(const [segmentIndex,segment]of record.segments.entries()){
  const period=1e6/segment.sampleRateHz,tolerance=Math.max(2,period*.0001);let first=0;
  for(let i=1;i<=segment.samples.length;i++)if(i===segment.samples.length||Math.abs(segment.samples[i][0]-segment.samples[i-1][0]-period)>tolerance||joinSegments&&(segment.samples[i][0]<=segment.samples[i-1][0]||Math.abs(segment.samples[i][0]-segment.samples[first][0]-(i-first)*period)>tolerance)){if(i-first>=(joinSegments?1:minSamples))runs.push({segmentIndex,startIndex:first,samples:i-first,sampleRateHz:segment.sampleRateHz,startUs:segment.samples[first][0],endUs:segment.samples[i-1][0],toleranceUs:tolerance});first=i;}
 }
 if(!joinSegments)return runs;
 const joined=[];runs.sort((a,b)=>a.startUs-b.startUs||a.segmentIndex-b.segmentIndex||a.startIndex-b.startIndex);
 for(const part of runs){const previous=joined.at(-1),period=1e6/part.sampleRateHz,slice={segmentIndex:part.segmentIndex,startIndex:part.startIndex,samples:part.samples},points=record.segments[part.segmentIndex].samples.slice(part.startIndex,part.startIndex+part.samples);
  if(previous&&previous.sampleRateHz===part.sampleRateHz&&part.startUs>previous.endUs&&Math.abs(part.startUs-previous.endUs-period)<=part.toleranceUs&&points.every(([t],i)=>Math.abs(t-previous.startUs-(previous.samples+i)*period)<=part.toleranceUs)){
   previous.samples+=part.samples;previous.endUs=part.endUs;previous.sourceSlices.push(slice);
  }else joined.push({...part,sourceSlices:[slice]});
 }
 return joined.filter(r=>r.samples>=minSamples);
}
export function spectrumWindow(record,input){
 const runs=waveformRuns(record,input.joinSegments===undefined?false:input.joinSegments),run=runs[input.runIndex];
 if(!Number.isInteger(input.runIndex)||!run||!Number.isInteger(input.startIndex)||input.startIndex<0||!Number.isInteger(input.samples)||input.samples<16||input.samples>250000||input.startIndex+input.samples>run.samples||!['hann','boxcar'].includes(input.window)||!['constant','linear'].includes(input.detrend))throw new Error('Choose a continuous run, at least 16 samples within it, and supported window/detrend settings.');
 let samples,sourceSlices;
 if(input.joinSegments){sourceSlices=sliceSources(run.sourceSlices,input.startIndex,input.samples);samples=[];for(const slice of sourceSlices)record.segments[slice.segmentIndex].samples.slice(slice.startIndex,slice.startIndex+slice.samples).forEach(point=>samples.push(point));}
 else samples=record.segments[run.segmentIndex].samples.slice(run.startIndex+input.startIndex,run.startIndex+input.startIndex+input.samples);
 if(input.timeFrequency!==undefined){const {frameSamples:size,hopSamples:hop}=input.timeFrequency??{},frames=Math.floor((input.samples-size)/hop)+1;if(!Number.isInteger(size)||!Number.isInteger(hop)||size<16||size>Math.min(8192,input.samples)||hop<Math.ceil(size/4)||hop>size||frames>1024||frames*(Math.floor(size/2)+1)>200000)throw new Error('Choose frames of 16–8192 samples within the selection, hop from 25% to 100% of a frame, at most 1024 frames and 200,000 cells.');}
 return {run,firstSampleUs:samples[0][0],lastSampleUs:samples.at(-1)[0],values:samples.map(s=>s[1]),sampleTimesUs:samples.map(s=>s[0]),...(sourceSlices?{sourceSlices,maxTimingErrorUs:samples.reduce((max,[t],i)=>Math.max(max,Math.abs(t-samples[0][0]-i*1e6/run.sampleRateHz)),0)}:{})};
}
export function windowSelection(selected){return {...selected.run,firstSampleUs:selected.firstSampleUs,lastSampleUs:selected.lastSampleUs,...(selected.sourceSlices?{sourceSlices:selected.sourceSlices,joinedBoundaries:selected.sourceSlices.length-1,maxTimingErrorUs:selected.maxTimingErrorUs}:{})};}
export function spectrumPresentation(record){const s=record.summary,physical=!!s.sampleUnits;return {physical,power:record.psd??record.psdCounts2PerHz,units:physical?s.units:'counts²/Hz',sampleUnits:s.sampleUnits??'counts',meanSquareUnits:s.meanSquareUnits??'counts²',integratedPsd:s.integratedPsd??s.integratedPsdCounts2,residualRms:s.residualRms??s.residualRmsCounts,csvPower:physical?'PSD_'+s.units:'PSD_counts_squared_per_Hz'};}
export function sliceSources(slices,start,count){let offset=0;const selected=[];for(const slice of slices){const from=Math.max(0,start-offset),to=Math.min(slice.samples,start+count-offset);if(to>from)selected.push({segmentIndex:slice.segmentIndex,startIndex:slice.startIndex+from,samples:to-from});offset+=slice.samples;}return selected;}
