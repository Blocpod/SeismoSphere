import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Store,hash} from '../server/store.mjs';
import {Instruments} from '../server/instruments.mjs';
import {SeedLink} from '../server/seedlink.mjs';
const store=new Store(':memory:'),instruments=new Instruments(store),feed=new SeedLink(instruments),station=JSON.parse(readFileSync('artifacts/seedlink-stations.json','utf8'));delete station.reused;
store.db.prepare('INSERT INTO instrument_records VALUES(?,?,?,?,?)').run(station.id,'stations',station.createdAt,hash(station.query),JSON.stringify(station));
const wait=async(predicate,ms=60000)=>{const deadline=Date.now()+ms;while(!predicate()){if(Date.now()>deadline)throw new Error('Feed did not reach expected state: '+JSON.stringify(feed.status()));await new Promise(resolve=>setTimeout(resolve,200));}};
const input={stationRecordId:station.id,channelId:station.channels.find(c=>c.station==='ANMO'&&c.location==='00').id};let before,after;
try{feed.start(input);await wait(()=>feed.samples>0);before=feed.status();const oldPackets=feed.totalPackets,sequence=feed.sequence;feed.terminate();await wait(()=>feed.reconnects>0&&feed.totalPackets>oldPackets,90000);after=feed.status();assert.equal(after.active,true);assert.equal(after.state,'receiving');assert.ok(after.reconnects>=1);assert.notEqual(feed.sequence,sequence);const capture=feed.capture();assert.equal(capture.provenance.reconnectsBeforeCapture,after.reconnects);feed.stop();await wait(()=>!feed.child,10000);assert.equal(feed.status().state,'stopped');const final=feed.status();feed.start(input);feed.stop();await wait(()=>!feed.child,10000);assert.equal(feed.active,false);assert.equal(feed.retryAt,null);writeFileSync('artifacts/seedlink-reconnect-report.json',JSON.stringify({before,after,final,capturedSummary:capture.summary,immediateStop:true},null,2));console.log(JSON.stringify({reconnects:after.reconnects,samples:after.samples,gaps:capture.summary.gapTransitions,overlaps:capture.summary.overlapTransitions,stopped:true}));}
finally{feed.stop();await wait(()=>!feed.child,10000);store.close();}
