import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {Store,hash} from '../server/store.mjs';
import {Instruments,instrumentContext,instrumentSourceValid} from '../server/instruments.mjs';
import {SeedLink} from '../server/seedlink.mjs';
test('SeedLink exact MiniSEED, bounded captures, duplicate/gap handling and immutable replay evidence',async t=>{
 const packet=JSON.parse(execFileSync(path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['scripts/seedlink-decoder-check.py'],{windowsHide:true,encoding:'utf8'}));
 const store=new Store(':memory:'),instruments=new Instruments(store),feed=new SeedLink(instruments);t.mock.method(feed,'connect',()=>{feed.state='connecting';});
 const metadata='#Network|Station|Location|Channel|Latitude|Longitude|Elevation|Depth|Azimuth|Dip|SensorDescription|Scale|ScaleFreq|ScaleUnits|SampleRate|StartTime|EndTime\nIU|ANMO|00|BHZ|34|-106|1600|100|0|-90|Test sensor|10|1|m/s|40|2020-01-01T00:00:00|';
 t.mock.method(globalThis,'fetch',async()=>new Response(metadata));
 try{const stations=await instruments.stations({at:Date.now()-1000,networks:'IU',channel:'BHZ'}),input={stationRecordId:stations.id,channelId:stations.channels[0].id};feed.start(input);assert.throws(()=>feed.start(input),/Stop/);assert.throws(()=>feed.capture(),/No retained/);
  feed.accept(packet);feed.accept(packet);assert.equal(feed.status().duplicates,1);assert.equal(feed.status().samples,40);assert.equal(feed.status().stale,true);
  const captured=feed.capture();assert.equal(instrumentSourceValid(captured),true);assert.equal(captured.summary.samples,40);assert.equal(captured.summary.gapTransitions,0);assert.equal(captured.rawEncoding,'base64');const {id,...body}=captured;assert.equal(hash(body),id);assert.equal(feed.capture().reused,true);assert.throws(()=>instrumentContext(captured,captured.query.end,'strict'),/unavailable/);assert.throws(()=>instrumentContext(captured,captured.query.end-1),/cutoff/);assert.equal(instrumentContext(captured,Date.now()).summary.samples,40);
  const evidence=instrumentContext(captured,Date.now());assert.match(evidence.acquisition,/Captured.*SeedLink/);assert.equal(evidence.timing.firstSampleUtc,'2026-01-01T00:00:00.019538Z');assert.equal(evidence.timing.firstReceivedUtc,'2026-01-01T00:00:01.000Z');assert.equal(evidence.query.packetHashes,undefined);assert.equal(evidence.receipt.packets,undefined);assert.equal(evidence.query.packetCount,1);
  const changed=(offset,sequence)=>{const p=structuredClone(packet);p.sequence=sequence;const raw=Buffer.from(p.raw,'base64');raw.write('SL'+sequence.toString(16).padStart(6,'0'));p.raw=raw.toString('base64');p.segment.samples=p.segment.samples.map(([t,v])=>[t+offset,v]);return p;};
  feed.accept(changed(2000000,0));assert.equal(feed.sequence,0);assert.equal(feed.capture().summary.gapTransitions,1);assert.equal(feed.status(true).preview.paths.length,2);
  const bad=changed(0,1);bad.segment.samples[1][0]=bad.segment.samples[0][0];assert.throws(()=>feed.accept(bad),/timing/);
  feed.accept(changed(901000000,1));assert.equal(feed.packets.length,2);assert.equal(feed.evictedPackets,1);feed.accept(changed(0,2));assert.equal(feed.packets.length,2);assert.equal(feed.evictedPackets,2); // Late obsolete packet cannot evict newer retained packets.
  const frozen=feed.capture();assert.equal(instrumentSourceValid(frozen),true);assert.throws(()=>store.db.exec('DELETE FROM instrument_records'),/immutable/);feed.stop();assert.equal(feed.status().active,false);assert.equal(feed.status().state,'stopped');assert.equal(feed.capture().id,frozen.id);feed.start(input);assert.equal(feed.samples,0);
  for(let i=0;i<27;i++){const p=changed(0,i);p.segment.samples=Array.from({length:10000},(_,j)=>[packet.segment.samples[0][0]+j*25000,j]);feed.accept(p);}assert.equal(feed.samples,250000);assert.equal(feed.evictedPackets,2);assert.ok(feed.status(true).preview.summary.samples<=20000);feed.stop();
 }finally{feed.close();store.close();}
});
