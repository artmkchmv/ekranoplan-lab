import bpy, bmesh, math, os, sys, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(os.path.dirname(__file__), '..', 'models')
os.makedirs(OUT, exist_ok=True)


def V(x, y, z):
    return Vector((x, -z, y))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hex_color, rough=0.5, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    h = hex_color.lstrip('#')
    rgb = [srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return m


def pchip(points):
    xs = [p[0] for p in points]; ys = [p[1] for p in points]
    n = len(xs)
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        m[i] = 0.0 if d[i - 1] * d[i] <= 0 else 2 / (1 / d[i - 1] + 1 / d[i])

    def f(x):
        if x <= xs[0]: return ys[0]
        if x >= xs[-1]: return ys[-1]
        i = max(k for k in range(n - 1) if xs[k] <= x)
        h = xs[i + 1] - xs[i]; t = (x - xs[i]) / h
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t
        h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
        return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]
    return f


def outward(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)


def new_object(name, bm, mats, smooth=True):
    outward(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def bake_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data; ob.data = me; bpy.data.meshes.remove(old)
    for p in me.polygons: p.use_smooth = True


def hull(name, P, mats, stations=96):
    xs = [-0.5 + (1 - math.cos(math.pi * i / (stations - 1))) / 2 for i in range(stations)]
    xs[0] += 0.002; xs[-1] -= 0.002
    bm = bmesh.new()
    rings = []
    for x in xs:
        k, c, s, t, w = P['keel'](x), P['chine'](x), P['side'](x), P['top'](x), max(P['hw'](x), 0.0015)
        c = max(c, k + 0.0005); s = max(s, c + 0.0005); t = max(t, s + 0.0005)
        half = [(0.0, k), (w * 0.55, k + (c - k) * 0.55), (w, c)] + [(w, c + (s - c) * j / 7) for j in range(1, 8)]
        for j in range(1, 9):
            th = math.pi / 2 * j / 8
            half.append((w * math.cos(th) ** (2 / 2.6), s + (t - s) * math.sin(th) ** (2 / 2.6)))
        half[-1] = (0.0, t)
        full = half + [(-z, y) for (z, y) in reversed(half[1:-1])]
        rings.append([bm.verts.new(V(x, y, z)) for (z, y) in full])
    n = len(rings[0])
    crease_edges = []
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    for r, sgn in ((rings[0], -1), (rings[-1], 1)):
        ctr = bm.verts.new(sum((v.co for v in r), Vector()) / n)
        for j in range(n):
            f = bm.faces.new((r[j], r[(j + 1) % n], ctr) if sgn > 0 else (r[(j + 1) % n], r[j], ctr))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cl = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for a, b in zip(rings[:-1], rings[1:]):
        for j in (2, n - 2):
            e = bm.edges.get((a[j], b[j]))
            if e: e[cl] = 0.85
    ob = new_object(name, bm, mats)
    mod = ob.modifiers.new('sub', 'SUBSURF'); mod.levels = 1; mod.render_levels = 1
    bake_modifiers(ob)
    me = ob.data
    W = P.get('windows')
    for p in me.polygons:
        co = p.center; x, y, z = co.x, co.z, -co.y
        k, c, t, w = P['keel'](x), P['chine'](x), P['top'](x), P['hw'](x)
        hgt = max(t - k, 1e-6); f = (y - k) / hgt
        idx = 0
        if y < P.get('wl', 0.03): idx = 1
        elif P.get('stripe') and P['stripe'][0] < x < P['stripe'][1] and 0.35 < f < 0.43: idx = 2
        if P.get('cockpit'):
            x0, x1, fy = P['cockpit']
            if x0 < x < x1 and f > fy and p.normal.x > -0.2 and abs(z) < w * 0.97: idx = 3
        if W:
            x0, x1, pitch, f0, f1 = W
            if x0 < x < x1 and f0 < f < f1 and ((x - x0) / pitch) % 1 < 0.42 and abs(z) > w * 0.75: idx = 3
        p.material_index = idx
    bmv = bmesh.new(); bmv.from_mesh(me)
    assert bmv.calc_volume(signed=True) > 0, 'корпус вывернут наизнанку: ' + name
    bmv.free()
    return ob


def naca(n=12):
    pts = []
    for i in range(n + 1):
        xc = (1 - math.cos(math.pi * i / n)) / 2
        yt = 5 * (0.2969 * math.sqrt(xc) - 0.1260 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4)
        pts.append((xc, yt))
    upper = pts; lower = [(x, -y) for (x, y) in reversed(pts[1:-1])]
    return upper + lower


def surface(name, sections, thick, mat, vertical):
    prof = naca()
    bm = bmesh.new(); rings = []
    for (xl, up, lat, ch) in sections:
        ring = []
        for (u, tv) in prof:
            x = xl - u * ch; d = tv * thick * ch
            ring.append(bm.verts.new(V(x, up, lat + d) if vertical else V(x, up + d, lat)))
        rings.append(ring)
    n = len(prof)
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    for r in (rings[0], rings[-1]):
        bm.faces.new(r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm, [mat])


def fin_and_stab(P, mat, stab_mat=None):
    x_te0, cr, ct, H, base, sweep = P['fin']
    secs = []
    for i in range(5):
        f = i / 4
        up = base + (H - base) * f
        ch = cr + (ct - cr) * f
        xl = x_te0 + sweep * f * 0.35 + ch
        secs.append((xl, up, 0.0, ch))
    fin = surface('fin', secs, 0.12, mat, True)
    span, sc_r, sc_t, sweep_s, x_stab = P['stab']
    top = H
    secs = []
    for lat in (-span / 2, -span * 0.25, 0.0, span * 0.25, span / 2):
        f = abs(lat) / (span / 2)
        ch = sc_r + (sc_t - sc_r) * f
        secs.append((x_stab - sweep_s * f, top + 0.003 * f, lat, ch))
    stab = surface('stab', secs, 0.10, stab_mat or mat, False)
    return [fin, stab]


def lathe(name, prof, mat, pos, seg=28, closed_front=True, closed_back=True):
    bm = bmesh.new(); rings = []
    for (x, r) in prof:
        rings.append([bm.verts.new(V(pos[0] + x, pos[1] + r * math.sin(2 * math.pi * j / seg), pos[2] + r * math.cos(2 * math.pi * j / seg))) for j in range(seg)])
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(seg):
            bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    if closed_front: bm.faces.new(rings[0])
    if closed_back: bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm, [mat])


