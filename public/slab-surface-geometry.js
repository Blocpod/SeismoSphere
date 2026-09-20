const R=6371.0088,rad=Math.PI/180;
export function slabPosition(lon,lat,depth,scale=1){
 if(![lon,lat,depth,scale].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(depth)>6371.0088||scale<=0)throw new Error('Invalid slab coordinates or depth scale.');
 const radius=Math.max(.04,1-depth*scale/R);return [radius*Math.cos(lat*rad)*Math.cos(lon*rad),radius*Math.sin(lat*rad),-radius*Math.cos(lat*rad)*Math.sin(lon*rad)];
}
// Only complete source cells form surfaces. Never connect across masked gaps.
export function slabTriangles(width,height,depths,stride=1){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||depths.length!==width*height||![1,2,4].includes(stride))throw new Error('Invalid slab grid.');
 const triangles=[];
 for(let y=0;y<height-1;y+=stride)for(let x=0;x<width-1;x+=stride){const xx=Math.min(width-1,x+stride),yy=Math.min(height-1,y+stride);let valid=true;for(let row=y;row<=yy&&valid;row++)for(let col=x;col<=xx;col++)if(!Number.isFinite(depths[row*width+col])){valid=false;break;}if(valid){const a=y*width+x,b=y*width+xx,c=yy*width+x,d=yy*width+xx;triangles.push(a,b,c,b,d,c);}}
 return new Uint32Array(triangles);
}
