// The single documented ETOPO DAP2 grid shape, not a general DAP parser.
export function parseReliefDods(buffer){
 const marker=buffer.indexOf('Data:\n');if(marker<0||marker>10000)throw new Error('ETOPO DAP2 data marker missing.');
 const header=buffer.subarray(0,marker).toString('utf8'),shape=header.match(/Float32 z\[lat = (\d+)\]\[lon = (\d+)\]/);if(!shape||!header.includes('Float64 lat[')||!header.includes('Float64 lon['))throw new Error('Unexpected ETOPO grid schema.');
 const height=Number(shape[1]),width=Number(shape[2]);if(width<2||height<2||width*height>4000000)throw new Error('ETOPO subset dimensions are out of bounds.');let offset=marker+6;
 function array(count,size,read){if(offset+8+count*size>buffer.length||buffer.readUInt32BE(offset)!==count||buffer.readUInt32BE(offset+4)!==count)throw new Error('ETOPO DAP2 array count or length mismatch.');offset+=8;const values=size===4?new Float32Array(count):new Float64Array(count);for(let i=0;i<count;i++,offset+=size){const v=buffer[read](offset);if(!Number.isFinite(v))throw new Error('ETOPO non-finite value.');values[i]=v;}return values;}
 const elevations=array(width*height,4,'readFloatBE'),latitudes=array(height,8,'readDoubleBE'),longitudes=array(width,8,'readDoubleBE');if(offset!==buffer.length)throw new Error('Unexpected trailing ETOPO data.');
 for(const [axis,bound]of [[latitudes,90],[longitudes,180]]){const step=axis[1]-axis[0];if(step<=0||axis[0]<-bound||axis.at(-1)>bound)throw new Error('Invalid ETOPO coordinate axis.');for(let i=1;i<axis.length;i++)if(Math.abs(axis[i]-axis[0]-step*i)>1e-8)throw new Error('ETOPO axis is not uniformly spaced.');}
 const packed=Buffer.alloc(elevations.length*2);let minimum=Infinity,maximum=-Infinity,error=0;
 for(let i=0;i<elevations.length;i++){const value=elevations[i];if(value< -12000||value>10000)throw new Error('ETOPO elevation outside the supported range or missing.');const rounded=Math.round(value);packed.writeInt16LE(rounded,i*2);minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);error=Math.max(error,Math.abs(rounded-value));}
 return {width,height,elevations,latitudes,longitudes,packed,minimum,maximum,maximumQuantizationErrorM:error};
}