def turbofan(name, pos, L, r, m_body, m_dark):
    prof = [(L * 0.5, r * 0.82), (L * 0.49, r * 0.97), (L * 0.44, r), (-L * 0.25, r * 0.95), (-L * 0.5, r * 0.7)]
    body = lathe(name, prof, m_body, pos)
    intake = lathe(name + '_in', [(L * 0.501, r * 0.8), (L * 0.5, 0.0001)], m_dark, pos, closed_front=False, closed_back=False)
    noz = lathe(name + '_noz', [(-L * 0.5, r * 0.7), (-L * 0.56, r * 0.55), (-L * 0.561, 0.0001)], m_dark, pos, closed_front=False, closed_back=False)
    return [body, intake, noz]


def propeller(name, pos, R, blades, m, twist=0.5, hub=None, hub_mat=None):
    bm = bmesh.new()
    for k in range(blades):
        a0 = 2 * math.pi * k / blades
        secs = []
        for i in range(6):
            rr = R * (0.18 + 0.82 * i / 5)
            ch = R * (0.16 - 0.09 * i / 5)
            pitch = twist * (1 - 0.6 * i / 5)
            ring = []
            for (u, tv) in naca(6):
                cx = (u - 0.35) * ch; cy = tv * 0.12 * ch
                px = -math.sin(pitch) * cx + math.cos(pitch) * cy
                pt = math.cos(pitch) * cx + math.sin(pitch) * cy
                ring.append((px, rr, pt))
            secs.append(ring)
        vs = []
        for ring in secs:
            row = []
            for (px, rr, pt) in ring:
                up = rr * math.sin(a0) + pt * math.cos(a0)
                lat = rr * math.cos(a0) - pt * math.sin(a0)
                row.append(bm.verts.new(V(px, up, lat)))
            vs.append(row)
        n = len(vs[0])
        for a, b in zip(vs[:-1], vs[1:]):
            for j in range(n):
                bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
        bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object(name, bm, [m])
    ob.location = V(*pos)
    out = [ob]
    if hub:
        sp = lathe(name + '_spinner', [(hub * 1.6, 0.0001), (hub * 1.2, hub * 0.6), (hub * 0.5, hub * 0.95), (-hub * 0.6, hub)], hub_mat or m, (0, 0, 0), closed_front=False)
        sp.parent = ob
    return out


