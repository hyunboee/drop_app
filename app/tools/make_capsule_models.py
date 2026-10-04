"""타임캡슐 3D 모델(GLB) 생성기.

실행: python app/tools/make_capsule_models.py
결과: app/app/src/main/assets/models/capsule_body.glb (몸통), capsule_lid.glb (뚜껑)
모양: 어두운 원통 몸통 + 둥근 아래 덮개, 금색 띠 두 개와 리벳, 앞면 창("TIME CAPSULE" 글자).
뚜껑은 따로 만들어 앱이 위로 들어 올린다. 원점은 몸통 바닥 가운데, 앞면은 +Z.
"""
import io
import json
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parents[1] / 'app/src/main/assets/models'
R = 0.10  # 반지름(m)
H = 0.24  # 원통 길이(m). 몸통 윗면 높이 = R + H = 0.34m, 뚜껑 포함 전체 약 0.55m


class Mesh:
    def __init__(self):
        self.pos, self.nrm, self.uv, self.idx = [], [], [], []

    def add(self, pos, nrm, uv, tris):
        base = len(self.pos)
        self.pos += [tuple(p) for p in pos]
        self.nrm += [tuple(n) for n in nrm]
        self.uv += [tuple(u) for u in uv]
        for a, b, c in tris:
            # 삼각형 앞면이 법선 쪽을 보도록 감는 방향을 맞춘다
            pa, pb, pc = (np.array(self.pos[base + i]) for i in (a, b, c))
            face = np.cross(pb - pa, pc - pa)
            avg = sum(np.array(self.nrm[base + i]) for i in (a, b, c))
            if np.dot(face, avg) < 0:
                b, c = c, b
            self.idx += [base + a, base + b, base + c]


def grid_tris(rows, cols):
    t = []
    for i in range(rows):
        for j in range(cols):
            a = i * (cols + 1) + j
            b = a + 1
            c = a + cols + 1
            d = c + 1
            t += [(a, c, b), (b, c, d)]
    return t


def sphere(m, center, r, th0, th1, nu=28, nv=10):
    pos, nrm, uv = [], [], []
    for i in range(nv + 1):
        th = th0 + (th1 - th0) * i / nv
        for j in range(nu + 1):
            ph = 2 * math.pi * j / nu
            n = (math.sin(th) * math.sin(ph), math.cos(th), math.sin(th) * math.cos(ph))
            pos.append((center[0] + r * n[0], center[1] + r * n[1], center[2] + r * n[2]))
            nrm.append(n)
            uv.append((j / nu, i / nv))
    m.add(pos, nrm, uv, grid_tris(nv, nu))


def tube(m, r, y0, y1, ph0=0.0, ph1=2 * math.pi, nu=40, uv_flip=True):
    """세로 원통 옆면(바깥 법선). ph는 +Z에서 +X 쪽으로 늘어난다."""
    pos, nrm, uv = [], [], []
    for i in range(2):
        y = y0 if i == 0 else y1
        for j in range(nu + 1):
            ph = ph0 + (ph1 - ph0) * j / nu
            n = (math.sin(ph), 0.0, math.cos(ph))
            pos.append((r * n[0], y, r * n[2]))
            nrm.append(n)
            uv.append((j / nu, (1 - i) if uv_flip else i))
    m.add(pos, nrm, uv, grid_tris(1, nu))


def disc(m, y, r, up=True, nu=40):
    pos = [(0.0, y, 0.0)] + [(r * math.sin(2 * math.pi * j / nu), y, r * math.cos(2 * math.pi * j / nu)) for j in range(nu)]
    n = (0.0, 1.0 if up else -1.0, 0.0)
    tris = [(0, 1 + j, 1 + (j + 1) % nu) for j in range(nu)]
    m.add(pos, [n] * len(pos), [(0.5, 0.5)] * len(pos), tris)


def window_texture():
    w, h = 480, 800
    img = Image.new('RGB', (w, h), (8, 8, 9))
    d = ImageDraw.Draw(img)
    yellow = (240, 175, 70)
    try:
        big = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 64)
    except OSError:
        big = ImageFont.load_default()
    for text, y in (('TIME', 170), ('CAPSULE', 250)):
        tw = d.textlength(text, font=big)
        d.text(((w - tw) / 2, y), text, font=big, fill=yellow)
    # 위치 핀
    cx, cy = w // 2, 420
    d.ellipse((cx - 38, cy - 70, cx + 38, cy + 6), outline=yellow, width=6)
    d.polygon([(cx - 30, cy - 18), (cx + 30, cy - 18), (cx, cy + 56)], outline=yellow)
    d.ellipse((cx - 11, cy - 43, cx + 11, cy - 21), outline=yellow, width=5)
    d.line((cx - 80, 540, cx + 80, 530), fill=yellow, width=5)
    # 무한대 기호
    d.ellipse((cx - 100, 590, cx - 10, 680), outline=yellow, width=8)
    d.ellipse((cx + 10, 590, cx + 100, 680), outline=yellow, width=8)
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue()


