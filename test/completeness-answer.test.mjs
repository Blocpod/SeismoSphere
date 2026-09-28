import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/completeness-lab.js','utf8'),start=source.indexOf("result.querySelector('#completeness-explain').onclick="),end=source.indexOf('\n',start),handler=source.slice(start,end).split('.onclick=')[1].trim().replace(/;$/,'');
function pending(){
 let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;}),button={},output={textContent:''};let visible=output;
 const result={querySelector:selector=>selector==='#completeness-explain'?button:visible};
 const controller=new Function('result','api',`let selected='pooled',report={id:'run',options:{end:123}};return {run:${handler},select(value){selected=value;},replace(){report={...report};}};`)(result,()=>promise);
 return {...controller,resolve,reject,button,output,replaceOutput(){visible={textContent:'new view'};}};
}
test('completeness answers and errors remain bound to the requested run and sample',async()=>{
 for(const change of ['select','replace','replaceOutput']){
  const c=pending(),job=c.run();assert.equal(c.button.disabled,true);c[change]('cell-1');c.output.textContent='different selection';c.resolve({model:'fixture',answer:'old sample'});await job;assert.equal(c.output.textContent,'different selection',change);assert.equal(c.button.disabled,false);
 }
 const c=pending(),job=c.run();c.select('time-1');c.output.textContent='';c.reject(new Error('old error'));await job;assert.equal(c.output.textContent,'');
 const good=pending(),done=good.run();good.resolve({model:'fixture',answer:'current evidence',grounded:true});await done;assert.match(good.output.textContent,/pooled.*DETERMINISTIC EVIDENCE/);assert.match(good.output.textContent,/current evidence/);
});