def duct(name, pos, R, chord, m):
    seg = 40; prof = naca(10)
    bm = bmesh.new(); rings = []
    for j in range(seg):
        a = 2 * math.pi * j / seg
        ring = []
        for (u, tv) in prof:
            x = chord * (0.5 - u); r = R + tv * 0.14 * chord * 1.0 + 0.02 * chord
            ring.append(bm.verts.new(V(pos[0] + x, pos[1] + r * math.sin(a), pos[2] + r * math.cos(a))))
        rings.append(ring)
    n = len(prof)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm, [m])


def bake_ao(objs, dist, rays=40):
    bpy.context.view_layer.update()
    verts, polys, off = [], [], 0
    for ob in objs:
        mw = ob.matrix_world
        verts += [mw @ v.co for v in ob.data.vertices]
        polys += [[i + off for i in p.vertices] for p in ob.data.polygons]
        off += len(ob.data.vertices)
    tree = BVHTree.FromPolygons(verts, polys)
    rnd = random.Random(7)
    dirs = []
    for i in range(rays):
        u, v = (i + 0.5) / rays, rnd.random()
        r = math.sqrt(u); th = 2 * math.pi * v
        dirs.append((r * math.cos(th), r * math.sin(th), math.sqrt(1 - u)))
    for ob in objs:
        me = ob.data
        mw = ob.matrix_world; nm = mw.to_3x3().inverted().transposed()
        attr = me.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
        for v in me.vertices:
            n = (nm @ v.normal).normalized()
            t = n.orthogonal().normalized(); b = n.cross(t)
            o = mw @ v.co + n * dist * 0.03
            hit = 0.0
            for (dx, dy, dz) in dirs:
                d = t * dx + b * dy + n * dz
                loc, _, _, dd = tree.ray_cast(o, d, dist)
                if loc is not None: hit += 1 - dd / dist
            ao = 1 - 0.9 * hit / rays
            attr.data[v.index].color = (ao, ao, ao, 1)
        me.color_attributes.active_color = attr
        me.color_attributes.render_color_index = 0


def tbl(*pts): return pchip(list(pts))


def craft_oros():
    M = dict(hull=material('hull', '#f2f4f6', 0.55, 0.0), bottom=material('bottom', '#3a4552', 0.5),
             accent=material('accent', '#c8322e', 0.45), glass=material('glass', '#1d2a38', 0.08, 0.6),
             dark=material('dark', '#2a3038', 0.45, 0.3), metal=material('metal', '#b9c0c7', 0.3, 0.8))
    P = dict(
        keel=tbl((-0.5, 0.05), (-0.36, 0.012), (0.0, 0.0), (0.3, 0.0), (0.44, 0.02), (0.5, 0.06)),
        chine=tbl((-0.5, 0.06), (-0.36, 0.024), (0.0, 0.014), (0.3, 0.014), (0.44, 0.035), (0.5, 0.068)),
        side=tbl((-0.5, 0.075), (-0.3, 0.06), (0.0, 0.055), (0.3, 0.055), (0.45, 0.06), (0.5, 0.07)),
        top=tbl((-0.5, 0.095), (-0.3, 0.1), (0.05, 0.115), (0.25, 0.12), (0.38, 0.11), (0.47, 0.085), (0.5, 0.072)),
        hw=tbl((-0.5, 0.004), (-0.42, 0.022), (-0.2, 0.034), (0.15, 0.036), (0.38, 0.032), (0.47, 0.018), (0.5, 0.003)),
        stripe=(-0.42, 0.46), cockpit=(0.3, 0.44, 0.58), windows=(0.0, 0.26, 0.05, 0.52, 0.68),
        fin=(-0.5, 0.17, 0.09, 0.266, 0.09, 0.05), stab=(0.4 * 1.0, 0.07, 0.05, 0.02, -0.5 + 0.09 + 0.005))
    objs = [hull('hull', P, [M['hull'], M['bottom'], M['accent'], M['glass']])]
    objs += fin_and_stab(P, M['hull'], M['accent'])
    cs = 0.43 * 1.0; cc = 0.1
    can = surface('canard', [(0.41, 0.075, lat, cc) for lat in (-cs / 2, 0, cs / 2)], 0.10, M['accent'], False)
    objs.append(can)
    props = []
    for s in (-1, 1):
        objs += turbofan_like_nacelle('nac%d' % s, (0.34, 0.09, s * 0.14), 0.09, 0.012, M['accent'])
        props += propeller('prop_c%d' % (1 if s > 0 else 2), (0.392, 0.09, s * 0.14), 0.032, 2, M['dark'], 0.55, 0.008, M['metal'])
    objs += turbofan_like_nacelle('nac_t', (-0.3, 0.14, 0.0), 0.11, 0.016, M['accent'])
    objs.append(surface('pylon_t', [(-0.27, 0.10, 0, 0.06), (-0.275, 0.13, 0, 0.05)], 0.14, M['hull'], True))
    props += propeller('prop_t', (-0.243, 0.14, 0.0), 0.05, 2, M['dark'], 0.55, 0.011, M['metal'])
    return objs, props


