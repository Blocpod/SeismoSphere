"""Convert the original Slab2 text grids; no interpolation or mask repair."""
from pathlib import Path
import hashlib
import io
import json
import re
import tarfile
import numpy as np

root=Path('data/geology/slab2-volume')
assets=Path('public/assets/slab-surfaces')
assets.mkdir(parents=True,exist_ok=True)
(root/'text').mkdir(parents=True,exist_ok=True)
receipt=json.loads((root/'receipt.json').read_text(encoding='utf-8'))
archive=root/'Slab2Distribute_Mar2018.tar.gz'
sha=lambda b:hashlib.sha256(b).hexdigest()
if sha(archive.read_bytes())!=receipt['sha256']: raise ValueError('Slab2 archive integrity mismatch')
names=dict(alu='Alaska',cal='Calabria',cam='Central America',car='Caribbean',cas='Cascadia',cot='Cotabato',hal='Halmahera',hel='Hellenic Arc',him='Himalaya',hin='Hindu Kush',izu='Izu-Bonin',ker='Kermadec',kur='Kamchatka-Kuril Islands-Japan',mak='Makran',man='Manila Trench',mue='Muertos Trough',pam='Pamir',phi='Philippines',png='New Guinea',puy='Puysegur',ryu='Ryukyu',sam='South America',sco='Scotia Sea',sol='Solomon Islands',sul='Sulawesi',sum='Sumatra-Java',van='Vanuatu')
fields=['dep','unc','dip','str','thk']
pin=Path('config/slab-surfaces.json')
pinned=json.loads(pin.read_text(encoding='utf-8')) if pin.exists() else None
if pinned and receipt!=pinned['source']: raise ValueError('Source receipt differs from the retained application pin')
def save_asset(file,packed,expected):
 if pinned and sha(packed)!=expected: raise ValueError('Converted Slab2 asset differs from its pin: '+file)
 temporary=assets/(file+'.tmp');temporary.write_bytes(packed);temporary.replace(assets/file)
