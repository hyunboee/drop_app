"""몸통과 뚜껑이 한 파일에 든 캡슐 GLB를 앱이 쓰는 두 파일로 나눈다.

실행: python app/tools/split_capsule_glb.py <원본.glb> [이름]
결과: app/app/src/main/assets/models/<이름>_body.glb, <이름>_lid.glb (이름을 안 주면 capsule)
예: python app/tools/split_capsule_glb.py time_capsule_diamond.glb capsule_diamond
원본에 'Body'와 'Lid'라는 이름의 노드가 따로 있어야 한다. 뚜껑 노드의 위치 이동은 지워서
뚜껑의 원점이 뚜껑 바닥 가운데가 되게 한다(앱이 뚜껑을 몸통 위에 얹고 들어 올린다).
각 파일에는 그 부분이 쓰는 메시·재질·텍스처만 남긴다.
"""
import json
import struct
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'app/src/main/assets/models'
# 몸통 표면과 거의 붙어 있는 얇은 면(글자판 1mm, 유리)은 깊이 값이 겹쳐 깜빡이거나 가려질 수 있어
# 법선 방향으로 조금 띄운다(m). 유리는 글자판보다 앞에 둔다
LIFT = {'label': 0.003, 'glass': 0.004}
# 앱의 AR 화면에서 반투명(BLEND) 유리가 불투명한 검은 판처럼 그려져 글자판을 가리는 것으로 보여 뺀다
DROP = {'glass'}
# 앱(Filament)이 지원하지 않는 재질 확장은 뺀다. 지원하는 것(ior 등)은 남긴다
UNSUPPORTED_EXTENSIONS = {'KHR_materials_iridescence'}
TEX_KEYS = ('baseColorTexture', 'metallicRoughnessTexture', 'normalTexture', 'occlusionTexture', 'emissiveTexture')


