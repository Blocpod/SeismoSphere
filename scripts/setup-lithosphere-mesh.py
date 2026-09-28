"""Triangulate source tessellation directions for display, retaining node values."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.spatial import ConvexHull
metadata=json.loads(Path('config/litho1.json').read_text())
raw=Path('public/assets/litho1/nodes.f32').read_bytes()
assert hashlib.sha256(raw).hexdigest()==metadata['sha256']
rows=np.frombuffer(raw,dtype='<f4').reshape(-1,39)
lat=np.deg2rad(rows[:,0].astype(float));lon=np.deg2rad(rows[:,2].astype(float))
xyz=np.column_stack([np.cos(lat)*np.cos(lon),np.sin(lat),-np.cos(lat)*np.sin(lon)])
faces=np.sort(ConvexHull(xyz).simplices,axis=1)
faces=faces[np.lexsort((faces[:,2],faces[:,1],faces[:,0]))].astype('<u4')
assert len(faces)==2*len(rows)-4
edges=np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[0,2]]]),axis=1)
_,counts=np.unique(edges,axis=0,return_counts=True)
assert np.all(counts==2)
max_angle=np.rad2deg(np.arccos(np.clip(np.sum(xyz[edges[:,0]]*xyz[edges[:,1]],axis=1),-1,1))).max()
assert max_angle<2
packed=faces.tobytes();Path('public/assets/litho1/faces.u32').write_bytes(packed)
metadata['mesh']={'file':'faces.u32','triangles':len(faces),'bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest(),'maxEdgeDegrees':float(max_angle),'method':'Convex hull of source unit directions. Faceted display interpolation between original nodes; not the author interpolator or a measured boundary.'}
Path('public/assets/litho1/metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(f'{len(rows)} nodes; {len(faces)} triangles; closed manifold; maximum edge {max_angle:.5f} degrees')
