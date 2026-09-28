// Product metadata only: downloading a linked file does not validate its model inputs.
export function finiteFaultProducts(detail){
  const products=detail?.properties?.products?.['finite-fault']??[];
  if(!Array.isArray(products)||products.length>200)throw new Error('Invalid finite-fault product inventory');
  return products.map(p=>{
    if(!p||p.type!=='finite-fault'||typeof p.id!=='string'||!Number.isFinite(p.updateTime))throw new Error('Invalid finite-fault product');
    const files=Object.entries(p.contents??{}).flatMap(([name,content])=>{
      let url;try{url=new URL(content.url);}catch{return [];}
      if(url.protocol!=='https:'||url.hostname!=='earthquake.usgs.gov'||url.username||url.password||url.port)return [];
      const kind=/\.inp$/i.test(name)?'Coulomb input':/\.fsp$/i.test(name)?'Slip model (FSP)':/\.param$/i.test(name)?'Slip model (PARAM)':/\.geojson$/i.test(name)?'Model map (GeoJSON)':null;
      return kind?[{name,kind,url:url.href,bytes:Number.isSafeInteger(content.length)&&content.length>=0?content.length:null}]:[];
    });
    return {id:p.id,source:p.source??'USGS',code:p.code,updateTime:p.updateTime,status:p.status,files};
  });
}

export function finiteFaultAvailability(record,product,{asOf,mode='catalog-replay',future=false}){
  if(future)return 'Return to observed time to inspect source models.';
  if(!Number.isFinite(asOf)||!['strict','catalog-replay'].includes(mode))return 'Invalid observation cutoff.';
  if(record.event.time>asOf)return 'The earthquake occurs after this cutoff.';
  if(mode==='strict'&&record.createdAt>asOf)return 'This source receipt was unavailable at the strict cutoff.';
  if(product.updateTime>asOf)return 'This model was revised after this cutoff.';
  if(product.status!=='UPDATE')return 'This source model is withdrawn or unavailable.';
  return null;
}
