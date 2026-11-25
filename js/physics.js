window.Phys = (function () {
  'use strict';
  const G = 9.81;
  const RHO = 1.225;
  const FUEL_J_PER_KG = 43e6;
  const ETA_FUEL = 0.21;
  const ETA_ELEC = 0.6;
  const ETA_PROP = 0.7;

  const SHAPES = {
    rect:  { name: 'Прямоугольное', e: 0.80, cp: 1.0 },
    taper: { name: 'Трапеция',      e: 0.90, cp: 0.8 },
    delta: { name: 'Треугольное',   e: 0.75, cp: 0.45 }
  };

  function mcCormick(h, b) {
    const x = Math.pow(16 * Math.max(h, 1e-4) / b, 2);
    return x / (1 + x);
  }


  function aero(cfg, h, Va, alphaDeg, ge) {
    if (ge === undefined) 
      ge = true;

    const S = cfg.b * cfg.chord;
    const AR = cfg.b * cfg.b / S;
    const hep = Math.min(cfg.epH || 0.35 * cfg.chord, 0.9 * Math.max(h, 1e-4));
    const ARep = cfg.endplates ? AR * (1 + 1.9 * hep / cfg.b) : AR;
    const hGE = cfg.endplates ? Math.max(h - hep, 0.25 * h) : h;
    const phi = ge ? mcCormick(hGE, cfg.b) : 1;
    const ARe = Math.min(ARep / phi, 300);
    const a0 = 2 * Math.PI;
    const a = a0 / (1 + a0 / (Math.PI * ARe));
    const al = (alphaDeg - cfg.alpha0) * Math.PI / 180;

    let CL = a * al, stall = false;

    if (CL > cfg.clmax) {
      stall = true;
      CL = Math.max(cfg.clmax - (CL - cfg.clmax) * 0.6, 0.3 * cfg.clmax);
    }

    const e = SHAPES[cfg.shape].e;
    const CDi = CL * CL / (Math.PI * e * ARe);
    const CD = cfg.cd0 + CDi + (stall ? 0.15 : 0);
    const q = 0.5 * RHO * Va * Va;
    const L = q * S * CL, D = q * S * CD;

    return { S, AR, ARep, ARe, phi, a, CL, CDi, CD, q, L, D, K: D > 0 ? L / D : 0, stall };
  }

  function trimAlpha(cfg, h, Va, W, ge) {
    const r = aero(cfg, h, Va, cfg.alpha0 + 1, ge);

    const CLreq = W / (r.q * r.S);

    if (!(CLreq > 0) || CLreq > cfg.clmax)
      return null;

    return cfg.alpha0 + CLreq / r.a * 180 / Math.PI;
  }

  function equilibriumHeight(cfg, Va, alphaDeg, W, hMin, hMax) {
    const f = h => aero(cfg, h, Va, alphaDeg).L - W;
    if (f(hMax) > 0)
      return { h: null, why: 'up' };

    if (f(hMin) < 0)
      return { h: null, why: 'down' };

    let lo = hMin, hi = hMax;

    for (let i = 0; i < 50; i++) {
      const m = 0.5 * (lo + hi);
      if (f(m) > 0)
        lo = m;
      else
        hi = m;
    }

    return { h: 0.5 * (lo + hi), why: 'ok' };
  }

  function heightStiffness(cfg, h, Va, alphaDeg) {
    const dh = 0.1 * cfg.b;

    const L0 = aero(cfg, h, Va, alphaDeg).L;
    const Llow = aero(cfg, Math.max(h - dh * 0.5, 1e-3), Va, alphaDeg).L;
    const Lhigh = aero(cfg, h + dh * 0.5, Va, alphaDeg).L;

    return L0 > 0 ? (Llow - Lhigh) / L0 * 100 : 0;
  }

  function pitchShiftIllustr(cfg, h) {
    const phi = aero(cfg, h, 10, cfg.alpha0 + 2).phi;
    return 25 * (1 - phi) * SHAPES[cfg.shape].cp * (cfg.endplates ? 0.85 : 1);
  }

  function glide(cfg, m, h0, V0, alphaDeg, wind, ge) {
    let x = 0, z = h0, vx = V0, vz = 0, t = 0;
    const dt = 0.0015, W = m * G, path = [[0, z]];
    let n = 0;

    while (t < 30) {
      const ax_ = vx + (wind || 0), Va = Math.hypot(ax_, vz);

      if (Va < 0.05)
        break;

      const r = aero(cfg, Math.max(z, 1e-3), Va, alphaDeg, ge);

      const ux = ax_ / Va, uz = vz / Va;
      const Fx = -r.D * ux - r.L * uz;
      const Fz = -r.D * uz + r.L * ux - W;

      vx += Fx / m * dt;
      vz += Fz / m * dt;

      x += vx * dt;
      z += vz * dt; t += dt;

      if (++n % 12 === 0)
        path.push([x, z]);

      if (z <= 0) {
        path.push([x, 0]);
        return { dist: x, t, path, ok: true };
      }

      if (z > h0 + 50 * cfg.chord + 3)
        break;
    }

    return { dist: x, t, path, ok: false };
  }

  function thrust(engine, Va, pct) {
    if (!engine)
      return 0;

    const k = (pct || 100) / 100;

    if (engine.type === 'jet')
      return engine.T_N * k;

    return ETA_PROP * engine.P_W * k / Math.max(Va, 5);
  }

  function maxSpeed(cfg, engine, pct, h, W, wind, vCap) {
    if (!engine)
      return null;

    let best = null;

    for (let V = 3; V <= (vCap || 300); V += 0.5) {
      const Va = V + (wind || 0);

      if (Va <= 1)
        continue;

      const al = trimAlpha(cfg, h, Va, W);

      if (al === null)
        continue;

      const r = aero(cfg, h, Va, al);

      if (thrust(engine, Va, pct) >= r.D)
        best = V;
    }
    
    return best;
  }

  return { G, RHO, FUEL_J_PER_KG, ETA_FUEL, ETA_ELEC, ETA_PROP, SHAPES,
           mcCormick, aero, trimAlpha, equilibriumHeight, heightStiffness, pitchShiftIllustr, glide, thrust, maxSpeed };
})();