def metal_texture(base, scratch, seed, brushed=False, scratches=260, pits=500):
    """긁히고 낡은 금속 질감(색 텍스처)."""
    g = np.random.default_rng(seed)
    size = 512
    noise = g.normal(0, 1, (size, 1 if brushed else size))
    if brushed:
        noise = np.repeat(noise, size, axis=1)
    layer = Image.fromarray(((noise * 0.25 + 0.5).clip(0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    n = (np.asarray(layer, dtype=np.float32) / 255 - 0.5) * 2
    arr = np.stack([np.clip(base[i] * (1 + 0.5 * n), 0, 255) for i in range(3)], axis=-1).astype(np.uint8)
    img = Image.fromarray(arr, 'RGB')
    d = ImageDraw.Draw(img)
    for _ in range(scratches):
        x, y = g.integers(0, size, 2)
        ang = g.uniform(0, math.pi) if not brushed else g.normal(0, 0.08)
        ln = g.integers(15, 130)
        d.line((x, y, x + ln * math.cos(ang), y + ln * math.sin(ang)), fill=scratch, width=1)
    for _ in range(pits):
        x, y = g.integers(0, size, 2)
        r = g.integers(1, 3)
        d.ellipse((x - r, y - r, x + r, y + r), fill=tuple(int(c * 0.45) for c in base))
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue()


def body_meshes():
    dark, copper, steel, frame, inner, win, rivet = (Mesh() for _ in range(7))
    top = R + H
    # 어두운 몸통: 아래 반구 + 원통
    sphere(dark, (0, R, 0), R, math.pi / 2, math.pi)
    tube(dark, R, R, top)
    # 안쪽 바닥(뚜껑을 열면 보이는 주황색)
    disc(inner, top - 0.012, R * 0.99)
    # 구리빛 띠 두 개와 가장자리의 가는 강철 고리
    for y0, y1 in ((top - 0.045, top + 0.004), (R - 0.004, R + 0.045)):
        tube(copper, R * 1.04, y0, y1)
        for ye in (y0 - 0.006, y1 + 0.002):
            tube(steel, R * 1.025, ye, ye + 0.006)
    # 아래쪽 덮개 윗부분의 이중 고리
    for y0 in (R - 0.026, R - 0.017):
        tube(steel, R * 1.015, y0, y0 + 0.006)
    # 리벳: 띠마다 촘촘하게
    for yc in (top - 0.020, R + 0.020):
        for k in range(28):
            ph = 2 * math.pi * k / 28
            c = (R * 1.047 * math.sin(ph), yc, R * 1.047 * math.cos(ph))
            sphere(rivet, c, 0.0045, 0, math.pi, nu=6, nv=4)
    # 앞면 창: 올라온 틀(네 줄) 안에 들어간 글자판
    y_mid = R + H / 2
    hw, hh = 0.50, 0.082          # 글자판 반폭(rad), 반높이(m)
    bw, bh = 0.62, 0.100          # 틀 바깥
    rf = R + 0.008
    tube(frame, rf, y_mid - hh, y_mid + hh, -bw, -hw, nu=3)
    tube(frame, rf, y_mid - hh, y_mid + hh, hw, bw, nu=3)
    tube(frame, rf, y_mid + hh, y_mid + bh, -bw, bw, nu=14)
    tube(frame, rf, y_mid - bh, y_mid - hh, -bw, bw, nu=14)
    tube(win, R + 0.003, y_mid - hh, y_mid + hh, -hw, hw, nu=16)
    # 창 양옆의 세로 띠
    for sgn in (-1, 1):
        tube(steel, R + 0.004, R + 0.06, top - 0.06, sgn * 0.74, sgn * 0.86, nu=3)
    return [(dark, 0), (copper, 1), (steel, 2), (frame, 3), (inner, 4), (win, 5), (rivet, 6)]


def lid_meshes():
    dark, rim = Mesh(), Mesh()
    for y0 in (0.0, 0.014):
        tube(rim, R * 1.005, y0, y0 + 0.008)
    disc(rim, 0.0, R, up=False)
    sphere(dark, (0, 0.026, 0), R * 0.985, 0, math.pi / 2, nv=12)
    tube(dark, R * 0.985, 0.022, 0.026)
    return [(dark, 0), (rim, 2)]


# 텍스처 이름 -> write_glb가 파일마다 번호를 붙인다
MATERIALS = [
    {'name': 'dark', 'tex': 'dark', 'pbr': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.55, 'roughnessFactor': 0.5}},
    {'name': 'copper', 'tex': 'copper', 'pbr': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.7, 'roughnessFactor': 0.4}, 'emissive': [0.10, 0.06, 0.02]},
    {'name': 'steel', 'pbr': {'baseColorFactor': [0.30, 0.30, 0.33, 1], 'metallicFactor': 0.7, 'roughnessFactor': 0.4}},
    {'name': 'frame', 'tex': 'dark', 'pbr': {'baseColorFactor': [0.75, 0.75, 0.8, 1], 'metallicFactor': 0.6, 'roughnessFactor': 0.45}},
    {'name': 'inner', 'pbr': {'baseColorFactor': [0.90, 0.55, 0.24, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.7}, 'emissive': [0.45, 0.24, 0.08]},
    {'name': 'window', 'tex': 'window', 'emissive_tex': 'window', 'pbr': {'metallicFactor': 0.0, 'roughnessFactor': 0.6}},
    {'name': 'rivet', 'pbr': {'baseColorFactor': [0.45, 0.45, 0.48, 1], 'metallicFactor': 0.8, 'roughnessFactor': 0.35}},
]


def build_material(m, names):
    pbr = dict(m['pbr'])
    out = {'name': m['name'], 'doubleSided': True}
    if m.get('tex') in names:
        pbr['baseColorTexture'] = {'index': names.index(m['tex'])}
    elif m.get('tex'):
        pbr['baseColorFactor'] = [0.15, 0.15, 0.16, 1]  # 이 파일에서 쓰이지 않는 재질
    out['pbrMetallicRoughness'] = pbr
    if m.get('emissive'):
        out['emissiveFactor'] = m['emissive']
    if m.get('emissive_tex') in names:
        out['emissiveTexture'] = {'index': names.index(m['emissive_tex'])}
        out['emissiveFactor'] = [1, 1, 1]
    return out


def write_glb(path, parts, textures):
    blob = bytearray()
    views, accessors, prims = [], [], []
    names = list(textures)

    def add_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
        if target:
            v['target'] = target
        blob.extend(data)
        views.append(v)
        return len(views) - 1

    def add_acc(arr, ctype, typ, target, minmax=False):
        a = {'bufferView': add_view(arr.tobytes(), target), 'componentType': ctype, 'count': len(arr), 'type': typ}
        if minmax:
            a['min'] = arr.min(axis=0).tolist()
            a['max'] = arr.max(axis=0).tolist()
        accessors.append(a)
        return len(accessors) - 1

    for mesh, mat in parts:
        pos = np.array(mesh.pos, dtype=np.float32)
        nrm = np.array(mesh.nrm, dtype=np.float32)
        uv = np.array(mesh.uv, dtype=np.float32)
        idx = np.array(mesh.idx, dtype=np.uint32)
        prims.append({
            'attributes': {
                'POSITION': add_acc(pos, 5126, 'VEC3', 34962, True),
                'NORMAL': add_acc(nrm, 5126, 'VEC3', 34962),
                'TEXCOORD_0': add_acc(uv, 5126, 'VEC2', 34962),
            },
            'indices': add_acc(idx, 5125, 'SCALAR', 34963),
            'material': mat,
        })
    doc = {
        'asset': {'version': '2.0', 'generator': 'make_capsule_models.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0}],
        'meshes': [{'primitives': prims}],
        'materials': [build_material(m, names) for m in MATERIALS],
        'accessors': accessors,
    }
    doc['images'] = [{'bufferView': add_view(textures[n]), 'mimeType': 'image/png'} for n in names]
    doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    doc['textures'] = [{'source': k, 'sampler': 0} for k in range(len(names))]
    doc['bufferViews'] = views
    doc['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    blob.extend(b'\0' * (-len(blob) % 4))
    total = 12 + 8 + len(js) + 8 + len(blob)
    out = struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    path.write_bytes(out)
    print(path.name, len(out), 'bytes', sum(len(m.pos) for m, _ in parts), 'vertices')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    dark = metal_texture((38, 35, 34), (110, 104, 96), 1)
    copper = metal_texture((178, 108, 42), (235, 175, 95), 2, brushed=True, scratches=160, pits=200)
    write_glb(OUT / 'capsule_body.glb', body_meshes(), {'dark': dark, 'copper': copper, 'window': window_texture()})
    write_glb(OUT / 'capsule_lid.glb', lid_meshes(), {'dark': dark})
