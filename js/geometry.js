/* 並べる・整える計算 */
window.SS = window.SS || {};

(function (SS) {
  const G = {};
  const DEG = 180 / Math.PI;

  // 角度: 指揮者から見て真後ろ(舞台奥)が0、左がマイナス、右がプラス（ラジアン）
  G.polar = function (p, c) {
    const dx = p.x - c.x, dy = c.y - p.y;
    return { r: Math.hypot(dx, dy), t: Math.atan2(dx, dy) };
  };
  G.fromPolar = function (r, t, c) {
    return { x: c.x + r * Math.sin(t), y: c.y - r * Math.cos(t) };
  };
  // 回転角（度）: 0 = 客席（下）向き
  G.faceAngle = function (p, target) {
    const dx = target.x - p.x, dy = target.y - p.y;
    if (Math.hypot(dx, dy) < 1) return 0;
    return Math.atan2(-dx, dy) * DEG;
  };

  const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
  G.mean = mean;

  // 1次元のクラスタリング（値が近いもの同士を同じ列とみなす）
  G.cluster1D = function (items, key, gap) {
    const sorted = items.slice().sort((a, b) => key(a) - key(b));
    const rows = [];
    let cur = [];
    let last = null;
    for (const it of sorted) {
      const v = key(it);
      if (last !== null && v - last > gap) { rows.push(cur); cur = []; }
      cur.push(it);
      last = v;
    }
    if (cur.length) rows.push(cur);
    return rows;
  };

  // 列の判定（扇形）: 半径でグループ分け
  G.arcRows = function (items, c, gap) {
    return G.cluster1D(items, it => G.polar(it, c).r, gap || 45);
  };
  G.lineRows = function (items, gap) {
    return G.cluster1D(items, it => -it.y, gap || 45); // 前（下）の列から
  };

  // 点が多角形の中にあるか（投げ縄選択）
  G.inPolygon = function (p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };

  // 扇形っぽいか・直線っぽいか判定
  G.guessShape = function (items, c) {
    if (items.length < 3) return 'arc';
    const ar = G.arcRows(items, c);
    const lr = G.lineRows(items);
    const arcErr = mean(ar.map(r => std(r.map(it => G.polar(it, c).r)))) + ar.length * 2;
    const lineErr = mean(lr.map(r => std(r.map(it => it.y)))) + lr.length * 2;
    return arcErr <= lineErr ? 'arc' : 'line';
  };

  // 席の順番（前の列から、左→右）
  G.seatOrder = function (items, c) {
    const shape = G.guessShape(items, c);
    const rows = shape === 'arc' ? G.arcRows(items, c) : G.lineRows(items);
    const out = [];
    rows.forEach(row => {
      if (shape === 'arc') row.sort((a, b) => G.polar(a, c).t - G.polar(b, c).t);
      else row.sort((a, b) => a.x - b.x);
      out.push(...row);
    });
    return out;
  };

  // 列と列の間隔をそろえる（もともと大体そろっているときだけ）
  function evenRadii(radii) {
    if (radii.length < 3) return radii;
    const gaps = [];
    for (let i = 1; i < radii.length; i++) gaps.push(radii[i] - radii[i - 1]);
    const g = mean(gaps);
    if (std(gaps) > g * 0.35) return radii;
    return radii.map((_, i) => radii[0] + g * i);
  }

  // 1つの列の中で大きくあいている所（パートの切れ目・通路）で分ける
  function segments(vals) {
    if (vals.length < 3) return [[0, vals.length - 1]];
    const gaps = [];
    for (let i = 1; i < vals.length; i++) gaps.push(vals[i] - vals[i - 1]);
    const sorted = gaps.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const segs = [];
    let s = 0;
    for (let i = 1; i < vals.length; i++) {
      if (gaps[i - 1] > med * 1.9) { segs.push([s, i - 1]); s = i; }
    }
    segs.push([s, vals.length - 1]);
    return segs;
  }

  // 位置 vals(並び済み) を等間隔にする。切れ目は残す。
  function evenOut(vals, center, opt) {
    const segs = segments(vals);
    const out = vals.slice();
    const whole = segs.length === 1;
    segs.forEach(([a, b]) => {
      const n = b - a + 1;
      let v0 = vals[a], v1 = vals[b];
      if (whole && opt.symmetric && v0 < center && v1 > center) {
        const s = (Math.abs(center - v0) + Math.abs(v1 - center)) / 2;
        v0 = center - s; v1 = center + s;
      }
      const need = (n - 1) * opt.minGapV;
      if (v1 - v0 < need) { const m = (v0 + v1) / 2; v0 = m - need / 2; v1 = m + need / 2; }
      for (let i = 0; i < n; i++) out[a + i] = n === 1 ? (v0 + v1) / 2 : v0 + ((v1 - v0) * i) / (n - 1);
    });
    return out;
  }

  // 列のばらつき（小さいほどきれいに並んでいる）
  G.rowSpread = function (items, c, shape) {
    const rows = shape === 'arc' ? G.arcRows(items, c) : G.lineRows(items);
    return mean(rows.map(r => std(r.map(it => (shape === 'arc' ? G.polar(it, c).r : it.y)))));
  };

  // 弧のゆるさ：curve 1＝指揮者を中心にした扇形、0 に近づくほど中心を客席側へ遠ざけて、まっすぐに近づける（cm）
  G.arcShift = k => (k >= 0.999 ? 0 : 300 * (1 / Math.max(0.03, k) - 1));

  // 扇形にそろえる。items は指揮者を中心にした扇形の並び（に近いもの）。
  // curve：弧のゆるさ（1＝扇形、0＝まっすぐ）。ゆるくするときは、各列の人がいる辺りを動かさずに半径を大きくする
  G.tidyArc = function (items, c, opt) {
    opt = Object.assign({ symmetric: true, evenRows: true, minGap: 62, face: true, curve: 1 }, opt);
    const d1 = G.arcShift(opt.curve);
    const rows = G.arcRows(items, c);
    // それぞれの列の半径 R と、弧に沿った位置 s
    const info = rows.map(row => {
      const R = Math.max(40, mean(row.map(it => G.polar(it, c).r)));
      const s = row.map(it => Math.atan2(it.x - c.x, c.y - it.y) * R);
      return { row, R, s };
    });
    let radii = info.map(x => x.R);
    if (opt.evenRows) radii = evenRadii(radii);
    info.forEach((x, ri) => {
      const R = Math.max(40, radii[ri]);
      const R1 = R + d1;
      // 動かさない基準の高さ：左右に広がる列は、どの列も扇形の真ん中の 85% の所（列の間隔がほぼ保たれる）。
      // 片側だけの列（上手の低音など）は、その人たちがいる辺り
      const oneSide = x.s.every(v => v > 0) || x.s.every(v => v < 0);
      const sRef = oneSide ? Math.min(R * 1.4, mean(x.s.map(Math.abs))) : R * Math.acos(0.85);
      const yRef = c.y - R * Math.cos(sRef / R);
      const cy = d1 > 0 ? yRef + R1 * Math.cos(sRef / R1) : c.y;
      const pol = x.row.map((it, i) => ({ it, s: x.s[i] })).sort((a, b) => a.s - b.s);
      const ss = evenOut(pol.map(p => p.s), 0, Object.assign({}, opt, { minGapV: opt.minGap }));
      pol.forEach((p, i) => {
        const th = ss[i] / R1;
        p.it.x = c.x + R1 * Math.sin(th);
        p.it.y = cy - R1 * Math.cos(th);
        if (opt.face) p.it.rot = G.faceAngle(p.it, c);
      });
    });
    return rows.length;
  };

  // 横一列にそろえる
  G.tidyLine = function (items, c, opt) {
    opt = Object.assign({ symmetric: true, evenRows: true, minGap: 62 }, opt);
    const rows = G.lineRows(items);
    let ys = rows.map(row => -mean(row.map(it => it.y)));
    if (opt.evenRows) ys = evenRadii(ys);
    rows.forEach((row, ri) => {
      const y = -ys[ri];
      row.sort((a, b) => a.x - b.x);
      const xs = evenOut(row.map(it => it.x), c.x, Object.assign({}, opt, { minGapV: opt.minGap }));
      row.forEach((it, i) => { it.x = xs[i]; it.y = y; it.rot = 0; });
    });
    return rows.length;
  };

  // 重なりを直す（少しずつ押し広げる）
  G.fixOverlap = function (items, minD, fixed) {
    fixed = fixed || [];
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d < minD) {
            if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy); }
            const push = (minD - d) / 2 + 0.2;
            a.x -= (dx / d) * push; a.y -= (dy / d) * push;
            b.x += (dx / d) * push; b.y += (dy / d) * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    void fixed;
  };

  // 扇形・直線の座席を作る
  G.generate = function (rowCounts, opt, c) {
    const out = [];
    rowCounts.forEach((n, ri) => {
      if (!(n > 0)) return;
      const R = opt.r0 + ri * opt.gap;
      if (opt.shape === 'line') {
        const y = c.y - R;
        const w = (n - 1) * opt.spacing;
        for (let i = 0; i < n; i++) out.push({ x: c.x - w / 2 + i * opt.spacing, y, rot: 0, row: ri });
      } else {
        let span = ((n - 1) * opt.spacing) / R;
        const maxSpan = Math.PI * 0.95;
        if (span > maxSpan) span = maxSpan;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
          const p = G.fromPolar(R, t, c);
          out.push({ x: p.x, y: p.y, rot: G.faceAngle(p, c), row: ri });
        }
      }
    });
    return out;
  };

  // "Fl×4, Ob×2, Cl1" → ['Fl','Fl','Fl','Fl','Ob','Ob','Cl1']
  G.parseSpec = function (text) {
    const out = [];
    String(text || '').split(/[,、，\n\/]+/).forEach(tok => {
      tok = tok.trim();
      if (!tok) return;
      const m = /^(.+?)\s*(?:[×xX*＊]\s*(\d+)|\s(\d+)人?)$/.exec(tok);
      if (m) {
        const n = parseInt(m[2] || m[3], 10);
        for (let i = 0; i < Math.min(n, 200); i++) out.push(m[1].trim());
      } else {
        out.push(tok);
      }
    });
    return out;
  };

  // セクター（扇の一部）に奏者を並べる：テンプレート作成用
  G.sector = function (label, count, t0deg, t1deg, r0, rowGap, perRow, c, spacing) {
    const res = [];
    let left = count, row = 0;
    spacing = spacing || 72;
    while (left > 0 && row < 20) {
      const R = r0 + row * rowGap;
      const t0 = t0deg / DEG, t1 = t1deg / DEG;
      const fit = Math.max(1, Math.floor((Math.abs(t1 - t0) * R) / spacing));
      const n = Math.min(left, perRow || fit, fit);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? (t0 + t1) / 2 : t0 + ((t1 - t0) * (i + 0.5)) / n;
        const p = G.fromPolar(R, t, c);
        res.push({ type: 'player', label, x: p.x, y: p.y, rot: G.faceAngle(p, c) });
      }
      left -= n; row++;
    }
    return res;
  };

  SS.geo = G;
})(window.SS);