def read_glb(path):
    b = Path(path).read_bytes()
    off, doc, blob = 12, None, None
    while off < len(b):
        length, kind = struct.unpack('<II', b[off:off + 8])
        data = b[off + 8:off + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(data)
        elif kind == 0x004E4942:
            blob = data
        off += 8 + length
    return doc, bytearray(blob)


def texture_infos(material):
    for key in ('normalTexture', 'occlusionTexture', 'emissiveTexture'):
        if key in material:
            yield material[key]
    pbr = material.get('pbrMetallicRoughness', {})
    for key in ('baseColorTexture', 'metallicRoughnessTexture'):
        if key in pbr:
            yield pbr[key]


def lift_thin_surfaces(doc, blob, mesh):
    import numpy as np
    for prim in mesh['primitives']:
        name = doc['materials'][prim['material']].get('name')
        if name not in LIFT:
            continue
        pos, nrm = doc['accessors'][prim['attributes']['POSITION']], doc['accessors'][prim['attributes']['NORMAL']]
        def view(acc):
            bv = doc['bufferViews'][acc['bufferView']]
            return np.frombuffer(blob, np.float32, acc['count'] * 3, bv.get('byteOffset', 0) + acc.get('byteOffset', 0)).reshape(-1, 3)
        p, n = view(pos), view(nrm)
        p += n * LIFT[name]  # blob이 bytearray라 원본 버퍼가 그대로 바뀐다
        pos['min'], pos['max'] = p.min(axis=0).tolist(), p.max(axis=0).tolist()


def extract(doc, blob, node_name, path):
    node = next(n for n in doc['nodes'] if n.get('name') == node_name)
    mesh = json.loads(json.dumps(doc['meshes'][node['mesh']]))
    lift_thin_surfaces(doc, blob, mesh)
    mesh['primitives'] = [p for p in mesh['primitives'] if doc['materials'][p['material']].get('name') not in DROP]

    # 쓰이는 접근자·재질을 모은다
    acc_used = sorted({a for p in mesh['primitives'] for a in [*p['attributes'].values(), p['indices']]})
    mat_used = sorted({p['material'] for p in mesh['primitives']})
    materials = [json.loads(json.dumps(doc['materials'][m])) for m in mat_used]
    for m in materials:
        if m.get('name') == 'label':
            # AR 화면은 주변이 어두우면 조명이 약해 글자가 묻힌다. 글자판은 조명을 받지 않고 이미지 색 그대로 보이게 한다
            m['extensions'] = {'KHR_materials_unlit': {}}
            m.pop('emissiveTexture', None)
            m.pop('emissiveFactor', None)
    tex_used = sorted({ti['index'] for m in materials for ti in texture_infos(m)})
    textures = [json.loads(json.dumps(doc['textures'][t])) for t in tex_used]
    img_used = sorted({t['source'] for t in textures})
    samplers_used = sorted({t['sampler'] for t in textures if 'sampler' in t})

    # 번호를 새로 붙인다
    acc_map = {a: i for i, a in enumerate(acc_used)}
    mat_map = {m: i for i, m in enumerate(mat_used)}
    tex_map = {t: i for i, t in enumerate(tex_used)}
    img_map = {i: k for k, i in enumerate(img_used)}
    smp_map = {s: k for k, s in enumerate(samplers_used)}
    for p in mesh['primitives']:
        p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
        p['indices'] = acc_map[p['indices']]
        p['material'] = mat_map[p['material']]
    for m in materials:
        for ti in texture_infos(m):
            ti['index'] = tex_map[ti['index']]
    for t in textures:
        t['source'] = img_map[t['source']]
        if 'sampler' in t:
            t['sampler'] = smp_map[t['sampler']]
    images = [json.loads(json.dumps(doc['images'][i])) for i in img_used]

    # 쓰이는 버퍼 조각만 새 버퍼로 옮긴다
    old_views = sorted({doc['accessors'][a]['bufferView'] for a in acc_used} | {i['bufferView'] for i in images})
    view_map, views, out = {}, [], bytearray()
    for v in old_views:
        bv = dict(doc['bufferViews'][v])
        while len(out) % 4:
            out.append(0)
        data = blob[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        view_map[v] = len(views)
        bv['byteOffset'] = len(out)
        bv['buffer'] = 0
        views.append(bv)
        out.extend(data)
    accessors = []
    for a in acc_used:
        acc = dict(doc['accessors'][a])
        acc['bufferView'] = view_map[acc['bufferView']]
        accessors.append(acc)
    for i in images:
        i['bufferView'] = view_map[i['bufferView']]

    new = {
        'asset': {'version': '2.0', 'generator': 'split_capsule_glb.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': node_name, 'mesh': 0}],  # 위치 이동(translation)은 일부러 뺀다
        'meshes': [mesh],
        'materials': materials,
        'textures': textures,
        'images': images,
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': len(out)}],
    }
    for m in materials:
        for name in UNSUPPORTED_EXTENSIONS:
            m.get('extensions', {}).pop(name, None)
        if m.get('extensions') == {}:
            m.pop('extensions')
    used = sorted({name for m in materials for name in m.get('extensions', {})})
    if used:
        new['extensionsUsed'] = used
    if samplers_used:
        new['samplers'] = [doc['samplers'][s] for s in samplers_used]
    js = json.dumps(new, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    out.extend(b'\0' * (-len(out) % 4))
    total = 12 + 8 + len(js) + 8 + len(out)
    glb = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
    glb += struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    Path(path).write_bytes(glb)
    print(Path(path).name, f'{len(glb) / 1024:.0f}KB', f'메시 조각 {len(mesh["primitives"])}개', f'재질 {len(materials)}개', f'텍스처 {len(textures)}개')
    return node


if __name__ == '__main__':
    doc, blob = read_glb(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    name = sys.argv[2] if len(sys.argv) > 2 else 'capsule'
    body = extract(doc, blob, 'Body', OUT / f'{name}_body.glb')
    lid = extract(doc, blob, 'Lid', OUT / f'{name}_lid.glb')
    print('뚜껑이 몸통 위에 놓이던 높이(m):', lid.get('translation', [0, 0, 0])[1])
