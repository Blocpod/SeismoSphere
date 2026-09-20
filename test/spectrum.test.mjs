import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,hash} from '../server/store.mjs';
import {Instruments,instrumentContext} from '../server/instruments.mjs';
import {calculateSpectrum} from '../server/spectrum.mjs';
import {waveformRuns,spectrumWindow} from '../public/spectrum-data.js';
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const sine=(n,fs,f=4)=>Array.from({length:n},(_,i)=>7+3*Math.sin(2*Math.PI*f*i/fs));
test('periodogram recovers known sinusoid power, DC/Nyquist scaling, odd lengths and linear detrending',async()=>{
 for(const [n,window]of [[128,'boxcar'],[129,'boxcar'],[128,'hann']]){
  const values=sine(n,128,128*4/n),r=await calculateSpectrum({values,sampleRateHz:128,window,detrend:'constant'});close(r.summary.peakNonzeroBinHz,512/n);close(r.summary.integratedPsdCounts2,4.5);close(r.summary.residualRmsCounts,3/Math.sqrt(2));assert.equal(r.frequencyHz.length,Math.floor(n/2)+1);
  // Independent direct DFT checks every bin, including the unpaired even Nyquist term.
  const mean=values.reduce((a,b)=>a+b,0)/n,w=values.map((_,i)=>window==='hann'?.5-.5*Math.cos(2*Math.PI*i/n):1),denom=128*w.reduce((a,b)=>a+b*b,0);
  for(let k=0;k<r.frequencyHz.length;k++){let re=0,im=0;for(let j=0;j<n;j++){re+=(values[j]-mean)*w[j]*Math.cos(2*Math.PI*k*j/n);im-=(values[j]-mean)*w[j]*Math.sin(2*Math.PI*k*j/n);}close(r.psdCounts2PerHz[k],(re*re+im*im)/denom*(k>0&&(n%2||k<n/2)?2:1));}
 }
 const nyquist=await calculateSpectrum({values:Array.from({length:64},(_,i)=>i%2?2:-2),sampleRateHz:64,window:'boxcar',detrend:'constant'});close(nyquist.summary.integratedPsdCounts2,4);close(nyquist.psdCounts2PerHz.at(-1),4);
 const flat=await calculateSpectrum({values:Array(64).fill(5),sampleRateHz:64,window:'hann',detrend:'constant'});assert.equal(flat.summary.peakNonzeroBinHz,null);close(flat.summary.integratedPsdCounts2,0);
 const ramp=await calculateSpectrum({values:Array.from({length:64},(_,i)=>10+2*i),sampleRateHz:20,window:'boxcar',detrend:'linear'});close(ramp.summary.removedSlopeCountsPerSecond,40);close(ramp.summary.residualRmsCounts,0);
});
test('spectra preserve source boundaries, reject discontinuities and invalid windows, and freeze their source-linked results',async()=>{
 const start=Date.UTC(2020,0,1),values=sine(128,20),segments=[{sampleRateHz:20,metadata:{},samples:values.map((v,i)=>[start*1000+i*50000,v])},{sampleRateHz:20,metadata:{},samples:values.map((v,i)=>[start*1000+128*50000+i*50000,v])}],body={kind:'waveform',createdAt:start+20000,query:{start,end:start+12800},segments,summary:{samples:256,segments:2,gapTransitions:0,overlapTransitions:0},raw:'retained test source',receipt:{sha256:hash('retained test source')},station:{network:'TEST',station:'SINE'}};const source={...body,id:hash(body)};
 assert.equal(waveformRuns(source).length,2);const broken=structuredClone(source);broken.segments[0].samples[64][0]+=1000;assert.equal(waveformRuns(broken).length,3);const input={waveformId:source.id,runIndex:0,startIndex:0,samples:128,window:'hann',detrend:'constant',asOf:Date.now(),mode:'catalog-replay'};
 for(const change of [{runIndex:-1},{startIndex:.5},{samples:129},{samples:15},{window:'unknown'},{detrend:'none'}])assert.throws(()=>spectrumWindow(source,{...input,...change}));
 const store=new Store(':memory:'),service=new Instruments(store);try{
  store.db.prepare('INSERT INTO instrument_records VALUES(?,?,?,?,?)').run(source.id,'waveform',source.createdAt,hash(body.query),JSON.stringify(source));const result=await service.spectrum(input),{id,...stored}=service.get(result.id);assert.equal(hash(stored),id);assert.equal((await service.spectrum(input)).id,id);assert.equal((await service.spectrum(input)).reused,true);assert.equal(result.selection.firstSampleUs,start*1000);assert.equal(result.summary.samples,128);
  const context=instrumentContext(result,Date.now(),'catalog-replay',source);assert.equal(context.spectrum.summary.samples,128);assert.equal(context.spectrum.frequencyHz,undefined);assert.equal(context.source.segments[0].samples,undefined);assert.throws(()=>instrumentContext(result,start+12800,'strict',source),/unavailable/);assert.throws(()=>instrumentContext(result,start+1000,'catalog-replay',source),/cutoff/);await assert.rejects(service.spectrum({...input,asOf:start+1000}),/cutoff/);assert.throws(()=>store.db.exec("UPDATE instrument_records SET body='{}' WHERE kind='spectrum'"),/immutable/);assert.equal(store.ledger().length,0);
 }finally{store.close();}
});
test('time-frequency frames recover a changing tone, preserve per-frame scaling and disclose unused samples',async()=>{
 const values=Array.from({length:1040},(_,i)=>3*Math.sin(2*Math.PI*(i<512?4:12)*i/64)),input={values,sampleRateHz:64,window:'hann',detrend:'constant',timeFrequency:{frameSamples:128,hopSamples:64}},result=await calculateSpectrum(input),g=result.spectrogram;
 assert.equal(g.summary.frames,15);assert.equal(g.summary.unusedTailSamples,16);assert.equal(g.summary.overlapFraction,.5);assert.equal(g.summary.binSpacingHz,.5);assert.equal(g.summary.peakNonzeroBinHzByFrame[0],4);assert.equal(g.summary.peakNonzeroBinHzByFrame.at(-1),12);close(g.frameCenterSeconds[0],63.5/64);
 for(const i of [0,7,14]){const frame=await calculateSpectrum({...input,values:values.slice(i*64,i*64+128),timeFrequency:undefined});assert.deepEqual(frame.psdCounts2PerHz,g.psdCounts2PerHz[i]);}
 for(const options of [{frameSamples:2048,hopSamples:64},{frameSamples:128,hopSamples:1},{frameSamples:128,hopSamples:129},{frameSamples:15,hopSamples:8}])await assert.rejects(calculateSpectrum({...input,timeFrequency:options}),/Choose/);
 const source={segments:[{sampleRateHz:64,samples:values.map((v,i)=>[i*15625,v])}]},query={runIndex:0,startIndex:0,samples:1040,window:'hann',detrend:'constant',timeFrequency:input.timeFrequency};assert.equal(spectrumWindow(source,query).values.length,1040);assert.throws(()=>spectrumWindow(source,{...query,timeFrequency:{frameSamples:128,hopSamples:1}}),/frames/);
 const flat=await calculateSpectrum({...input,values:Array(256).fill(3)});assert.ok(flat.spectrogram.summary.peakNonzeroBinHzByFrame.every(p=>p===null));assert.ok(flat.spectrogram.psdCounts2PerHz.flat().every(p=>p===0));
});
