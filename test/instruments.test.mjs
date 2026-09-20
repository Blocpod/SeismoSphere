import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,hash} from '../server/store.mjs';
import {utcMicroseconds,parseStations,parseWaveform,Instruments,instrumentContext} from '../server/instruments.mjs';
import {waveformPaths,waveformUtc} from '../public/waveform-geometry.js';
const metadata='#Network | Station | Location | Channel | Latitude | Longitude | Elevation | Depth | Azimuth | Dip | SensorDescription | Scale | ScaleFreq | ScaleUnits | SampleRate | StartTime | EndTime\nIU|ANMO|00|BHZ|34.945981|-106.457133|1671|145|0|-90|Seismometer|3275110000|0.02|m/s|20|2008-01-01T00:00:00.0000|';
const query={network:'IU',station:'ANMO',location:'00',channel:'BHZ',start:Date.parse('2010-02-27T07:00:00Z'),end:Date.parse('2010-02-27T07:02:00Z')};
const segment=(samples,rate=20)=>`# dataset: GeoCSV 2.0\n# delimiter: ,\n# SID: IU_ANMO_00_BHZ\n# sample_count: ${samples.length}\n# sample_rate_hz: ${rate}\n# start_time: ${samples[0]?.[0]??'2010-02-27T07:00:00Z'}\n# field_unit: UTC, Counts\nTime, Sample\n${samples.map(s=>s.join(', ')).join('\n')}\n`;
const wave=segment([['2010-02-27T07:00:00.019538Z',-2],['2010-02-27T07:00:00.069538Z',2]])+segment([['2010-02-27T07:00:01.019536Z',6]]);
test('station metadata and GeoCSV retain microseconds, missing metadata, source segments, units and gaps',()=>{
  for(const time of ['1906-04-18T13:12:00.019538Z','1969-12-31T23:59:59.999999Z','2026-09-13T19:00:05.119538Z'])assert.equal(waveformUtc(utcMicroseconds(time)),time);assert.equal(waveformUtc(Infinity),null);
  const station=parseStations(metadata)[0];assert.equal(station.sensitivityInputUnits,'m/s');assert.equal(station.endUs,null);assert.equal(station.lat,34.945981);assert.equal(utcMicroseconds('2010-02-27T07:00:00.019538Z')%1000000,19538);
  assert.throws(()=>utcMicroseconds('2010-02-30T00:00:00Z'));assert.throws(()=>parseStations(metadata.replace('34.945981','91')));assert.equal(parseStations(metadata.replace('|3275110000|0.02|m/s|20|','|||||'))[0].sampleRateHz,null);
  const parsed=parseWaveform(wave,query);assert.equal(parsed.segments.length,2);assert.equal(parsed.summary.samples,3);assert.equal(parsed.summary.gapTransitions,1);assert.equal(parsed.summary.mean,2);assert.ok(Math.abs(parsed.summary.rmsAboutMean-Math.sqrt(32/3))<1e-12);assert.equal(parsed.segments[1].samples[0][0]%1000000,19536);
  for(const invalid of [wave.replace('sample_count: 2','sample_count: 3'),wave.replace('IU_ANMO','II_ANMO'),wave.replace('UTC, Counts','UTC, m/s'),wave.replace('2010-02-27T07:00:00.069538Z','2010-02-27T07:00:00.019538Z')])assert.throws(()=>parseWaveform(invalid,query));
  assert.throws(()=>parseWaveform(wave,{...query,end:query.start+1000}),/out-of-window/);assert.throws(()=>parseWaveform('',query),/header/);
  const paths=waveformPaths([{sampleRateHz:20,samples:Array.from({length:200},(_,i)=>[i*50000,i===23?999:i===24?-888:0]).concat([[20000000,1]])},{sampleRateHz:20,samples:[[20100000,2]]}],0,21000000,10);assert.equal(paths.length,3);assert.ok(paths[0].some(p=>p[1]===999));assert.ok(paths[0].some(p=>p[1]===-888));assert.ok(paths[0].length<100);
});
test('instrument requests cache immutable source receipts and enforce channel epochs and historical reception',async t=>{
  const store=new Store(':memory:'),service=new Instruments(store);let calls=0,empty=false;t.mock.method(globalThis,'fetch',async url=>{calls++;assert.ok(url.startsWith('https://service.earthscope.org/fdsnws/'));return empty?new Response(null,{status:204}):new Response(url.includes('/station/')?metadata:wave);});
  try{
    const stations=await service.stations({at:query.start,networks:'IU',channel:'BHZ'});assert.equal((await service.stations(stations.query)).reused,true);assert.equal(calls,1);const input={stationRecordId:stations.id,channelId:stations.channels[0].id,start:query.start,end:query.end,asOf:query.end};
    await assert.rejects(service.waveform({...input,mode:'strict'}),/unavailable/);assert.equal(calls,1);
    const waveform=await service.waveform(input);assert.equal(waveform.summary.samples,3);assert.equal((await service.waveform(input)).reused,true);assert.equal(calls,2);const {id,...body}=service.get(waveform.id);assert.equal(hash(body),id);assert.equal(hash(body.raw),body.receipt.sha256);
    assert.equal((await service.waveform({...input,asOf:Date.now(),mode:'strict'})).id,id);
    const context=instrumentContext(waveform,query.end);assert.equal(context.summary.samples,3);assert.equal(context.segments[0].samples,undefined);assert.throws(()=>instrumentContext(waveform,query.end-1),/after/);assert.throws(()=>instrumentContext(waveform,query.end,'strict'),/unavailable/);
    await assert.rejects(service.waveform({...input,end:input.asOf+1}),/cutoff/);await assert.rejects(service.waveform({...input,start:Date.UTC(2000,0,1),end:Date.UTC(2000,0,1)+60000}),/epoch/);await assert.rejects(service.waveform({...input,channelId:'invented'}),/Select a channel/);
    empty=true;const absent=await service.waveform({...input,start:input.start+10000,end:input.end+10000,asOf:Date.now()});assert.equal(absent.summary.samples,0);assert.equal(absent.receipt.httpStatus,204);assert.equal(absent.raw,'');
    assert.throws(()=>store.db.exec('DELETE FROM instrument_records'),/immutable/);assert.equal(service.list().length,3);
    for(let i=0;i<41;i++)store.db.prepare('INSERT INTO instrument_records VALUES(?,?,?,?,?)').run('history-'+i,'waveform',Date.now()+i,'history-'+i,JSON.stringify({query:{},summary:{samples:0}}));
    assert.equal(service.list().filter(r=>r.kind==='waveform').length,40);assert.equal(service.list().find(r=>r.kind==='stations').id,stations.id);
  }finally{store.close();}
});
