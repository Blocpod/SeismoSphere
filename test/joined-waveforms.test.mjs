import test from 'node:test';
import assert from 'node:assert/strict';
import {waveformRuns,spectrumWindow,windowSelection} from '../public/spectrum-data.js';
const segment=(first,count,rate=100,offset=0)=>({sampleRateHz:rate,samples:Array.from({length:count},(_,i)=>[(first+i)*1e6/rate+offset,first+i])});
const query={joinSegments:true,runIndex:0,startIndex:0,samples:32,window:'hann',detrend:'constant'};
test('joined waveform windows retain exact source slices, chronology and all samples without bridging gaps or overlaps',()=>{
 const source={segments:[segment(16,16),segment(0,16),segment(32,16)]},before=JSON.stringify(source),runs=waveformRuns(source,true);assert.equal(runs.length,1);assert.equal(runs[0].samples,48);assert.equal(waveformRuns(source).length,3);const selected=spectrumWindow(source,{...query,startIndex:8,samples:32});assert.deepEqual(selected.values,Array.from({length:32},(_,i)=>i+8));assert.deepEqual(selected.sourceSlices,[{segmentIndex:1,startIndex:8,samples:8},{segmentIndex:0,startIndex:0,samples:16},{segmentIndex:2,startIndex:0,samples:8}]);assert.equal(windowSelection(selected).joinedBoundaries,2);assert.equal(selected.maxTimingErrorUs,0);assert.equal(JSON.stringify(source),before);
 for(const bad of [segment(33,16),segment(31,16),segment(32,16,50),segment(32,16,100,3)]){const broken={segments:[segment(0,32),bad]};assert.equal(waveformRuns(broken,true).length,2);assert.throws(()=>spectrumWindow(broken,{...query,samples:48}),/continuous/);}
 const tiny={segments:[segment(0,4),segment(4,4),segment(8,4),segment(12,4)]};assert.equal(waveformRuns(tiny).length,0);assert.equal(spectrumWindow(tiny,{...query,samples:16}).values.length,16);for(const invalid of ['true',null,1])assert.throws(()=>spectrumWindow(source,{...query,joinSegments:invalid}),/boolean/);
 const jitter={segments:[segment(0,16),segment(16,16,100,-2)]};assert.equal(waveformRuns(jitter,true).length,1);assert.equal(spectrumWindow(jitter,query).maxTimingErrorUs,2);
 const drift={segments:[segment(0,16),segment(16,16,100,2),segment(32,16,100,4)]};assert.equal(waveformRuns(drift,true).length,2,'Small adjacent clock shifts must not accumulate through a long joined run');
 const duplicate={segments:[segment(0,32,1000000)]};duplicate.segments[0].samples[16][0]=15;assert.equal(waveformRuns(duplicate,true).length,2,'Non-increasing timestamps must split even when the timing tolerance exceeds the period');assert.throws(()=>spectrumWindow(duplicate,query),/continuous/);
 const large={segments:[segment(0,250000)]};assert.equal(spectrumWindow(large,{...query,samples:250000}).values.length,250000,'Large source blocks must not use argument spreading');
});