def turbofan_like_nacelle(name, pos, L, r, m):
    prof = [(L * 0.5, r * 0.45), (L * 0.45, r * 0.85), (L * 0.3, r), (-L * 0.2, r * 0.95), (-L * 0.5, r * 0.25)]
    return [lathe(name, prof, m, pos)]


def craft_volga2():
    M = dict(hull=material('hull', '#eef1f4', 0.55, 0.0), bottom=material('bottom', '#24456b', 0.5),
             accent=material('accent', '#2f6fb3', 0.45), glass=material('glass', '#1b2836', 0.08, 0.6),
             dark=material('dark', '#2a3038', 0.45, 0.3), metal=material('metal', '#c3c9cf', 0.3, 0.8))
    P = dict(
        keel=tbl((-0.5, 0.07), (-0.3, 0.015), (0.0, 0.0), (0.25, 0.0), (0.42, 0.03), (0.5, 0.1)),
        chine=tbl((-0.5, 0.08), (-0.3, 0.035), (0.0, 0.025), (0.25, 0.025), (0.42, 0.05), (0.5, 0.11)),
        side=tbl((-0.5, 0.11), (-0.3, 0.12), (0.0, 0.13), (0.3, 0.13), (0.45, 0.12), (0.5, 0.12)),
        top=tbl((-0.5, 0.14), (-0.25, 0.165), (0.05, 0.19), (0.25, 0.2), (0.38, 0.185), (0.47, 0.15), (0.5, 0.13)),
        hw=tbl((-0.5, 0.05), (-0.38, 0.09), (-0.1, 0.11), (0.2, 0.11), (0.4, 0.095), (0.48, 0.055), (0.5, 0.015)),
        stripe=(-0.45, 0.48), cockpit=(0.3, 0.44, 0.66), windows=(-0.05, 0.18, 0.06, 0.62, 0.74),
        fin=(-0.5, 0.2, 0.12, 0.273, 0.18, 0.04), stab=(0.45 * 8 / 11, 0.09, 0.06, 0.02, -0.5 + 0.12 + 0.005))
    objs = [hull('hull', P, [M['hull'], M['bottom'], M['accent'], M['glass']])]
    objs += fin_and_stab(P, M['hull'], M['accent'])
    props = []
    for s in (-1, 1):
        c = (0.2, 0.24, s * 0.075)
        objs.append(duct('duct%d' % s, c, 0.05, 0.06, M['accent']))
        objs.append(surface('pylon%d' % s, [(0.215, 0.16, s * 0.075, 0.06), (0.215, 0.192, s * 0.075, 0.05)], 0.14, M['hull'], True))
        objs += [lathe('fanhub%d' % s, [(0.03, 0.0001), (0.02, 0.01), (-0.03, 0.012), (-0.05, 0.004)], M['dark'], c)]
        props += propeller('prop_f%d' % (1 if s > 0 else 2), (c[0] + 0.012, c[1], c[2]), 0.046, 5, M['metal'], 0.6)
    return objs, props


