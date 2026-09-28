import test from 'node:test';
import assert from 'node:assert/strict';
import {finiteFaultProducts,finiteFaultAvailability} from '../public/finite-fault.js';

test('finite-fault inventory retains published inputs, filters unsafe links and gates revisions',()=>{
  const product={id:'urn:usgs:test',type:'finite-fault',code:'test',source:'us',status:'UPDATE',updateTime:200,contents:{
    'model.inp':{url:'https://earthquake.usgs.gov/product/finite-fault/test/model.inp',length:1234},
    'model.fsp':{url:'https://earthquake.usgs.gov/product/finite-fault/test/model.fsp'},
    'map.geojson':{url:'https://earthquake.usgs.gov/product/finite-fault/test/map.geojson'},
    'unsafe.inp':{url:'javascript:alert(1)'},'external.inp':{url:'https://earthquake.usgs.gov.evil.test/model.inp'},
    'userinfo.inp':{url:'https://user@earthquake.usgs.gov/model.inp'},'image.png':{url:'https://earthquake.usgs.gov/image.png'}
  }};
  const detail={properties:{products:{'finite-fault':[product]}}},[parsed]=finiteFaultProducts(detail);
  assert.equal(parsed.files.length,3);assert.equal(parsed.files[0].kind,'Coulomb input');assert.equal(parsed.files[0].bytes,1234);assert.equal(parsed.files[1].bytes,null);
  const record={event:{time:100},createdAt:300};
  assert.equal(finiteFaultAvailability(record,parsed,{asOf:200}),null);
  assert.match(finiteFaultAvailability(record,parsed,{asOf:199}),/revised/);
  assert.match(finiteFaultAvailability(record,parsed,{asOf:99}),/earthquake/);
  assert.match(finiteFaultAvailability(record,parsed,{asOf:250,mode:'strict'}),/receipt/);
  assert.equal(finiteFaultAvailability(record,parsed,{asOf:300,mode:'strict'}),null);
  assert.match(finiteFaultAvailability(record,parsed,{asOf:300,future:true}),/observed/);
  assert.match(finiteFaultAvailability(record,{...parsed,status:'DELETE'},{asOf:300}),/withdrawn/);
  assert.match(finiteFaultAvailability(record,parsed,{asOf:NaN}),/Invalid/);
  assert.deepEqual(finiteFaultProducts({}),[]);
  assert.throws(()=>finiteFaultProducts({properties:{products:{'finite-fault':{}}}}),/inventory/);
  product.updateTime='200';assert.throws(()=>finiteFaultProducts(detail),/product/);
});
