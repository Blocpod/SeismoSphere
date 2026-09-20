export const RELIEF_RADIUS_M=6371008.8;
export function reliefGrid(bytes,metadata){
 const {width,height,latitudeStart,longitudeStart,latitudeStep,longitudeStep}=metadata;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>4000000||bytes.byteLength!==width*height*2||![latitudeStart,longitudeStart,latitudeStep,longitudeStep].every(Number.isFinite)||latitudeStep<=0||longitudeStep<=0||Math.abs(width*longitudeStep-360)>1e-7||Math.abs(height*latitudeStep-180)>1e-7)throw new Error('Invalid relief grid dimensions or global coverage.');
 const view=new DataView(bytes),values=new Int16Array(width*height);let south=0,north=0;for(let i=0;i<values.length;i++){values[i]=view.getInt16(i*2,true);if(values[i]<-12000||values[i]>10000)throw new Error('Invalid relief elevation.');}for(let x=0;x<width;x++){south+=values[x]/width;north+=values[(height-1)*width+x]/width;}
 const wrap=x=>(x%width+width)%width;
 function indices(lat,lon){if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Enter latitude −90…90 and longitude −180…180.');return {x:((lon-longitudeStart)/longitudeStep%width+width)%width,y:(lat-latitudeStart)/latitudeStep};}
 function heightAt(lat,lon){const {x,y}=indices(lat,lon),x0=Math.floor(x),fx=x-x0,y0=Math.max(0,Math.min(height-1,Math.floor(y))),y1=Math.max(0,Math.min(height-1,y0+1)),fy=Math.max(0,Math.min(1,y-y0)),a=values[y0*width+x0]*(1-fx)+values[y0*width+wrap(x0+1)]*fx,b=values[y1*width+x0]*(1-fx)+values[y1*width+wrap(x0+1)]*fx;let value=a*(1-fy)+b*fy;
  if(lat<latitudeStart){const t=(latitudeStart-lat)/(latitudeStart+90);value=a*(1-t)+south*t;}
  const lastLat=latitudeStart+(height-1)*latitudeStep;if(lat>lastLat){const t=(lat-lastLat)/(90-lastLat);value=a*(1-t)+north*t;}return value;}
 function nearest(lat,lon){const {x,y}=indices(lat,lon),column=wrap(Math.round(x)),row=Math.max(0,Math.min(height-1,Math.round(y)));return {row,column,lat:latitudeStart+row*latitudeStep,lon:longitudeStart+column*longitudeStep,elevationM:values[row*width+column],interpolatedM:heightAt(lat,lon)};}
 return {values,heightAt,nearest};
}
export function reliefRadius(elevationM,scale,exposeSeafloor){if(!Number.isFinite(elevationM)||elevationM<-12000||elevationM>10000||![1,5,20,50].includes(scale))throw new Error('Invalid relief height or display scale.');return 1+(exposeSeafloor?elevationM:Math.max(0,elevationM))*scale/RELIEF_RADIUS_M;}
