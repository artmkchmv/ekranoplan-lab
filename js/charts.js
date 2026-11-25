window.Charts = (function () {
  'use strict';

  function niceStep(range, n) {
    const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;

    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }

  function fmt(v) {
    const a = Math.abs(v);

    if (a >= 1000)
      return (v / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k';

    if (a >= 10 || a === 0)
      return v.toFixed(0);

    if (a >= 1)
      return v.toFixed(1);

    return v.toFixed(2);
  }

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#333';
  }

  function line(canvas, opts) {
    const dpr = window.devicePixelRatio || 1;

    const W = canvas.clientWidth || 300, H = canvas.clientHeight || 180;

    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }

    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const ink = css('--ink'), muted = css('--muted'), grid = css('--grid');

    const m = { l: 46, r: 10, t: 22, b: 34 };

    let xs = [], ys = [];

    opts.series.forEach(s => s.data.forEach(p => { if (isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); } }));

    if (opts.marker && isFinite(opts.marker.y)) {
      xs.push(opts.marker.x);
      ys.push(opts.marker.y);
    }

    if (opts.hline)
      ys.push(opts.hline.y);

    if (!xs.length) {
      g.fillStyle = muted;
      g.font = '13px sans-serif';
      g.fillText('Нет данных', 10, 20);

      return;
    }

    let x0 = opts.xmin !== undefined ? opts.xmin : Math.min(...xs), x1 = opts.xmax !== undefined ? opts.xmax : Math.max(...xs);
    let y0 = opts.ymin !== undefined ? opts.ymin : Math.min(0, ...ys), y1 = Math.max(...ys);

    if (x1 === x0)
      x1 = x0 + 1;

    if (y1 === y0)
      y1 = y0 + 1;

    y1 += (y1 - y0) * 0.08;

    const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
    const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);

    g.font = '11px sans-serif';
    g.strokeStyle = grid;
    g.fillStyle = muted;
    g.lineWidth = 1;

    const sy = niceStep(y1 - y0, 4);

    for (let v = Math.ceil(y0 / sy) * sy; v <= y1; v += sy) {
      g.beginPath();
      g.moveTo(m.l, Y(v));
      g.lineTo(W - m.r, Y(v));
      g.stroke();
      g.textAlign = 'right';
      g.fillText(fmt(v), m.l - 4, Y(v) + 4);
    }

    const sx = niceStep(x1 - x0, 5);

    g.textAlign = 'center';

    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx)
      g.fillText(fmt(v), X(v), H - m.b + 14);

    g.fillStyle = ink;
    g.fillText(opts.xlabel || '', (m.l + W - m.r) / 2, H - 4);
    g.save();
    g.translate(11, (m.t + H - m.b) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText(opts.ylabel || '', 0, 0);
    g.restore();

    if (opts.hline) {
      g.strokeStyle = opts.hline.color;
      g.setLineDash([5, 4]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(m.l, Y(opts.hline.y));
      g.lineTo(W - m.r, Y(opts.hline.y));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = opts.hline.color;
      g.textAlign = 'right';
      g.fillText(opts.hline.label || '', W - m.r - 2, Y(opts.hline.y) - 4);
    }

    let lx = m.l + 4;
    opts.series.forEach(s => {
      g.strokeStyle = s.color;
      g.fillStyle = s.color;
      g.lineWidth = s.width || 2;
      g.setLineDash(s.dash || []);

      if (!s.points) {
        g.beginPath();

        let first = true;

        s.data.forEach(p => { if (!isFinite(p[1])) { first = true; return; } if (first) { g.moveTo(X(p[0]), Y(p[1])); first = false; } else g.lineTo(X(p[0]), Y(p[1])); });

        g.stroke();
      } else {
        s.data.forEach(p => { if (isFinite(p[1])) { g.beginPath(); g.arc(X(p[0]), Y(p[1]), 4.5, 0, 7); g.fill(); } });
      }

      g.setLineDash([]);

      if (s.label) {
        g.font = '11px sans-serif';
        g.textAlign = 'left';
        g.fillRect(lx, 7, 12, 3);
        g.fillStyle = ink;
        g.fillText(s.label, lx + 15, 12);

        lx += g.measureText(s.label).width + 30;
      }
    });
    if (opts.marker && isFinite(opts.marker.y)) {
      g.fillStyle = opts.marker.color || '#e53e3e';
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(opts.marker.x), Y(opts.marker.y), 6, 0, 7);
      g.fill();
      g.stroke();

      if (opts.marker.label) {
        g.fillStyle = ink;
        g.textAlign = 'left';
        g.fillText(opts.marker.label, X(opts.marker.x) + 9, Y(opts.marker.y) - 6);
      }
    }
  }

  function bars(canvas, items, ylabel) {
    const dpr = window.devicePixelRatio || 1;

    const W = canvas.clientWidth || 300, H = canvas.clientHeight || 180;

    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const ink = css('--ink'), muted = css('--muted'), grid = css('--grid');

    const m = { l: 46, r: 8, t: 12, b: 46 };

    const vmax = Math.max(...items.map(i => i.value), 1e-9) * 1.12;

    const Y = v => H - m.b - v / vmax * (H - m.t - m.b);

    g.font = '11px sans-serif';
    g.strokeStyle = grid;
    g.fillStyle = muted;

    const s = niceStep(vmax, 4);

    for (let v = 0; v <= vmax; v += s) {
      g.beginPath();
      g.moveTo(m.l, Y(v));
      g.lineTo(W - m.r, Y(v));
      g.stroke();
      g.textAlign = 'right';
      g.fillText(fmt(v), m.l - 4, Y(v) + 4);
    }

    const bw = (W - m.l - m.r) / items.length;

    items.forEach((it, i) => {
      g.fillStyle = it.color; const x = m.l + i * bw + bw * 0.18;
      g.fillRect(x, Y(it.value), bw * 0.64, Y(0) - Y(it.value));
      g.fillStyle = ink;
      g.textAlign = 'center';
      g.fillText(fmt(it.value), x + bw * 0.32, Y(it.value) - 3);
      g.fillStyle = muted;

      const words = it.label.split(' ');
      words.forEach((w, k) => g.fillText(w, x + bw * 0.32, H - m.b + 13 + k * 12));
    });

    g.fillStyle = ink;
    g.save();
    g.translate(11, (m.t + H - m.b) / 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.fillText(ylabel || '', 0, 0);
    g.restore();
  }

  return { line, bars };
})();