def craft_orlyonok():
    M = dict(hull=material('hull', '#9aa6b0', 0.5, 0.15), bottom=material('bottom', '#3c4852', 0.55),
             accent=material('accent', '#55616b', 0.5, 0.2), glass=material('glass', '#16212c', 0.08, 0.6),
             dark=material('dark', '#262c33', 0.45, 0.3), metal=material('metal', '#8d969e', 0.35, 0.7))
    P = dict(
        keel=tbl((-0.5, 0.06), (-0.38, 0.02), (-0.1, 0.0), (0.3, 0.0), (0.45, 0.02), (0.5, 0.055)),
        chine=tbl((-0.5, 0.07), (-0.38, 0.032), (-0.1, 0.015), (0.3, 0.015), (0.45, 0.035), (0.5, 0.062)),
        side=tbl((-0.5, 0.085), (-0.3, 0.075), (0.0, 0.075), (0.35, 0.075), (0.46, 0.07), (0.5, 0.07)),
        top=tbl((-0.5, 0.11), (-0.35, 0.13), (0.0, 0.14), (0.3, 0.14), (0.42, 0.125), (0.48, 0.1), (0.5, 0.08)),
        hw=tbl((-0.5, 0.012), (-0.4, 0.036), (-0.1, 0.045), (0.3, 0.045), (0.44, 0.036), (0.49, 0.018), (0.5, 0.004)),
        stripe=None, cockpit=(0.38, 0.465, 0.62), windows=(0.1, 0.34, 0.045, 0.55, 0.64),
        fin=(-0.5, 0.2, 0.12, 0.25, 0.11, 0.05), stab=(0.42, 0.085, 0.055, 0.03, -0.5 + 0.12 + 0.0))
    objs = [hull('hull', P, [M['hull'], M['bottom'], M['accent'], M['glass']])]
    objs += fin_and_stab(P, M['hull'], M['hull'])
    objs += turbofan_like_nacelle('nk12', (-0.39, 0.268, 0.0), 0.14, 0.02, M['accent'])
    props = []
    props += propeller('prop_a', (-0.312, 0.268, 0.0), 0.05, 4, M['dark'], 0.6, 0.014, M['metal'])
    props += propeller('prop_b', (-0.3, 0.268, 0.0), 0.05, 4, M['dark'], -0.6)
    for s in (-1, 1):
        objs += turbofan('nk8_%d' % (1 if s > 0 else 2), (0.4, 0.085, s * 0.043), 0.06, 0.013, M['accent'], M['dark'])
    return objs, props


