const RAD=Math.PI/180;
export function lowerHemisphere(x,y){const r2=x*x+y*y;if(r2>1+1e-12)return null;const scale=Math.sqrt(2-Math.min(1,r2));return {north:-y*scale,east:x*scale,down:1-Math.min(1,r2)};}
export function radiation(t,{north,east,down}){const r=-down,s=-north,p=east;return t.mrr*r*r+t.mtt*s*s+t.mpp*p*p+2*(t.mrt*r*s+t.mrp*r*p+t.mtp*s*p);}
export function nodalBasis({strike,dip}){const a=strike*RAD,d=dip*RAD,s=[Math.cos(a),Math.sin(a),0],v=[-Math.sin(a)*Math.cos(d),Math.cos(a)*Math.cos(d),Math.sin(d)];return {strike:s,downDip:v,normal:[-s[1]*v[2],s[0]*v[2],s[1]*v[0]-s[0]*v[1]]};}
export function nedToEarth(vector,{lat,lon}){const a=lat*RAD,b=lon*RAD,n=[-Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)],e=[-Math.sin(b),0,-Math.cos(b)],d=[-Math.cos(a)*Math.cos(b),-Math.sin(a),Math.cos(a)*Math.sin(b)];return n.map((_,i)=>vector[0]*n[i]+vector[1]*e[i]+vector[2]*d[i]);}
export function planeTensor(plane){const {normal:n,strike:s,downDip:d}=nodalBasis(plane),r=plane.rake*RAD,slip=s.map((v,i)=>v*Math.cos(r)-d[i]*Math.sin(r)),m=(i,j)=>slip[i]*n[j]+n[i]*slip[j];return {mrr:m(2,2),mtt:m(0,0),mpp:m(1,1),mrt:m(2,0),mrp:-m(2,1),mtp:-m(0,1)};}
