import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('shared browser chat helper preserves isolated saved evidence requests',async()=>{
 const source=readFileSync('public/app.js','utf8'),start=source.indexOf('async function api(url,body){'),end=source.indexOf('\nlet toastTimer;',start);let submitted;
 const earth={geodesy:{group:{visible:true},selected:{station:{id:'station'}},record:{id:'gnss'}},spatialLayer:{active:true,report:{family:'learned',id:'learned'},days:7}},state={live:true,mode:'strict',selectedEvent:{id:'event'},selectedForecast:{id:'forecast',key:'key'},analysis:{analysisId:'analysis'}};
 const api=new Function('deviceRole','earth','state','previewIds','fetch',source.slice(start,end)+';return api;')('owner',earth,state,new Map(),async(url,options)=>{submitted=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true})};});
 const request={message:'Explain this stress sample and selected station limitations',stressRecordId:'stress',stressSample:220,asOf:123,mode:'catalog-replay'};
 await api('chat',request);assert.deepEqual(submitted,request);
 for(const key of ['calibrationId','protocolId','statisticalRunId','learnedRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','weeklyVolcanoId','resolutionReviewId']){const body={message:'Explain this saved evidence and selected station limitations',[key]:'saved',asOf:123,mode:'catalog-replay'};await api('chat',body);assert.deepEqual(submitted,body,key);}
 await api('chat',{message:'Explain this GNSS station'});assert.equal(submitted.gnssRecordId,'gnss');assert.equal(submitted.analysisId,undefined);
 await api('chat',{message:'Explain the selected forecast'});assert.equal(submitted.forecastId,'forecast');assert.equal(submitted.eventId,'event');assert.equal(submitted.learnedRunId,'learned');
});