def craft_big(kind):
    if kind == 'km':
        M = dict(hull=material('hull', '#a7b0b6', 0.5, 0.15), bottom=material('bottom', '#3f4a52', 0.55),
                 accent=material('accent', '#c0362c', 0.5), glass=material('glass', '#16212c', 0.08, 0.6),
                 dark=material('dark', '#262c33', 0.45, 0.3), metal=material('metal', '#8d969e', 0.35, 0.7))
        H = 0.237
    else:
        M = dict(hull=material('hull', '#9ea8ad', 0.5, 0.15), bottom=material('bottom', '#434d54', 0.55),
                 accent=material('accent', '#6f7a80', 0.5, 0.2), glass=material('glass', '#16212c', 0.08, 0.6),
                 dark=material('dark', '#262c33', 0.45, 0.3), metal=material('metal', '#8d969e', 0.35, 0.7))
        H = 0.26
    P = dict(
        keel=tbl((-0.5, 0.06), (-0.36, 0.02), (-0.1, 0.0), (0.3, 0.0), (0.45, 0.02), (0.5, 0.05)),
        chine=tbl((-0.5, 0.07), (-0.36, 0.032), (-0.1, 0.014), (0.3, 0.014), (0.45, 0.032), (0.5, 0.058)),
        side=tbl((-0.5, 0.085), (-0.3, 0.08), (0.0, 0.08), (0.35, 0.08), (0.46, 0.075), (0.5, 0.07)),
        top=tbl((-0.5, 0.11), (-0.35, 0.13), (0.0, 0.14), (0.3, 0.14), (0.42, 0.13), (0.48, 0.105), (0.5, 0.08)),
        hw=tbl((-0.5, 0.012), (-0.4, 0.036), (-0.1, 0.045), (0.3, 0.045), (0.44, 0.036), (0.49, 0.018), (0.5, 0.004)),
        stripe=(-0.44, 0.47) if kind == 'km' else None, cockpit=(0.37, 0.46, 0.64), windows=(0.05, 0.3, 0.04, 0.56, 0.64),
        fin=(-0.5, 0.22, 0.13, H, 0.11, 0.05), stab=(0.9 * (37.6 / 92 if kind == 'km' else 44 / 73.8), 0.1, 0.065, 0.03, -0.5 + 0.13))
    objs = [hull('hull', P, [M['hull'], M['bottom'], M['accent'], M['glass']])]
    objs += fin_and_stab(P, M['hull'], M['hull'])
    objs.append(surface('stub', [(0.36, 0.105, lat, 0.06) for lat in (-0.11, -0.045, 0.0, 0.045, 0.11)], 0.12, M['hull'], False))
    for s in (-1, 1):
        for i in range(4):
            if kind == 'lun':
                row, col = divmod(i, 2)
                pos = (0.33, 0.12 + row * 0.024, s * (0.055 + col * 0.026))
            else:
                pos = (0.33, 0.121, s * (0.05 + i * 0.019))
            objs += turbofan('eng%d_%d' % (i, 1 if s > 0 else 2), pos, 0.08, 0.0105, M['accent'] if kind == 'km' else M['hull'], M['dark'])
    if kind == 'km':
        for s in (-1, 1):
            objs += turbofan('tail_eng%d' % (1 if s > 0 else 2), (-0.42, 0.2, s * 0.02), 0.07, 0.01, M['hull'], M['dark'])
    else:
        for i in range(3):
            for s in (-1, 1):
                x0 = 0.12 - i * 0.12
                ob = lathe('tube%d_%d' % (i, 1 if s > 0 else 2), [(0.08, 0.0001), (0.079, 0.012), (-0.08, 0.012), (-0.081, 0.0001)], M['hull'], (0, 0, 0))
                ob.rotation_euler = (0, -0.22, 0)
                ob.location = V(x0, 0.155, s * 0.024)
                objs.append(ob)
    return objs, []


CRAFT = {'oros': craft_oros, 'volga2': craft_volga2, 'orlyonok': craft_orlyonok,
         'lun': lambda: craft_big('lun'), 'km': lambda: craft_big('km')}

for style, fn in CRAFT.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs, props = fn()
    bpy.context.view_layer.update()
    for ob in objs:
        if ob.parent is None and (Vector(ob.rotation_euler).length > 0 or ob.location.length > 0):
            ob.data.transform(ob.matrix_basis); ob.matrix_basis.identity()
    all_mesh = [o for o in bpy.data.objects if o.type == 'MESH']
    bake_ao(all_mesh, 0.12)
    path = os.path.join(OUT, style + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_normals=True, export_texcoords=False, export_materials='EXPORT',
                              export_vertex_color='ACTIVE', export_animations=False, export_cameras=False, export_lights=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in all_mesh)
    print('BUILT', style, 'objects', len(all_mesh), 'tris', tris, 'bytes', os.path.getsize(path))

import base64
js = os.path.join(os.path.dirname(os.path.abspath(OUT)), 'js', 'bodies.js')
with open(js, 'w', encoding='utf-8') as f:
    f.write('/* Сгенерировано blender/build_models.py — не править вручную. Корпуса экранопланов в формате glTF (.glb, base64). */\n')
    f.write('window.BODY_GLB = {\n')
    for style in CRAFT:
        with open(os.path.join(OUT, style + '.glb'), 'rb') as g:
            f.write('  %s: "%s",\n' % (style, base64.b64encode(g.read()).decode()))
    f.write('};\n')
print('WROTE', js, os.path.getsize(js))
