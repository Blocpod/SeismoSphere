import test from 'node:test';
import assert from 'node:assert/strict';
import {figureDownloadLinks} from '../public/figure.js';
test('figure links retain matching files until replacement and release old URLs',async()=>{
 const links=Object.fromEntries(['png','svg','json'].map(format=>[format,{getAttribute(name){return this[name]??null;},removeAttribute(name){delete this[name];}}]));
 const container={querySelector:selector=>links[selector.replace('#figure-','')]},capture={name:'figure-test',png:new Blob(['PNG'],{type:'image/png'}),svg:'<svg/>',json:'{"evidence":true}'};
 figureDownloadLinks(container,capture);
 for(const [format,type]of [['png','image/png'],['svg','image/svg+xml'],['json','application/json']]){const response=await fetch(links[format].href);assert.equal(response.headers.get('content-type'),type);assert.equal(await response.text(),format==='png'?'PNG':capture[format]);assert.equal(links[format].download,'figure-test.'+format);}
 const old=links.svg.href;figureDownloadLinks(container,{...capture,name:'replacement'});await assert.rejects(fetch(old));assert.equal(links.svg.download,'replacement.svg');
 const current=links.json.href;figureDownloadLinks(container,null);await assert.rejects(fetch(current));assert.equal(links.json.href,undefined);assert.equal(links.json.download,undefined);
});
