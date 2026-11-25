(function () {
  'use strict';
  const P = window.Phys, PR = window.PRESETS, T = THREE;
  const $ = id => document.getElementById(id);

  const UNITS = {
    len: { cm: { k: 100, u: 'см' }, m: { k: 1, u: 'м' } },
    mass: { g: { k: 1000, u: 'г' }, kg: { k: 1, u: 'кг' }, t: { k: 0.001, u: 'т' } },
    speed: { ms: { k: 1, u: 'м/с' }, kmh: { k: 3.6, u: 'км/ч' } }
  };

  const NF = {};

  function num(v, d) {
    if (!isFinite(v))
      return '—';

    return (NF[d] || (NF[d] = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
  }

  function smart(v) { const a = Math.abs(v); return num(v, a >= 100 ? 0 : a >= 10 ? 1 : 2); }

  const unitOf = kind => UNITS[kind][preset.units[kind]];

  const fLen = v => { const u = unitOf('len'); return smart(v * u.k) + ' ' + u.u; };

  const fMass = v => { const u = unitOf('mass'); return smart(v * u.k) + ' ' + u.u; };

  const fSpeed = v => { const u = unitOf('speed'); return smart(v * u.k) + ' ' + u.u; };

  function fForce(N) {
    const kg = N / P.G;
    const s = kg >= 1000 ? smart(kg / 1000) + ' т' : kg >= 1 ? smart(kg) + ' кг' : smart(kg * 1000) + ' г';
    const n = N >= 1e6 ? smart(N / 1e6) + ' МН' : N >= 1e3 ? smart(N / 1e3) + ' кН' : smart(N) + ' Н';
    return { n, s };
  }

  function fPower(W) { return W >= 1e6 ? smart(W / 1e6) + ' МВт' : W >= 1e3 ? smart(W / 1e3) + ' кВт' : smart(W) + ' Вт'; }

  const BADGE = { calc: 'расчёт', est: 'оценка', ill: 'иллюстрация', src: 'источник' };

  const badge = k => `<span class="badge ${k}">${BADGE[k]}</span>`;

  let presetId = 'model', preset = PR.model;
  const st = {};
  let tab = 'fly';
  let dyn = { z: 0, vz: 0, t: 0, touch: false };
  let glideAnim = null;
  let last = null;
  let dirty = true;
  const show = { lift: true, weight: true, drag: true, ge: true };

  const cfg = () => ({ b: st.b, chord: st.chord, shape: st.shape, endplates: st.endplates,
                       cd0: preset.cd0, clmax: preset.clmax, alpha0: preset.alpha0 });

  const mass = () => st.massBase + st.payload;

  const weight = () => mass() * P.G;

  const airV = () => Math.max(st.V + st.wind, 0.1);

  const roundTo = (v, s) => Math.round(v / s) * s;

  function loadPreset(id) {
    presetId = id; preset = PR[id];

    Object.assign(st, { b: preset.b, chord: preset.chord, shape: preset.shape, endplates: preset.endplates,
                        massBase: preset.massBase, payload: preset.payload, V: preset.V, h: preset.h,
                        wind: preset.wind, enginePct: 100 });

    st.mode = preset.kind === 'glider' ? 'glide' : 'fixed';
    st.alpha = preset.alpha !== null ? preset.alpha : roundTo(P.trimAlpha(cfg(), st.h, airV(), weight()) || 4, 0.25);

    dyn = { z: st.h, vz: 0, t: 0, touch: false };

    glideAnim = null;

    buildControls();
    buildMode();
    rebuildCraft();
    placeCamera(true);

    $('ovTitle').innerHTML = `<b>${preset.name}</b>`;

    dirty = true;
  }

  const SHAPE_ICONS = {
    rect: '<svg viewBox="0 0 34 16"><rect x="1" y="5" width="32" height="6" rx="1"/></svg>',
    taper: '<svg viewBox="0 0 34 16"><path d="M1 10 17 3 33 10 33 12 1 12z"/></svg>',
    delta: '<svg viewBox="0 0 34 16"><path d="M17 2 33 14 1 14z"/></svg>'
  };

  function sliderDefs() {
    const g = preset.kind === 'glider', R = preset.ranges;

    const groups = [
      ['Полёт', [
        { key: 'h', name: g ? 'Высота запуска' : 'Высота над водой', r: R.h, f: fLen },
        { key: 'V', name: g ? 'Скорость запуска' : 'Скорость над водой', r: R.V, f: fSpeed },
        { key: 'alpha', name: 'Угол атаки', r: [-2, 14, 0.25], f: v => num(v, v % 1 ? 2 : 0).replace(/,?0+$/, '') + '°' },
        { key: 'wind', name: 'Ветер', r: R.wind, f: v => (v > 0 ? '+' : '') + num(v, 1) + ' м/с' }
      ]],
      ['Масса', [
        { key: 'massBase', name: g ? 'Масса модели' : 'Масса без груза', r: R.massBase, f: fMass },
        { key: 'payload', name: preset.payloadName, r: R.payload, f: fMass }
      ]],
      ['Крыло', [
        { key: 'b', name: 'Размах', r: R.b, f: fLen },
        { key: 'chord', name: 'Ширина (хорда)', r: R.chord, f: fLen },
        { key: 'endplates', type: 'check', name: 'Шайбы на концах крыла' }
      ]],
      ['Форма крыла', [
        { key: 'shape', type: 'shape' }
      ]]
    ];

    if (preset.engine)
      groups.push(['Двигатели', [{ key: 'enginePct', name: 'Режим двигателей', r: [30, 130, 5], f: v => num(v, 0) + ' %' }]]);

    return groups;
  }

  function fill(inp) {
    const p = (inp.value - inp.min) / (inp.max - inp.min) * 100;
    inp.style.setProperty('--p', p + '%');
  }

  function buildControls() {
    const box = $('controls'); box.innerHTML = '';
    sliderDefs().forEach(([title, defs]) => {
      const gt = document.createElement('div'); gt.className = 'group-title'; gt.textContent = title; box.appendChild(gt);
      defs.forEach(d => {
        const el = document.createElement('div'); el.className = 'ctrl'; el.dataset.key = d.key;
        if (d.type === 'shape') {
          el.innerHTML = `<div class="shapes" role="group" aria-label="Форма крыла">${Object.keys(P.SHAPES).map(k =>
            `<button data-v="${k}" aria-pressed="${st.shape === k}" class="${st.shape === k ? 'on' : ''}">${SHAPE_ICONS[k]}${P.SHAPES[k].name}</button>`).join('')}</div>`;
          el.querySelectorAll('button').forEach(b => b.onclick = () => {
            st.shape = b.dataset.v;
            el.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
            changed(true);
          });
        } else if (d.type === 'check') {
          el.innerHTML = `<label class="switch"><input type="checkbox" ${st[d.key] ? 'checked' : ''}><span class="sw"></span><span>${d.name}</span></label>`;
          el.querySelector('input').onchange = e => { st[d.key] = e.target.checked; changed(true); };
        } else {
          el.innerHTML = `<div class="head"><span class="name">${d.name}</span><span class="val"></span></div>
            <input type="range" min="${d.r[0]}" max="${d.r[1]}" step="${d.r[2]}" value="${st[d.key]}" aria-label="${d.name}">`;
          const inp = el.querySelector('input'), val = el.querySelector('.val');
          val.textContent = d.f(st[d.key]); fill(inp);
          inp.oninput = () => { st[d.key] = parseFloat(inp.value); val.textContent = d.f(st[d.key]); fill(inp); changed(d.key === 'b' || d.key === 'chord', d.key); };
          el._set = v => { inp.value = v; val.textContent = d.f(v); fill(inp); };
        }
        box.appendChild(el);
      });
    });
  }

  function setSlider(key, v) {
    st[key] = v;
    const el = document.querySelector(`.ctrl[data-key="${key}"]`);
    if (el && el._set) el._set(v);
  }

  function buildMode() {
    const box = $('modeBox');
    const modes = preset.kind === 'glider'
      ? [['glide', 'Запуск планера'], ['fixed', 'Стоп-кадр']]
      : [['fixed', 'Высоту задаю я'], ['free', 'Свободный полёт']];
    box.innerHTML = modes.map(m => `<button data-m="${m[0]}" class="${st.mode === m[0] ? 'on' : ''}" aria-pressed="${st.mode === m[0]}">${m[1]}</button>`).join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      st.mode = b.dataset.m;
      box.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      dyn = { z: st.h, vz: 0, t: 0, touch: false }; glideAnim = null; dirty = true; wake();
    });
  }

  function changed(geom, key) {
    dirty = true;

    if (geom)
      needRebuild = true;

    wake();

    if (key === 'h' && st.mode === 'free') {
      dyn.z = st.h; dyn.vz = 0;
    }

    if (st.mode === 'glide' && key !== 'wind')
      glideAnim = null;
  }

  const geOn = () => $('geToggle').checked;

  function compute() {
    const c = cfg(), W = weight(), Va = airV(), ge = geOn();
    const h = st.mode === 'free' ? dyn.z : st.h;
    const r = P.aero(c, h, Va, st.alpha, ge), r0 = P.aero(c, h, Va, st.alpha, false);

    const out = { h, Va, W, r, r0 };
    out.geK = (r.K / r0.K - 1) * 100;
    out.indRed = (1 - r.phi) * 100;
    out.trim = P.trimAlpha(c, h, Va, W, ge);
    out.eq = P.equilibriumHeight(c, Va, st.alpha, W, 0.003 * st.b, 3 * st.b);
    out.stiff = P.heightStiffness(c, h, Va, st.alpha);
    out.pitch = P.pitchShiftIllustr(c, h);

    if (preset.kind === 'glider') {
      out.g1 = P.glide(c, mass(), st.h, st.V, st.alpha, st.wind, ge);
      out.g0 = P.glide(c, mass(), st.h, st.V, st.alpha, st.wind, false);
    } else {
      if (out.trim !== null) {
        const rt = P.aero(c, h, Va, out.trim, ge);

        out.Pmotor = rt.D * Va / P.ETA_PROP;
        out.fuel100 = rt.D * 1e5 / (P.FUEL_J_PER_KG * P.ETA_FUEL);
        out.range100 = 100 * P.FUEL_J_PER_KG * P.ETA_FUEL / rt.D / 1000 * (st.V / Va);
        out.rangeWh = 100 * 3600 * P.ETA_ELEC / rt.D * (st.V / Va);
      }

      out.vmax = P.maxSpeed(c, preset.engine, st.enginePct, h, W, st.wind, preset.ranges.V[1]);
      out.vmaxCapped = out.vmax !== null && out.vmax >= preset.ranges.V[1] - 0.5;
    }

    return out;
  }

  function card(title, b, value, sub, cls, wide) {
    return `<div class="out${wide ? ' wide' : ''}"><div class="hd"><div class="t">${title}</div>${b ? badge(b) : ''}</div>
      <div class="v ${cls || ''}">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  }

  function renderOutputs(o) {
    const L = fForce(o.r.L), W = fForce(o.W), D = fForce(o.r.D);

    let html = '';
    html += card('Подъёмная сила', 'calc', L.n, `держит ${L.s}`, o.r.L / o.W >= 0.98 ? 'good' : 'bad');
    html += card('Вес', 'calc', W.n, `масса ${fMass(mass())}`);

    if (preset.mtow && mass() > preset.mtow * 1.001) {
      html += card('Перегруз', 'src', `+${fMass(mass() - preset.mtow)}`, `больше максимальной взлётной массы ${fMass(preset.mtow)}`, 'bad', true);
    }

    html += card('Сопротивление', 'calc', D.n, `как гиря ${D.s}`);
    html += card('Качество', 'calc', num(o.r.K, 1), `без экрана ${num(o.r0.K, 1)}`);

    const ge = geOn(), gePct = Math.max(0, Math.min(100, o.indRed));

    html += card('Сила экранного эффекта', 'calc', ge ? `+${num(Math.max(o.geK, 0), 0)} % к качеству` : 'не учитывается',
      `<div class="meter"><b style="width:${ge ? gePct : 0}%"></b></div>`, '', true);

    if (preset.kind === 'glider') {
      html += card('Дальность', 'calc', fLen(o.g1.dist), `без экрана ${fLen(o.g0.dist)}`);
      html += card('Время полёта', 'calc', o.g1.ok ? num(o.g1.t, 2) + ' с' : '—', o.g1.ok ? `средняя скорость ${num(o.g1.dist / o.g1.t, 1)} м/с` : 'модель уходит вверх');
    } else {
      if (o.trim !== null) {
        html += card('Нужная мощность', 'est', fPower(o.Pmotor), 'на моторе при ровном полёте');

        if (preset.energy === 'elec')
          html += card('Дальность', 'est', num(o.rangeWh, 0) + ' м', 'на 100 Вт·ч батареи');
        else
          html += card('Дальность', 'est', num(o.range100, 0) + ' км', 'на 100 кг топлива');
      } else {
        html += card('Ровный полёт', 'calc', 'невозможен', 'не хватает подъёмной силы: увеличьте скорость или крыло', 'bad', true);
      }

      if (preset.engine)
        html += card('Макс. скорость', 'est', o.vmax ? (o.vmaxCapped ? 'больше ' : '') + fSpeed(o.vmax) : 'не хватает тяги', '', o.vmax ? '' : 'bad', true);
    }

    html += card('Устойчивость по высоте', 'calc', o.stiff > 0.5 ? 'есть' : 'слабая', '', o.stiff > 0.5 ? 'good' : 'warn');

    const p = o.pitch;

    html += card('Склонность «клевать» носом', 'ill', p < 3 ? 'слабая' : p < 8 ? 'заметная' : 'сильная', '', p < 3 ? 'good' : p < 8 ? 'warn' : 'bad', true);
    html += card('Угол ровного полёта', 'calc', o.trim !== null ? num(o.trim, 1) + '°' : 'нет', '');

    const eq = o.eq.why === 'ok' ? fLen(o.eq.h) : o.eq.why === 'up' ? 'уходит вверх' : 'касается воды';

    html += card('Высота равновесия', 'calc', eq, `при угле атаки ${num(st.alpha, 1)}°`, o.eq.why === 'ok' ? 'good' : 'warn', true);

    if (o.r.stall)
      html += card('Срыв потока', 'calc', 'угол слишком большой', 'воздух отрывается от крыла', 'bad', true);

    if (html !== lastOutHtml) {
      $('outputs').innerHTML = html;
      lastOutHtml = html;
    }

  }

  let lastOutHtml = '';

  const view = $('view3d');
  const renderer = new T.WebGLRenderer({ antialias: true });
  const COARSE = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  const Q = { maxDpr: Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 2), minDpr: COARSE ? 0.75 : 1, shadow: COARSE ? 1024 : 2048 };
  Q.dpr = Q.maxDpr;

  renderer.setPixelRatio(Q.dpr);
  renderer.outputEncoding = T.sRGBEncoding;

  view.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, 0.01, 20000);

  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;

  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const shadowDirty = () => { renderer.shadowMap.needsUpdate = true; };

  scene.add(new T.HemisphereLight(0xdfe7ee, 0x2b3a46, 0.45));

  const sun = new T.DirectionalLight(0xfff6ea, 1.35); sun.position.set(4, 7, 3); scene.add(sun); scene.add(sun.target);
  sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;

  const rim = new T.DirectionalLight(0x9fc7e6, 0.3); rim.position.set(-5, 3, -4); scene.add(rim);

  function canvasTex(w, h, draw, repeat) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;

    draw(cv.getContext('2d'), w, h);

    const t = new T.CanvasTexture(cv);
    t.encoding = T.sRGBEncoding;

    if (repeat) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.anisotropy = 4;
    }

    return t;
  }

  (function makeEnvironment() {
    const env = new T.Scene();

    const skyGrad = canvasTex(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#dfe8f0'); gr.addColorStop(0.47, '#a9b8c6'); gr.addColorStop(0.53, '#4d5357'); gr.addColorStop(1, '#2a2e31');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });

    env.add(new T.Mesh(new T.SphereGeometry(10, 32, 16), new T.MeshBasicMaterial({ map: skyGrad, side: T.BackSide })));

    const sunDisc = new T.Mesh(new T.SphereGeometry(0.9, 16, 8), new T.MeshBasicMaterial({ color: new T.Color(14, 13, 12) }));
    sunDisc.position.set(4, 7, 3).normalize().multiplyScalar(9);

    env.add(sunDisc);

    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture;

    pm.dispose();
  })();

  const waterNormal = (function () {
    const N = 256, hgt = new Float32Array(N * N), waves = [];

    for (let i = 0; i < 26; i++)
      waves.push([Math.round((Math.random() * 2 - 1) * (3 + i)), Math.round((Math.random() * 2 - 1) * (2 + i * 0.6)), 1 / (1 + i * 0.35), Math.random() * 6.283]);

    const sx = new Float32Array(N), cx = new Float32Array(N), sy = new Float32Array(N), cy = new Float32Array(N);

    for (const [kx, ky, a, ph] of waves) {
      for (let i = 0; i < N; i++) {
        const X = 6.283 * kx * i / N + ph, Y = 6.283 * ky * i / N;
        sx[i] = a * Math.sin(X); cx[i] = a * Math.cos(X); sy[i] = Math.sin(Y); cy[i] = Math.cos(Y);
      }

      for (let y = 0; y < N; y++) {
        const s = sy[y], c = cy[y], row = y * N;
        for (let x = 0; x < N; x++)
          hgt[row + x] += sx[x] * c + cx[x] * s;
      }
    }

    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N];
      const dy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];

      const nx = -dx * 0.35, ny = -dy * 0.35, l = Math.hypot(nx, ny, 1), k = (y * N + x) * 4;

      img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);

    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;

    return t;
  })();

  function castShadows(obj) { obj.traverse(o => { if (o.isMesh) o.castShadow = true; }); }

  const SUN_DIR = new T.Vector3(0.45, 1, 0.35).normalize();

  function aimSun(center, size) {
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(SUN_DIR, size * 3);

    const cam = sun.shadow.camera, r = size * 0.75;

    if (cam.right !== r) {
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = size * 0.5;
      cam.far = size * 6;
      cam.updateProjectionMatrix();
    }
  }

  const skyTex = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1e252c'); gr.addColorStop(0.55, '#4a5866'); gr.addColorStop(1, '#93a1ad'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const hallTex = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1c2025'); gr.addColorStop(1, '#3f454c'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });

  const waterTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2b5470';
    g.fillRect(0, 0, w, h);
    
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w, y = Math.random() * h, l = 10 + Math.random() * 40;
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '175,210,232' : '14,40,60'},${0.12 + Math.random() * 0.28})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + l / 2, y - 3, x + l, y);
      g.stroke();
    }

  }, true);
  
  const floorTex = canvasTex(512, 512, (g) => {

    for (let r = 0; r < 8; r++) {
      for (let c = -1; c < 2; c++) {
        const off = (r % 2) * 128;

        g.fillStyle = `hsl(30, ${26 + Math.random() * 10}%, ${40 + Math.random() * 8}%)`;
        g.fillRect(c * 256 + off, r * 64, 256, 64);
        g.strokeStyle = 'rgba(30,20,10,0.4)';
        g.strokeRect(c * 256 + off, r * 64, 256, 64);
      }
    }

    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, 256);
    g.lineTo(512, 256);
    g.stroke();

  }, true);

  const surface = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: waterTex, roughness: 0.4, metalness: 0.1 }));
  surface.rotation.x = -Math.PI / 2; surface.receiveShadow = true;
  scene.add(surface);

  const blobTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });

  const blob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);
  
  const markers = new T.Group();
  scene.add(markers);

  const MARK = { geo: new T.ConeGeometry(0.35, 1, 10), body: new T.MeshStandardMaterial({ color: 0xe0574f }), top: new T.MeshStandardMaterial({ color: 0xeef2f5 }) };

  let craft = null, tileSize = 1, markerRange = 10;

  const cushion = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0x5ab9f0, transparent: true, opacity: 0.4, depthWrite: false }));
  const cushionEdge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)), new T.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.6 }));
  cushion.add(cushionEdge);
  scene.add(cushion);

  function makeArrow(color) {
    const g = new T.Group();

    const m = new T.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });

    const shaft = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 14), m);

    const head = new T.Mesh(new T.ConeGeometry(1, 1, 18), m);

    shaft.renderOrder = head.renderOrder = 10;

    g.add(shaft, head); g.userData = { shaft, head };

    scene.add(g);

    return g;
  }

  const arrows = { lift: makeArrow(0x5fd49a), weight: makeArrow(0xff6f66), drag: makeArrow(0xffab52) };

  const UP = new T.Vector3(0, 1, 0);

  function setArrow(a, origin, dir, len, thick) {
    const headLen = Math.min(len * 0.35, thick * 5), shaftLen = Math.max(len - headLen, thick);

    const { shaft, head } = a.userData;
    shaft.scale.set(thick, shaftLen, thick);
    shaft.position.set(0, shaftLen / 2, 0);
    head.scale.set(thick * 2.6, headLen, thick * 2.6);
    head.position.set(0, shaftLen + headLen / 2, 0);

    a.position.copy(origin);
    a.quaternion.setFromUnitVectors(UP, dir);
  }

  const VS = 280, VR = 6;

  const vortexMat = new T.MeshBasicMaterial({ color: 0xf6c177, transparent: true, opacity: 0.85 });

  function vortexGeometry() {
    const g = new T.BufferGeometry(), idx = [];

    const pos = new T.BufferAttribute(new Float32Array(VS * VR * 3), 3);
    pos.setUsage(T.DynamicDrawUsage);

    for (let i = 0; i < VS - 1; i++) {
      for (let j = 0; j < VR; j++) {
        const a = i * VR + j, b = i * VR + (j + 1) % VR, c = (i + 1) * VR + (j + 1) % VR, d = (i + 1) * VR + j;
        idx.push(a, b, d, b, c, d);
      }
    }

    g.setIndex(idx);
    g.setAttribute('position', pos);

    return g;
  }

  const vortices = [new T.Mesh(vortexGeometry(), vortexMat), new T.Mesh(vortexGeometry(), vortexMat)];
  vortices.forEach(v => { v.frustumCulled = false; scene.add(v); });

  const vLine = new Float32Array(VS * 3);

  function updateVortex(v, s, tipX, r0, len, time, z, c, b, phi, tubeR) {
    for (let i = 0; i < VS; i++) {
      const f = i / (VS - 1), th = time * 9 * s + f * 26 * s, rr = r0 * Math.min(1, f * 6);
      const ry = Math.min(rr, z * 0.9 + 0.02 * c);

      vLine[i * 3] = tipX - f * len;
      vLine[i * 3 + 1] = z + c * 0.03 - ry * 0.6 + Math.cos(th) * ry;
      vLine[i * 3 + 2] = s * (b / 2 - rr * 0.2 + (1 - phi) * rr * 0.6) + Math.sin(th) * rr;
    }

    const out = v.geometry.attributes.position.array;

    for (let i = 0; i < VS; i++) {
      const i0 = Math.max(i - 1, 0) * 3, i1 = Math.min(i + 1, VS - 1) * 3;
      let tx = vLine[i1] - vLine[i0], ty = vLine[i1 + 1] - vLine[i0 + 1], tz = vLine[i1 + 2] - vLine[i0 + 2];
      let l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      let nx = -tz, ny = 0, nz = tx; l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;

      for (let j = 0; j < VR; j++) {
        const a = j / VR * Math.PI * 2, ca = Math.cos(a) * tubeR, sa = Math.sin(a) * tubeR, k = (i * VR + j) * 3;

        out[k] = vLine[i * 3] + ca * nx + sa * bx;
        out[k + 1] = vLine[i * 3 + 1] + ca * ny + sa * by;
        out[k + 2] = vLine[i * 3 + 2] + ca * nz + sa * bz;
      }
    }

    v.geometry.attributes.position.needsUpdate = true;
  }

  let needRebuild = false;

  function rebuildCraft() {
    needRebuild = false;
    if (craft) {
      scene.remove(craft);
      Models.dispose(craft);
    }

    craft = Models.build({ style: preset.style, L: preset.L, H: preset.H, b0: preset.b, powered: preset.kind !== 'glider' }, { b: st.b, chord: st.chord, shape: st.shape, endplates: st.endplates });

    castShadows(craft);
    scene.add(craft);
    setupSurface();
    shadowDirty();
    wake();
  }

  function setupSurface() {
    const floor = preset.surface === 'floor';
    const size = Math.max(preset.L * 400, 200);

    surface.scale.set(size, size, 1);
    surface.material.map = floor ? floorTex : waterTex;
    surface.material.normalMap = floor ? null : waterNormal;
    surface.material.normalScale.set(0.55, 0.55);
    surface.material.roughness = floor ? 0.92 : 0.3;
    surface.material.metalness = floor ? 0 : 0.15;
    surface.material.envMapIntensity = floor ? 0.3 : 0.9;

    sun.castShadow = true;

    tileSize = floor ? 1.2 : Math.min(Math.max(preset.L * 0.3, 1.5), 12);

    surface.material.map.repeat.set(size / tileSize, size / tileSize);
    surface.material.needsUpdate = true;

    scene.background = floor ? hallTex : skyTex;
    scene.fog = new T.Fog(floor ? 0x30353b : 0x6f7d89, preset.L * 10, preset.L * 80);

    markers.clear();

    const mSize = floor ? 0.05 : 1.2;

    markerRange = Math.max(preset.L * 12, floor ? 4 : 60);

    for (let i = 0; i < 46; i++) {
      const g = new T.Group();

      const cone = new T.Mesh(MARK.geo, i % 3 ? MARK.body : MARK.top);
      cone.scale.setScalar(mSize);
      cone.position.y = mSize / 2;

      g.add(cone);

      let z;

      do {
        z = (Math.random() * 2 - 1) * markerRange;
      } while (Math.abs(z) < Math.max(st.b * 0.9, preset.L * 3));

      g.position.set((Math.random() * 2 - 1) * markerRange, 0, z);

      markers.add(g);
    }
  }

  function placeCamera(reset) {
    const L = preset.L;

    controls.target.set(0, st.h + preset.H * 0.4, 0);

    if (reset)
      camera.position.set(L * 1.15, st.h + L * 0.5, L * 1.45);
    camera.near = L * 0.01;
    camera.far = L * 400;
    camera.updateProjectionMatrix();

    controls.minDistance = L * 0.4;
    controls.maxDistance = L * 30;
  }

  function resize() {
    const w = view.clientWidth, h = view.clientHeight;

    if (!w || !h)
      return;

    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    dirty = true;
    labelSizes = null;

    wake();
  }

  window.addEventListener('resize', resize);

  function updateEffects(z, alphaVis, o) {
    const c = st.chord, b = st.b, L = preset.L;

    const cr = Models.rootChord(c, st.shape);

    const rotZ = alphaVis * Math.PI / 180;

    if (craft.position.y !== z || craft.rotation.z !== rotZ)
      shadowDirty();

    craft.position.set(0, z, 0);
    craft.rotation.z = rotZ;

    const epVis = Math.min(craft.userData.epH, 0.9 * Math.max(z, 1e-4));

    craft.userData.endplates.forEach(ep => { ep.scale.y = epVis; });

    const fade = Math.max(0, 1 - z / (b * 1.2));

    blob.position.set(0, 0.001 * L, 0);
    blob.scale.set(L * 1.1, b * 1.05, 1);
    blob.material.opacity = 0.12 + 0.35 * fade;

    aimSun(tmpA.set(0, z * 0.5, 0), Math.max(L, b) * 1.2 + z);

    const phi = o.r.phi, ge = geOn();
    cushion.visible = show.ge && ge && z < b * 0.6 && z > 0.002 * b;
    cushion.scale.set(cr * 0.9, Math.max(z, 1e-4), b * 0.92);
    cushion.position.set(cr * 0.35 - cr * 0.5, z / 2, 0);
    cushion.material.opacity = 0.55 * (1 - phi) + 0.05;

    cushionEdge.material.opacity = 0.75 * (1 - phi) + 0.1;

    const vVis = show.ge;

    vortices.forEach(v => { v.visible = vVis; });

    if (vVis) {
      const tipX = craft.userData.wingTipX, r0 = c * (0.15 + 0.85 * phi) * 0.6, len = L * 2.2, time = performance.now() / 1000;
      const tubeR = Math.max(c * 0.05, L * 0.004);
      vortices.forEach((v, k) => updateVortex(v, k ? 1 : -1, tipX, r0, len, time, z, c, b, phi, tubeR));
      vortexMat.opacity = 0.45 + 0.5 * (ge ? phi : 1);
    }

    const base = tmpA.set(cr * 0.35 - cr * 0.3, z + preset.H * 0.25, 0), A = L * 0.38, thick = L * 0.011;
    const ratio = Math.min(o.r.L / o.W, 2.5);

    arrows.lift.visible = show.lift;
    arrows.weight.visible = show.weight;
    arrows.drag.visible = show.drag;

    setArrow(arrows.lift, base, DIR_UP, Math.max(A * ratio, A * 0.08), thick);
    setArrow(arrows.weight, base, DIR_DOWN, A, thick);

    const tail = tmpA.set(-L * 0.52, z + preset.H * 0.3, 0);

    setArrow(arrows.drag, tail, DIR_BACK, Math.min(Math.max(A * o.r.D / o.W * 6, A * 0.8), A * 1.8), thick);
  }

  const tmpA = new T.Vector3(), DIR_UP = new T.Vector3(0, 1, 0), DIR_DOWN = new T.Vector3(0, -1, 0), DIR_BACK = new T.Vector3(-1, 0, 0);

  let hangar = null, hangarFocus = null;

  const HANGAR_ORDER = ['km', 'lun', 'orlyonok', 'oros_full', 'volga2', 'samara', 'model'];
  const hangarItems = [];

  const dimTxt = v => v < 1 ? Math.round(v * 100) + ' см' : num(v, v % 1 ? 1 : 0) + ' м';

  function buildHangar() {
    hangar = new T.Group();
    hangar.visible = false;

    scene.add(hangar);

    let z = 0;

    const labels = $('labels');

    const addLabel = (text, sub, anchor, onClick) => {
      const el = document.createElement('div'); el.className = 'lab'; el.innerHTML = `${text}<small>${sub}</small>`;
      const line = document.createElement('div'); line.className = 'lab-line';
      labels.appendChild(line); labels.appendChild(el);
      if (onClick) el.onclick = onClick;
      const item = { el, line, anchor }; hangarItems.push(item); return item;
    };

    HANGAR_ORDER.forEach((id, i) => {
      const p = PR[id];

      const m = Models.build({ style: p.style, L: p.L, H: p.H, b0: p.b, powered: p.kind !== 'glider' }, { b: p.b, chord: p.chord, shape: p.shape, endplates: p.endplates });

      m.userData.endplates.forEach(ep => { ep.scale.y = Math.min(m.userData.epH, p.h * 0.9); });
      m.position.y = p.h;

      z += i ? p.b / 2 + Math.max(14, p.b * 0.55) : 0;

      m.position.z = z;
      m.userData.id = id;
      m.userData.z = z;

      hangar.add(m);

      addLabel(p.short, dimTxt(p.L), new T.Vector3(0, p.h + p.H * 1.05, z), () => focusHangar(id)).id = id;

      z += p.b / 2;
    });

    hangar.userData.zEnd = z;

    $('hangarList').innerHTML = HANGAR_ORDER.map(id => `<button data-id="${id}"><b>${PR[id].short}</b><span class="len">${dimTxt(PR[id].L)}</span><span class="sub">размах ${dimTxt(PR[id].b)}${id === 'oros_full' ? ', оценка' : ''}</span></button>`).join('');
    $('hangarList').querySelectorAll('button').forEach(btn => btn.onclick = () => focusHangar(btn.dataset.id));
    $('hangarAll').onclick = hangarOverview;
  }

  let camTween = null;

  function flyTo(pos, target, near) {
    camTween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target };

    camera.near = near;
    camera.updateProjectionMatrix();
  }

  function focusHangar(id) {
    hangarFocus = id;

    $('hangarList').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === id));

    hangarItems.forEach(it => it.el.classList.toggle('on', it.id === id));

    labelSizes = null;

    wake();

    const m = hangar.children.find(o => o.userData.id === id), p = PR[id];

    const D = Math.max(p.L, p.b);

    flyTo(new T.Vector3(D * 1.25, p.h + p.H * 0.6 + D * 0.35, m.userData.z + D * 0.55), new T.Vector3(0, p.h + p.H * 0.4, m.userData.z), Math.min(D * 0.01, 0.01));

    controls.minDistance = Math.min(D * 0.3, 0.2);
  }

  function hangarOverview() {
    hangarFocus = null;

    $('hangarList').querySelectorAll('button').forEach(b => b.classList.remove('on'));

    hangarItems.forEach(it => it.el.classList.remove('on'));

    labelSizes = null;

    wake();

    const zEnd = hangar.userData.zEnd;
    camera.far = 50000;

    controls.maxDistance = zEnd * 4;
    controls.minDistance = 0.2;

    const fit = Math.max(1, (view.clientHeight || 1) / (view.clientWidth || 1) * 1.3);

    flyTo(new T.Vector3(zEnd * 1.12 * fit, zEnd * 0.3 * fit, zEnd * 0.46), new T.Vector3(0, 6, zEnd * 0.46), 0.05);
  }

  const tmpV = new T.Vector3();

  let labelSizes = null, labelCamKey = '';

  function placeLabels() {
    const w = view.clientWidth, h = view.clientHeight;

    const key = camera.matrixWorld.elements.join(',') + w + 'x' + h;

    if (labelSizes && key === labelCamKey)
      return;

    labelCamKey = key;

    if (!labelSizes) {
      hangarItems.forEach(it => { it.el.style.display = it.line.style.display = ''; it.shown = true; });

      labelSizes = hangarItems.map(it => [it.el.offsetWidth, it.el.offsetHeight]);

      hangarItems.forEach((it, i) => { it.size = labelSizes[i]; });
    }

    const placed = [];

    const items = hangarItems.map(it => {
      tmpV.copy(it.anchor).project(camera);

      return { it, x: (tmpV.x + 1) / 2 * w, y: (1 - tmpV.y) / 2 * h, vis: tmpV.z < 1 && tmpV.z > -1 && Math.abs(tmpV.x) < 1.02 && Math.abs(tmpV.y) < 1.02 };
    }).sort((a, b) => b.y - a.y);

    items.forEach(o => {
      const { el, line } = o.it;

      if (o.it.shown !== o.vis) {
        el.style.display = line.style.display = o.vis ? '' : 'none';
        o.it.shown = o.vis;
      }

      if (!o.vis)
        return;

      const [bw, bh] = o.it.size;

      let x = o.x - bw / 2, y = o.y - bh - 10;
      x = Math.max(6, Math.min(w - bw - 6, x));

      for (let guard = 0; guard < 30; guard++) {
        const hit = placed.find(r => x < r.x + r.w + 6 && x + bw + 6 > r.x && y < r.y + r.h + 4 && y + bh + 4 > r.y);

        if (!hit)
          break;

        y = hit.y - bh - 6;
      }

      placed.push({ x, y, w: bw, h: bh });

      el.style.transform = `translate(${x}px, ${y}px)`;

      const top = y + bh, len = Math.max(0, o.y - top);

      line.style.transform = `translate(${o.x}px, ${top}px)`;
      line.style.height = len + 'px';
    });
  }

  function setTab(t) {
    tab = t;

    document.body.dataset.tab = t;

    document.querySelectorAll('.tab').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t));

    $('docs').hidden = t !== 'how';

    try {
      history.replaceState(null, '', t === 'fly' ? location.pathname : '#' + t);
    } catch (e) {
      /* file:// */
    }

    if (t === 'how') {
      Docs.build();
      window.scrollTo(0, 0);
      return;
    }

    shadowDirty();

    wake();

    if (!hangar)
      buildHangar();

    const inHangar = t === 'hangar';
    hangar.visible = inHangar;

    $('labels').style.display = inHangar ? '' : 'none';

    [craft, cushion, blob, markers, ...vortices, ...Object.values(arrows)].forEach(o => { if (o) o.visible = !inHangar; });

    if (inHangar) {
      $('ovTitle').innerHTML = '<b>Ангар</b> · все аппараты в настоящих размерах';

      surface.material.map = waterTex;
      surface.material.normalMap = waterNormal;
      surface.material.roughness = 0.3;
      surface.material.needsUpdate = true;

      scene.background = skyTex; sun.castShadow = false;
      
      const zEnd = hangar.userData.zEnd;

      scene.fog = new T.Fog(0x6f7d89, zEnd * 2, zEnd * 8);

      surface.scale.set(zEnd * 20, zEnd * 20, 1);

      waterTex.repeat.set(zEnd * 20 / 12, zEnd * 20 / 12);

      requestAnimationFrame(() => { resize(); hangarOverview(); });
    } else {
      if (t === 'exp' && presetId !== 'model') {
        $('presetSel').value = 'model';
        loadPreset('model');
      }

      if (t === 'exp')
        requestAnimationFrame(() => { runExp1(); runExp2(); });

      setupSurface();
      placeCamera(true);

      $('ovTitle').innerHTML = `<b>${preset.name}</b>`;

      dirty = true;

      requestAnimationFrame(resize);
    }
  }

  document.querySelectorAll('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  document.querySelector('.brand').onclick = e => { e.preventDefault();setTab('fly'); };

  document.querySelectorAll('.tog').forEach(b => b.onclick = () => {
    const k = b.dataset.show;

    show[k] = !show[k];

    b.classList.toggle('on', show[k]); b.setAttribute('aria-pressed', show[k]);

    wake();
  });

  $('geToggle').onchange = () => { dirty = true; glideAnim = null; wake(); };

  function parsePairs(text) {
    const out = [];

    text.split(/\r?\n/).forEach(line => {
      line = line.trim();
      
      if (!line || line[0] === '#')
        return;

      let tok = line.split(/[\s;\t]+/).filter(Boolean);

      if (tok.length === 1 && line.includes(','))
        tok = line.split(',');

      if (tok.length < 2)
        return;

      const a = parseFloat(tok[0].replace(',', '.')), b = parseFloat(tok[1].replace(',', '.'));

      if (isFinite(a) && isFinite(b))
        out.push([a, b]);
    });

    return out.sort((p, q) => p[0] - q[0]);
  }

  function modelCfg() {
    const p = PR.model;
    return presetId === 'model' ? { c: cfg(), m: mass(), V: st.V, alpha: st.alpha, wind: st.wind }
      : { c: { b: p.b, chord: p.chord, shape: p.shape, endplates: p.endplates, cd0: p.cd0, clmax: p.clmax, alpha0: p.alpha0 }, m: p.massBase, V: p.V, alpha: p.alpha, wind: 0 };
  }

  function runExp1() {
    const data = parsePairs($('exp1Data').value);
    const M = modelCfg();
    const curve1 = [], curve0 = [];
    const hMax = Math.max(60, ...data.map(d => d[0]));

    for (let i = 0; i <= 40; i++) {
      const hc = 0.5 + (hMax - 0.5) * i / 40;
      
      curve1.push([hc, P.glide(M.c, M.m, hc / 100, M.V, M.alpha, M.wind, true).dist * 100]);
      curve0.push([hc, P.glide(M.c, M.m, hc / 100, M.V, M.alpha, M.wind, false).dist * 100]);
    }

    Charts.line($('expChart1'), {
      series: [{ data: curve1, color: '#8cc8ee', label: 'с экраном' }, { data: curve0, color: '#6b747e', label: 'без экрана', dash: [6, 4] },
               { data: data, color: '#ff6f66', label: 'опыт', points: true }],
      xlabel: 'высота запуска, см', ylabel: 'дальность, см', xmin: 0
    });

    if (!data.length) {
      $('exp1Table').innerHTML = '<p class="muted small">Впишите данные слева и нажмите «Рассчитать».</p>';
      return;
    }

    let e1 = 0, e0 = 0;

    const rows = data.map(([hc, d]) => {
      const s1 = P.glide(M.c, M.m, hc / 100, M.V, M.alpha, M.wind, true).dist * 100;
      const s0 = P.glide(M.c, M.m, hc / 100, M.V, M.alpha, M.wind, false).dist * 100;

      e1 += Math.abs(d - s1);
      e0 += Math.abs(d - s0);

      return `<tr><td>${num(hc, 1)}</td><td>${num(d, 0)}</td><td>${num(s1, 0)}</td><td>${num(s0, 0)}</td><td>${num((d - s1) / s1 * 100, 0)} %</td></tr>`;
    }).join('');

    const closer = e1 < e0 ? '<b class="good">ближе к расчёту с экраном</b>' : '<b class="warn">ближе к расчёту без экрана</b>';

    $('exp1Table').innerHTML = `<table class="tbl"><tr><th>Высота, см</th><th>Опыт, см</th><th>С экраном</th><th>Без экрана</th><th>Разница</th></tr>${rows}</table>
      <p class="small">Точки опыта ${closer}: средняя разница ${num(e1 / data.length, 0)} см против ${num(e0 / data.length, 0)} см.</p>
      <p class="muted small">Масса ${num(M.m * 1000, 0)} г, скорость запуска ${num(M.V, 1)} м/с, угол атаки ${num(M.alpha, 1)}°.</p>`;
  }

  function fitExp1() {
    const data = parsePairs($('exp1Data').value);

    if (!data.length)
      return;

    const [hc, d] = data[data.length - 1];
    const M = modelCfg();
    let lo = 1, hi = 15;

    const f = V => P.glide(M.c, M.m, hc / 100, V, M.alpha, M.wind, true).dist * 100 - d;

    if (f(lo) > 0 || f(hi) < 0) {
      $('exp1Table').innerHTML = '<p class="bad small">Скорость подобрать не удалось: проверьте массу и угол атаки во вкладке «Полёт».</p>';
      return;
    }

    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;

      if (f(m) > 0)
        hi = m;
      else
        lo = m;
    }

    if (presetId !== 'model')
      loadPreset('model');

    setSlider('V', roundTo((lo + hi) / 2, 0.1));

    runExp1();

    $('exp1Table').insertAdjacentHTML('afterbegin', `<p class="small">Скорость запуска подобрана: <b>${num(st.V, 1)} м/с</b>. При ней расчёт совпадает с опытом на высоте ${num(hc, 0)} см.</p>`);
  }

  function runExp2() {
    const data = parsePairs($('exp2Data').value);

    const M = modelCfg(), a = parseFloat($('rigAlpha').value) || 8;

    const help = gap => (P.aero(M.c, gap / 100, 5, a, true).L / P.aero(M.c, gap / 100, 5, a, false).L - 1) * 100;

    const curve = [];

    for (let i = 0; i <= 40; i++) {
      const g = 0.5 + 9.5 * i / 40;
      curve.push([g, help(g)]);
    }

    Charts.line($('expChart2'), {
      series: [{ data: curve, color: '#5fd49a', label: 'расчёт' }, { data: data, color: '#ff6f66', label: 'опыт', points: true }],
      xlabel: 'зазор до «земли», см', ylabel: 'помощь экрана, %', xmin: 0
    });

    $('exp2Table').innerHTML = data.length ? `<table class="tbl"><tr><th>Зазор, см</th><th>Опыт, %</th><th>Расчёт, %</th></tr>${data.map(([g, h]) => `<tr><td>${num(g, 1)}</td><td>${num(h, 0)}</td><td>${num(help(g), 0)}</td></tr>`).join('')}</table>` : '';
  }

  $('exp1Run').onclick = runExp1;
  $('exp1Fit').onclick = fitExp1;
  $('exp2Run').onclick = runExp2;

  $('exp1Example').onclick = () => {
    $('exp1Data').value = '# Выдуманные числа, только пример\n3 182\n6 216\n12 261\n24 334\n48 465';
    $('exp2Data').value = '# Выдуманные числа, только пример\n8 2\n4 6\n2 15\n1 38';

    runExp1();
    runExp2();
  };

  $('exp1File').onchange = e => {
    const f = e.target.files[0];

    if (!f)
      return;

    const rd = new FileReader();
    rd.onload = () => { $('exp1Data').value = rd.result; runExp1(); };
    rd.readAsText(f, 'utf-8');
  };

  const sel = $('presetSel');
  sel.innerHTML = Object.entries(PR).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
  sel.onchange = () => loadPreset(sel.value);

  $('trimBtn').onclick = () => {
    const a = P.trimAlpha(cfg(), st.mode === 'free' ? dyn.z : st.h, airV(), weight(), geOn());

    if (a === null)
      return;

    setSlider('alpha', Math.min(14, roundTo(a, 0.25)));

    changed(false, 'alpha');
  };

  $('resetBtn').onclick = () => loadPreset(presetId);

  const FPS_ACTIVE = 60, FPS_IDLE = 30, ACTIVE_MS = 2500;

  const clock = new T.Clock();

  let outTimer = 0, hudTimer = 0, lastHud = '';

  let running = false, stageOnScreen = true, lastInput = performance.now(), lastFrame = 0, vsync = 16.7, lastRaf = 0;

  const canRun = () => !document.hidden && tab !== 'how' && stageOnScreen;

  function wake() {
    if (running || !canRun())
      return;

    running = true;

    lastFrame = 0; 
    lastRaf = 0;

    clock.getDelta();

    requestAnimationFrame(loop);
  }

  function poke() {
    lastInput = performance.now();

    wake();
  }

  ['pointerdown', 'wheel', 'keydown', 'input', 'touchstart'].forEach(e => window.addEventListener(e, poke, { passive: true }));

  view.addEventListener('pointermove', poke, { passive: true });

  document.addEventListener('visibilitychange', wake);

  let dragging = false;

  controls.addEventListener('start', () => { dragging = true; poke(); });
  controls.addEventListener('end', () => { dragging = false; poke(); });

  if (window.IntersectionObserver)
    new IntersectionObserver(es => { stageOnScreen = es[0].isIntersecting; wake(); }).observe(view);

  function loop(now) {
    if (!canRun()) {
      running = false;
      return;
    }

    requestAnimationFrame(loop);

    if (lastRaf)
      vsync += (Math.min(now - lastRaf, 50) - vsync) * 0.1;

    lastRaf = now;

    const active = camTween || now - lastInput < ACTIVE_MS;

    const interval = 1000 / (active ? FPS_ACTIVE : FPS_IDLE);

    if (lastFrame && now - lastFrame < interval - vsync * 0.5)
      return;

    adapt(lastFrame ? now - lastFrame : interval, interval);

    lastFrame = now;

    frame();
  }

  let slowFor = 0;
  function adapt(gap, interval) {
    if (gap > interval * 1.6 && gap < 500)
      slowFor += gap;
    else
      slowFor = Math.max(0, slowFor - gap);

    if (slowFor > 2000 && Q.dpr > Q.minDpr) {
      Q.dpr = Math.max(Q.minDpr, Q.dpr - 0.25);

      renderer.setPixelRatio(Q.dpr);

      resize();

      slowFor = 0;

    }
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (needRebuild)
      rebuildCraft();

    if (camTween) {
      camTween.t = Math.min(1, camTween.t + dt / 1.1);

      const k = 1 - Math.pow(1 - camTween.t, 4);

      camera.position.lerpVectors(camTween.p0, camTween.p1, k);
      controls.target.lerpVectors(camTween.t0, camTween.t1, k);

      if (camTween.t >= 1)
        camTween = null;
    }

    controls.update();

    if (dragging)
      lastInput = performance.now();

    if (tab === 'hangar') {
      hangar.children.forEach(m => Models.spin(m, dt, 3.2));

      renderer.render(scene, camera);

      placeLabels();

      return;
    }

    if (craft)
      Models.spin(craft, dt, st.mode === 'glide' ? 0 : 3.2);

    let z = st.h, alphaVis = st.alpha, ground = st.V, hud = '';

    if (st.mode === 'free') {
      const c = cfg(), W = weight(), m = mass(), steps = Math.max(8, Math.ceil(dt / 0.001)), h = dt / steps, ge = geOn();

      for (let i = 0; i < steps; i++) {
        dyn.t += h;

        const gust = st.wind ? 0.25 * Math.abs(st.wind) * (Math.sin(1.3 * dyn.t) + 0.6 * Math.sin(3.7 * dyn.t + 1)) : 0;
        const Va = Math.max(st.V + st.wind + gust, 0.5);
        const aEff = st.alpha - Math.atan2(dyn.vz, Va) * 180 / Math.PI;
        const L = P.aero(c, Math.max(dyn.z, 1e-3), Va, aEff, ge).L;

        dyn.vz += (L - W) / m * h; dyn.z += dyn.vz * h;

        const zMin = 0.01 * st.b;

        dyn.touch = false;

        if (dyn.z < zMin) {
          dyn.z = zMin;
          dyn.vz = Math.abs(dyn.vz) * 0.2;
          dyn.touch = true;
        }

        if (dyn.z > 4 * st.b) {
          dyn.z = 4 * st.b;
          dyn.vz = 0;
        }
      }

      z = dyn.z;

      hud = `Высота <b>${fLen(z)}</b>${dyn.touch ? ' · <span class="bad">касание воды</span>' : ''}`;
    } else if (st.mode === 'glide') {
      if (!glideAnim) 
        glideAnim = { g: P.glide(cfg(), mass(), st.h, st.V, st.alpha, st.wind, geOn()), t: 0, hold: 0, x: 0 };

      const A = glideAnim, rate = 0.6, path = A.g.path;

      if (A.t < A.g.t) {
        A.t += dt * rate;
        const f = Math.min(A.t / A.g.t, 1) * (path.length - 1), i = Math.floor(f), k = f - i;
        const p0 = path[i], p1 = path[Math.min(i + 1, path.length - 1)];
        const x = p0[0] + (p1[0] - p0[0]) * k;

        z = Math.max(p0[1] + (p1[1] - p0[1]) * k, 0);

        ground = (x - A.x) / Math.max(dt, 1e-4);

        A.x = x;

        alphaVis = st.alpha + Math.atan2(p1[1] - p0[1], p1[0] - p0[0] || 1e-6) * 180 / Math.PI;

        hud = `Пролетела <b>${fLen(x)}</b> · замедлено в ${num(1 / rate, 1)} раза`;
      } else {
        z = 0;
        ground = 0;
        A.hold += dt;

        hud = `Приземлилась: <b>${fLen(A.g.dist)}</b>`;

        if (A.hold > 1.5)
          glideAnim = null;
      }
    } else {
      hud = `Высота <b>${fLen(st.h)}</b> · скорость <b>${fSpeed(st.V)}</b>`;
    }

    hudTimer += dt;

    if (hudTimer > 0.1) {
      hudTimer = 0;
      if (hud !== lastHud) {
        $('ovState').innerHTML = hud;
        lastHud = hud;
      }
    }

    const shift = ground * dt;
    surface.material.map.offset.x += shift / tileSize;
    markers.children.forEach(m => { m.position.x -= shift;if (m.position.x < -markerRange) m.position.x += 2 * markerRange; });

    outTimer += dt;

    if ((dirty && outTimer > 0.12) || (st.mode === 'free' && outTimer > 0.4)) {
      outTimer = 0;

      dirty = false;

      last = compute();

      renderOutputs(last);
    }
    if (last) {
      fx.W = last.W;
      fx.r = P.aero(cfg(), Math.max(z, 1e-3), airV(), st.alpha, geOn());

      updateEffects(z, alphaVis, fx);

      const d = camFollow.set(0, z + preset.H * 0.4, 0).sub(controls.target).multiplyScalar(Math.min(1, dt * 4));

      controls.target.add(d);

      camera.position.add(d);
    }

    renderer.render(scene, camera);
  }

  const fx = { W: 0, r: null }, camFollow = new T.Vector3();

  const startCraft = (function () { try { return new URLSearchParams(location.search).get('craft'); } catch (e) { return null; } })();

  const startId = PR[startCraft] ? startCraft : 'model';

  $('presetSel').value = startId;

  loadPreset(startId);

  resize();

  wake();

  const fromHash = () => {
    const h = location.hash.slice(1);
    const t = ['hangar', 'exp', 'how'].includes(h) ? h : (h === '' ? 'fly' : null);

    if (t && t !== tab)
      setTab(t);
  };

  window.addEventListener('hashchange', fromHash);

  fromHash();

  if (window.ResizeObserver)
    new ResizeObserver(resize).observe(view);
})();
