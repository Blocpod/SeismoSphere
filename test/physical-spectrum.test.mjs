import test from 'node:test';
import assert from 'node:assert/strict';
import {rawSampleMapping} from '../server/instruments.mjs';
import {calculateSpectrum} from '../server/spectrum.mjs';
test('physical spectra preserve SI squared-density units and known tone power in every output quantity',async()=>{
 const mapping=rawSampleMapping({selection:{startIndex:0},query:{startIndex:64,samples:2048}},{kind:'correction',selection:{sourceSlices:[{segmentIndex:0,startIndex:0,samples:2020},{segmentIndex:1,startIndex:0,samples:380}]}});assert.deepEqual(mapping.sourceSlices,[{segmentIndex:0,startIndex:64,samples:1956},{segmentIndex:1,startIndex:0,samples:92}]);assert.equal(mapping.rawBlockBoundaries,1);assert.equal(mapping.rawBlocks,2);
 const n=256,fs=64,amplitude=2e-6,values=Array.from({length:n},(_,i)=>3e-6+amplitude*Math.sin(2*Math.PI*4*i/fs)),input={values,sampleRateHz:fs,window:'boxcar',detrend:'constant',timeFrequency:{frameSamples:64,hopSamples:32}},close=(a,b)=>assert.ok(Math.abs(a-b)<Math.abs(b)*1e-12,`${a} != ${b}`);
 for(const sampleUnits of ['m','m/s','m/s²']){const r=await calculateSpectrum({...input,sampleUnits});assert.equal(r.summary.units,`(${sampleUnits})²/Hz`);assert.equal(r.summary.meanSquareUnits,`(${sampleUnits})²`);assert.equal(r.summary.sampleUnits,sampleUnits);assert.equal(r.summary.peakNonzeroBinHz,4);close(r.summary.integratedPsd,amplitude**2/2);close(r.summary.residualRms,amplitude/Math.sqrt(2));close(r.summary.removedMean,3e-6);close(r.psd[16],amplitude**2*n/(2*fs));assert.equal(r.psdCounts2PerHz,undefined);assert.equal(r.spectrogram.psdCounts2PerHz,undefined);for(const frame of r.spectrogram.psd)close(frame.reduce((a,b)=>a+b,0),amplitude**2/2);assert.equal(r.spectrogram.summary.units,r.summary.units);}
 await assert.rejects(calculateSpectrum({...input,sampleUnits:'Pa'}),/Unsupported physical/);
});
