import copy
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'model'))
from stress import calculate, receiver_basis, resolve_stress, hs, np

ref = json.loads(Path('test/fixtures/cutde-halfspace.json').read_text(encoding='utf-8'))
actual = hs.strain_free(np.array(ref['points']), np.array([ref['triangle']]), np.array([ref['slip']]), ref['poisson'])
np.testing.assert_allclose(actual, ref['strain'], atol=1e-10, rtol=1e-8)
patch = dict(xStartKm=0,yStartKm=-5,xEndKm=0,yEndKm=5,topKm=1,bottomKm=8,dipDeg=45,rakeDeg=90,slipM=1,kode=100)
data = dict(model={'patches':[patch]},points=[{'xKm':15,'yKm':12,'depthKm':0},{'xKm':-10,'yKm':7,'depthKm':6},{'xKm':0,'yKm':0,'depthKm':1}],poisson=.25,shearModulusGPa=32,friction=.4,receiver={'strike':0,'dip':45,'rake':90})
base = calculate(data)
assert base['excludedCount'] == 1 and base['values'][2] is None
np.testing.assert_allclose(np.array(base['values'][0]['tensorPa'])[[2,4,5]],0,atol=1e-6)
for factor, key in [(2,'shearModulusGPa'),(2,'slipM')]:
    changed=copy.deepcopy(data)
    if key=='slipM': changed['model']['patches'][0][key]*=factor
    else: changed[key]*=factor
    result=calculate(changed)
    for i in [0,1]: np.testing.assert_allclose(result['values'][i]['tensorPa'],np.array(base['values'][i]['tensorPa'])*factor,atol=1e-8,rtol=1e-10)
changed=copy.deepcopy(data);changed['model']['patches'][0]['rakeDeg']=-90
reverse=calculate(changed)
np.testing.assert_allclose(reverse['values'][1]['tensorPa'],-np.array(base['values'][1]['tensorPa']),atol=1e-8)
changed['model']['patches'][0]['slipM']=0
np.testing.assert_allclose(calculate(changed)['values'][1]['tensorPa'],0,atol=1e-8)
# Analytic tensor traction: east-facing vertical plane, northward rake.
n,s=receiver_basis(0,90,0)
shear,normal,cfs=resolve_stress(np.array([[10.,20.,30.,4.,5.,6.]]),n,s,.4)
np.testing.assert_allclose([shear[0],normal[0],cfs[0]],[4,10,8],atol=1e-12)
for invalid in [dict(data,friction=2),dict(data,poisson=.5),dict(data,points=[]),dict(data,shearModulusGPa=True)]:
    try: calculate(invalid)
    except ValueError: pass
    else: raise AssertionError('Invalid scientific input accepted')
print(json.dumps({'referencePassed':True,'surfaceTractionPassed':True,'scalingAndSignsPassed':True,'maskPassed':True,'solverVersion':base['solverVersion']}))
