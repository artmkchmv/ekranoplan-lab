window.Models = (function () {
  'use strict';
  const T = THREE;

  const mats = {};
  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});

    if (!mats[key])
      mats[key] = new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.15 }, opts || {}));
    
    return mats[key];
  }

  const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

  function parseGLB(b64) {
    const raw = atob(b64), bytes = new Uint8Array(raw.length);

    for (let i = 0; i < raw.length; i++)
      bytes[i] = raw.charCodeAt(i);

    const dv = new DataView(bytes.buffer);
    const jsonLen = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
    const binLen = dv.getUint32(20 + jsonLen, true), binStart = 28 + jsonLen;
    const bin = bytes.buffer.slice(binStart, binStart + binLen);

    const accessor = i => {
      const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
      const Arr = COMP[a.componentType], n = SIZE[a.type];
      const arr = new Arr(bin, (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
      return new T.BufferAttribute(arr, n, !!a.normalized);
    };

    const materials = (json.materials || []).map(m => {
      const pbr = m.pbrMetallicRoughness || {};
      const c = pbr.baseColorFactor || [1, 1, 1, 1];
      const glass = m.name === 'glass';

      const out = new T.MeshStandardMaterial({
        color: new T.Color(c[0], c[1], c[2]),
        metalness: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 1,
        roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1,
        envMapIntensity: glass ? 1.6 : 1,
        side: m.name === 'dark' || m.name === 'metal' ? T.DoubleSide : T.FrontSide
      });

      out.name = m.name;

      return out;
    });

    const meshes = json.meshes.map(me => me.primitives.map(pr => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', accessor(pr.attributes.POSITION));

      if (pr.attributes.NORMAL !== undefined)
        g.setAttribute('normal', accessor(pr.attributes.NORMAL));

      const hasAO = pr.attributes.COLOR_0 !== undefined;

      if (hasAO)
        g.setAttribute('color', accessor(pr.attributes.COLOR_0));

      if (pr.indices !== undefined)
        g.setIndex(accessor(pr.indices));

      let m = materials[pr.material] || mat('#cccccc');

      if (hasAO) {
        m = m.clone();
        m.vertexColors = true; m.name = materials[pr.material] ? materials[pr.material].name : '';
      }

      return { g, m };
    }));

    function node(i) {
      const n = json.nodes[i], o = new T.Group();

      o.name = n.name || '';

      if (n.mesh !== undefined)
        meshes[n.mesh].forEach(p => { const mm = new T.Mesh(p.g, p.m); mm.name = o.name; o.add(mm); });

      if (n.translation)
        o.position.fromArray(n.translation);

      if (n.rotation)
        o.quaternion.fromArray(n.rotation);

      if (n.scale)
        o.scale.fromArray(n.scale);

      (n.children || []).forEach(c => o.add(node(c)));

      return o;
    }
    
    const root = new T.Group();

    json.scenes[json.scene || 0].nodes.forEach(i => root.add(node(i)));

    return root;
  }

  const bodies = {};

  function body(style) {
    if (!(style in bodies)) {
      try {
        bodies[style] = window.BODY_GLB && window.BODY_GLB[style] ? parseGLB(window.BODY_GLB[style]) : null;
      }
      catch (e) {
        console.warn('Модель корпуса не прочиталась:', style, e);
        bodies[style] = null;
      }
    }

    return bodies[style];
  }

  function findMat(root, name) {
    let m = null;

    root.traverse(o => { if (!m && o.isMesh && o.material.name === name) m = o.material; });

    return m;
  }

  function wingOutline(b, c, shape) {
    const h = b / 2;

    if (shape === 'taper') {
      const cr = 1.357 * c, ct = 0.643 * c;
      return [[0, 0], [-(cr - ct), -h], [-cr, -h], [-cr, h], [-(cr - ct), h]];
    }

    if (shape === 'delta') {
      return [[0, 0], [-2 * c, -h], [-2 * c, h]];
    }

    return [[0, -h], [0, h], [-c, h], [-c, -h]];
  }

  function rootChord(c, shape) {
    return shape === 'taper' ? 1.357 * c : shape === 'delta' ? 2 * c : c;
  }

  function chordAt(c, shape, b, z) {
    const f = Math.min(Math.abs(z) / (b / 2), 1), cr = rootChord(c, shape);
    const ch = shape === 'taper' ? cr - (cr - 0.643 * c) * f : shape === 'delta' ? Math.max(2 * c * (1 - f), 0.04 * c) : c;
    return { ch, le: shape === 'rect' ? 0 : -cr + ch };
  }

  const AIRFOIL = (function () {
    const n = 16, up = [], lo = [];

    for (let i = 0; i <= n; i++) {
      const u = (1 - Math.cos(Math.PI * i / n)) / 2;
      const t = 5 * 0.1 * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);

      up.push([u, 2 * t * 0.92]);
      lo.push([u, -0.25 * t * Math.max(0, 1 - u / 0.3)]);
    }

    return up.concat(lo.reverse().slice(1, -1));
  })();

  function wingGeometry(b, c, shape) {
    const zs = shape === 'rect' ? [-b / 2, 0, b / 2] : [-b / 2, -b / 4, 0, b / 4, b / 2];
    const n = AIRFOIL.length, pos = [], idx = [];

    zs.forEach(z => {
      const { ch, le } = chordAt(c, shape, b, z);
      AIRFOIL.forEach(([u, y]) => pos.push(le - u * ch, y * ch, z));
    });

    for (let s = 0; s < zs.length - 1; s++) for (let j = 0; j < n; j++) {
      const a = s * n + j, b1 = s * n + (j + 1) % n, c1 = (s + 1) * n + (j + 1) % n, d = (s + 1) * n + j;
      idx.push(a, d, b1, b1, d, c1);
    }
    [0, zs.length - 1].forEach((s, k) => {
      for (let j = 1; j < n - 1; j++) {
        const a = s * n, b1 = s * n + j, c1 = s * n + j + 1;
        if (k === 0)
          idx.push(a, b1, c1);
        else
          idx.push(a, c1, b1);
      }
    });

    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();

    return g;
  }

  function plate(points, t, m) {
    const s = new T.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++)
      s.lineTo(points[i][0], points[i][1]);

    const g = new T.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    
    return new T.Mesh(g, m);
  }

  function fallbackBody(L, H) {
    const g = new T.Group(), m = mat('#c9d1d8');

    const hb = new T.Mesh(new T.CapsuleGeometry(0.045 * L, 0.85 * L, 6, 16), m);
    hb.rotation.z = Math.PI / 2; hb.scale.set(1.4, 1, 1);
    hb.position.y = 0.065 * L;

    g.add(hb);

    const fin = plate([[-0.5 * L, -0.005 * L], [-0.32 * L, -0.005 * L], [-0.39 * L, 0.005 * L], [-0.5 * L, 0.005 * L]], H - 0.1 * L, m);
    fin.rotation.x = 0;
    fin.position.y = H;

    g.add(fin);

    return g;
  }

  function build(spec, p) {
    const g = new T.Group();

    const L = spec.L, H = spec.H, b = p.b, c = p.chord;

    const tpl = body(spec.style);

    let bodyObj;

    if (tpl) {
      bodyObj = tpl.clone();
      bodyObj.scale.setScalar(L);
    } else {
      bodyObj = fallbackBody(L, H);
    }

    g.add(bodyObj);

    const mHull = (tpl && findMat(tpl, 'hull')) || mat('#e2e8f0');
    const mAcc = (tpl && findMat(tpl, 'accent')) || mat('#c53030');

    const cr = rootChord(c, p.shape);
    const xLE = cr * 0.35;

    const wingMat = mHull.clone();
    wingMat.vertexColors = false;

    const wing = new T.Mesh(wingGeometry(b, c, p.shape), wingMat);
    wing.position.set(xLE, 0, 0); g.add(wing);

    const own = [wing.geometry, wingMat];

    g.userData.own = own;
    g.userData.wingTipX = xLE - (p.shape === 'delta' ? 2 * c : p.shape === 'taper' ? 1.357 * c : c);
    g.userData.wingTE = xLE - cr;
    g.userData.endplates = [];
    g.userData.epH = 0.35 * c;

    if (p.endplates) {
      const epMat = mAcc.clone(); epMat.vertexColors = false; own.push(epMat);
      const tip = chordAt(c, p.shape, b, b / 2);
      const epL = Math.max(p.shape === 'delta' ? 0.8 * c : tip.ch, c * 0.4);
      const x0 = xLE + (p.shape === 'delta' ? -cr + epL / 2 : tip.le - tip.ch / 2);
      const thick = Math.max(b * 0.008, 0.002), top = 0.1 * tip.ch;

      for (const s of [-1, 1]) {
        const shp = new T.Shape();
        shp.moveTo(-epL / 2, 0);
        shp.lineTo(epL * 0.3, 0);
        shp.quadraticCurveTo(epL / 2, 0, epL / 2, -0.35);
        shp.lineTo(epL / 2, -0.8);
        shp.quadraticCurveTo(epL / 2, -1, epL * 0.3, -1);
        shp.lineTo(-epL / 2, -1);

        const geo = new T.ExtrudeGeometry(shp, { depth: thick, bevelEnabled: false, curveSegments: 6 });
        geo.translate(0, 0, -thick / 2); own.push(geo);

        const ep = new T.Mesh(geo, epMat);
        ep.position.set(x0, top, s * b / 2); ep.scale.y = 0.35 * c; g.add(ep);

        g.userData.endplates.push(ep);
      }
    }

    const props = [];

    bodyObj.traverse(o => { if (!o.isMesh && /^prop_[a-z]\d?$/.test(o.name)) props.push({ o, dir: /_b$|2$/.test(o.name) ? -1 : 1 }); });

    g.userData.props = spec.powered === false ? [] : props;
    g.userData.L = L;

    return g;
  }

  function spin(craft, dt, speed) {
    (craft.userData.props || []).forEach(p => { p.o.rotation.x += p.dir * dt * speed * Math.PI * 2; });
  }

  function dispose(craft) {
    (craft.userData.own || []).forEach(x => x.dispose());
    craft.userData.own = [];
  }

  function label(text, size) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 128;

    const x = cv.getContext('2d');

    x.fillStyle = 'rgba(255,255,255,0.88)';
    x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#1a202c';
    x.font = 'bold 44px Arial';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 256, 64);

    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false }));
    s.scale.set(size, size / 4, 1);

    return s;
  }

  return { build, spin, dispose, label, wingOutline, rootChord };
})();