regions=[]
with tarfile.open(archive,'r:gz') as tar:
 members={m.name:m for m in tar.getmembers() if m.isfile()}
 def source(name):
  m=members[name]
  if m.size>100_000_000: raise ValueError('Unexpected source member size')
  data=tar.extractfile(m).read()
  if len(data)!=m.size: raise ValueError('Incomplete source member')
  (root/'text'/Path(name).name).write_bytes(data)
  return data,{'name':name,'bytes':len(data),'sha256':sha(data)}
 for code,name in sorted(names.items()):
  expected=next((r for r in pinned['regions'] if r['id']==code),None) if pinned else None
  arrays=[];sources=[];coordinates=None
  for field in fields:
   matches=[n for n in members if re.search(r'/'+code+'_slab2_'+field+r'_.*\.xyz$',n)]
   if len(matches)!=1: raise ValueError('Missing/ambiguous grid '+code+' '+field)
   raw,ref=source(matches[0]);sources.append(ref)
   data=np.loadtxt(io.BytesIO(raw),delimiter=',')
   if data.ndim!=2 or data.shape[1]!=3 or not np.isfinite(data[:,:2]).all(): raise ValueError('Invalid XYZ grid')
   if coordinates is None:
    coordinates=data[:,:2].copy();lon=np.unique(coordinates[:,0]);lat=np.unique(coordinates[:,1]);w,h=len(lon),len(lat)
    step=round(float(lon[1]-lon[0]),8)
    if w*h!=len(data) or w<2 or h<2 or not 0<step<=1 or not np.allclose(np.diff(lon),step,atol=1e-7) or not np.allclose(np.diff(lat),step,atol=1e-7): raise ValueError('Nonregular Slab2 grid')
    order=np.lexsort((coordinates[:,0],coordinates[:,1]));xy=coordinates[order]
    if not np.allclose(xy[:,0],np.tile(lon,h)) or not np.allclose(xy[:,1],np.repeat(lat,w)): raise ValueError('Duplicated/missing grid coordinates')
   elif not np.array_equal(coordinates,data[:,:2]): raise ValueError('Mismatched source field coordinates')
   values=data[order,2]
   if np.isinf(values).any(): raise ValueError('Infinite source value')
   if field=='dep': values=-values
   finite=values[np.isfinite(values)]
   if (field=='dep' and not len(finite)) or (len(finite) and ((field!='dep' and finite.min()<0) or (field=='dep' and np.abs(finite).max()>6371))): raise ValueError('Invalid source '+field)
   arrays.append(values)
  cells=np.stack(arrays,axis=1).astype('<f4');packed=cells.tobytes();path=code+'.bin';save_asset(path,packed,expected['sha256'] if expected else None)
  region={'id':code,'name':name,'width':w,'height':h,'longitudeStart':float(lon[0]),'latitudeStart':float(lat[0]),'step':step,'gridFile':path,'sha256':sha(packed),'bytes':len(packed),'validNodes':int(np.isfinite(cells[:,0]).sum()),'aboveDatumNodes':int((cells[:,0]<0).sum()),'minimumDepthKm':float(np.nanmin(cells[:,0])),'maximumDepthKm':float(np.nanmax(cells[:,0])),'sourceFiles':sources,'supplement':None}
  supplementary=[n for n in members if re.search(r'/'+code+r'_slab2_sup_.*\.csv$',n)]
  if len(supplementary)>1: raise ValueError('Ambiguous supplement')
  if supplementary:
   raw,ref=source(supplementary[0]);header=raw.splitlines()[0].decode('utf-8').strip()
   if header!='lon,lat,depth,strike,dip,dz1,dz2,dz3,thickness': raise ValueError('Unknown supplementary fields')
   data=np.loadtxt(io.BytesIO(raw),delimiter=',',skiprows=1,ndmin=2)
   if data.shape[1]!=9 or not np.isfinite(data[:,:5]).all() or np.isinf(data).any() or np.any(np.abs(data[:,1])>90) or np.any(data[:,2]<0): raise ValueError('Invalid supplementary nodes')
   packed=data.astype('<f4').tobytes();path=code+'-supplement.bin';save_asset(path,packed,expected['supplement']['sha256'] if expected else None);region['supplement']={'file':path,'sha256':sha(packed),'bytes':len(packed),'count':len(data),'source':ref}
  regions.append(region);print(code,region['validNodes'],'valid grid nodes',flush=True)
metadata={'schema':'seismosphere.slab-surfaces.v1','source':receipt,'citation':'Hayes, G. (2018), Slab2 — A Comprehensive Subduction Zone Geometry Model, USGS data release','doi':'https://doi.org/10.5066/F7PV6JNV','publication':'https://doi.org/10.1126/science.aat4723','license':'CC0 1.0','gridEncoding':'Float32 little-endian; rows south to north; columns west to east; five interleaved fields: depth km positive down, PDF depth standard deviation km, dip degrees, strike degrees, thickness km. NaN remains masked.','supplementEncoding':'Float32 little-endian: lon,lat,depth,strike,dip,dz1,dz2,dz3,thickness; source positive depth retained.','limitations':['Static published model, not a measured slab boundary or a live observation.','Grid spacing is retained per region from actual XYZ coordinates; connecting valid adjacent nodes is a display interpolation.','Four overturned regions also require separate supplied nodes; they are not flattened into a single depth grid.','Negative signed depth values in the source are retained above the reference radius, not repaired into zero.', 'Depth uncertainty is the source PDF standard deviation, not slab thickness or a calibrated confidence interval.','Heights are placed radially on a mean-radius sphere.'],'regions':regions}
encoded=json.dumps(metadata,ensure_ascii=False,allow_nan=False,indent=2)
pin=Path('config/slab-surfaces.json')
if pin.exists() and json.loads(pin.read_text(encoding='utf-8'))!=metadata: raise ValueError('Converted Slab2 differs from its pin; review source or converter changes')
(assets/'metadata.json').write_text(encoded,encoding='utf-8')
if not pin.exists(): pin.write_text(encoded,encoding='utf-8')
print('Saved',len(regions),'regional source grids')
