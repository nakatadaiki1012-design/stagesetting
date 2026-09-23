/* 描画の共通部分・画像書き出し・保存・共有 */
window.SS = window.SS || {};

(function (SS) {
  const R = {};

  // 舞台の形
  //  rect：四角／apron：前が丸い張り出し／trapezoid：台形／shell：音響反射板（奥の幅 bw）
  //  arc：前のふちが弧（サントリーホール・ミューザ・みなとみらいなど）。d＝中心の奥行、sag＝弧のふくらみ、bw＝奥の幅
  //  round：奥の直線から横〜前まで一続きの丸い形（円形・楕円形の舞台）
  const CURVED = new Set(['arc', 'round']);
  R.isCurved = stage => CURVED.has(stage.shape);
  R.backWidth = function (stage) {
    if (stage.shape === 'shell' || CURVED.has(stage.shape)) return Math.min(stage.w, stage.bw || stage.w * 0.7);
    if (stage.shape === 'trapezoid') return stage.w * 0.8;
    return stage.w;
  };
  R.arcSag = stage => Math.max(0, Math.min(stage.d * 0.6, stage.sag == null ? Math.round(stage.w * 0.08) : stage.sag));
  R.stagePoly = function (stage) {
    const w = stage.w, d = stage.d, b = R.backWidth(stage);
    if (stage.shape === 'apron') {
      const pts = [[0, 0], [w, 0], [w, d]];
      for (let i = 1; i < 24; i++) { const t = i / 24; pts.push([w * (1 - t), d + 2 * t * (1 - t) * d * 0.28]); }
      pts.push([0, d]);
      return pts;
    }
    if (stage.shape === 'arc') {
      // 前の角 (0, d−sag)・(w, d−sag) を通り、中心で d になる円弧
      const sg = R.arcSag(stage), yc = d - sg;
      const pts = [[(w - b) / 2, 0], [(w + b) / 2, 0], [w, yc]];
      if (sg > 0.5) {
        const r = (w * w / 4 + sg * sg) / (2 * sg), cy = d - r;
        const a0 = Math.asin(Math.min(1, (w / 2) / r));
        for (let i = 1; i < 32; i++) { const t = a0 - (2 * a0 * i) / 32; pts.push([w / 2 + r * Math.sin(t), cy + r * Math.cos(t)]); }
      }
      pts.push([0, yc]);
      return pts;
    }
    if (stage.shape === 'round') {
      // 奥の直線の両端を通り、横幅 w・奥行 d になる楕円
      const u = Math.min(0.999, b / w), ry = d / (1 + Math.sqrt(1 - u * u)), rx = w / 2, cy = d - ry;
      const t0 = Math.atan2(u, -Math.sqrt(1 - u * u)); // 奥の右端
      const pts = [[(w - b) / 2, 0], [(w + b) / 2, 0]];
      for (let i = 1; i < 48; i++) { const t = t0 - (2 * t0 * i) / 48; pts.push([w / 2 + rx * Math.sin(t), cy - ry * Math.cos(t)]); }
      return pts;
    }
    return [[(w - b) / 2, 0], [(w + b) / 2, 0], [w, d], [0, d]];
  };
  R.stagePath = function (stage) {
    const w = stage.w, d = stage.d;
    switch (stage.shape) {
      case 'apron': return `M0 0H${w}V${d}Q${w / 2} ${d + d * 0.28} 0 ${d}Z`;
      case 'trapezoid': case 'shell': {
        const b = R.backWidth(stage);
        return `M${(w - b) / 2} 0H${(w + b) / 2}L${w} ${d}H0Z`;
      }
      case 'arc': case 'round': return 'M' + R.stagePoly(stage).map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
      default: return `M0 0H${w}V${d}H0Z`;
    }
  };
  // 奥行 y の位置で使える左右の範囲 [左, 右]
  R.xRange = function (stage, y) {
    if (CURVED.has(stage.shape)) {
      const poly = R.stagePoly(stage), yy = Math.max(0.01, Math.min(R.frontY(stage) - 0.01, y));
      let l = Infinity, r = -Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length];
        if ((a[1] <= yy && c[1] >= yy) || (c[1] <= yy && a[1] >= yy)) {
          const x = Math.abs(c[1] - a[1]) < 1e-6 ? a[0] : a[0] + ((yy - a[1]) / (c[1] - a[1])) * (c[0] - a[0]);
          l = Math.min(l, x); r = Math.max(r, x);
        }
      }
      return l <= r ? [l, r] : [stage.w / 2, stage.w / 2];
    }
    const b = R.backWidth(stage);
    const t = Math.max(0, Math.min(1, y / stage.d));
    const half = (b + (stage.w - b) * t) / 2;
    return [stage.w / 2 - half, stage.w / 2 + half];
  };
  // 左右の位置 x での、舞台の前のふち（客席側）の y
  R.frontAt = function (stage, x) {
    if (!CURVED.has(stage.shape)) return stage.d;
    const poly = R.stagePoly(stage);
    let best = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length];
      if ((a[0] - x) * (c[0] - x) <= 0 && Math.abs(c[0] - a[0]) > 1e-6) best = Math.max(best, a[1] + ((x - a[0]) / (c[0] - a[0])) * (c[1] - a[1]));
    }
    return best || stage.d;
  };
  // 点がステージの内側（margin だけ内側）に入るように寄せる
  R.clampToStage = function (stage, p, margin) {
    margin = margin || 0;
    let y = Math.max(margin, Math.min(R.frontY(stage) - margin, p.y));
    if (CURVED.has(stage.shape)) y = Math.min(y, R.frontAt(stage, Math.max(0, Math.min(stage.w, p.x))) - margin);
    let [l, r] = R.xRange(stage, y);
    if (r - l < margin * 2) { const m = (l + r) / 2; l = m - margin; r = m + margin; }
    return { x: Math.max(l + margin, Math.min(r - margin, p.x)), y };
  };
  R.insideStage = function (stage, p, margin) {
    const q = R.clampToStage(stage, p, margin || 0);
    return Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5;
  };
  R.frontY = stage => stage.d + (stage.shape === 'apron' ? stage.d * 0.14 : 0);

  // grid：方眼の間隔（cm）。0／false で表示しない（true は 50cm）
  // 舞台図の慣例どおり、線は「舞台の中心線」と「舞台の前のふち」から数える（1.82m＝1間＝平台の6尺）
  R.stageSVG = function (doc, grid) {
    const st = doc.stage;
    const p = R.stagePath(st);
    let s = `<path d="${p}" fill="#fbf6ec" stroke="#b89b6a" stroke-width="6"/>`;
    const g = grid === true ? 50 : +grid || 0;
    if (g) {
      const fy = R.frontY(st), cx = st.w / 2;
      let d = '';
      for (let x = cx % g; x <= st.w; x += g) if (Math.abs(x - cx) > 1) d += `M${x.toFixed(1)} -5V${fy + 5}`;
      for (let y = fy - g; y >= -5; y -= g) d += `M-5 ${y.toFixed(1)}H${st.w + 5}`;
      const big = g >= 100;
      s += `<clipPath id="stageClip"><path d="${p}"/></clipPath><g clip-path="url(#stageClip)" pointer-events="none">`;
      s += `<path d="${d}" fill="none" stroke="${big ? '#c9d2df' : '#d8dde6'}" stroke-width="${big ? 2 : 1}"/>`;
      s += `<path d="M${cx} -5V${fy + 5}" stroke="#b7c2d3" stroke-width="2.5" stroke-dasharray="18 10"/>`;
      s += '</g>';
      if (big) {
        // 中心線からの目盛り（1.82m のときは 1間・2間…）
        const lab = n => (g === 182 ? `${n}間` : `${((n * g) / 100).toFixed(g % 100 ? 1 : 0)}m`);
        for (let n = 1; cx + n * g <= st.w; n++) {
          s += `<text x="${cx + n * g}" y="${fy + 26}" text-anchor="middle" font-size="16" fill="#9aa6b8">${lab(n)}</text>`;
          s += `<text x="${cx - n * g}" y="${fy + 26}" text-anchor="middle" font-size="16" fill="#9aa6b8">${lab(n)}</text>`;
        }
        for (let n = 1; fy - n * g >= 0; n++) s += `<text x="${st.w + 14}" y="${fy - n * g}" dy="0.35em" font-size="16" fill="#9aa6b8">${lab(n)}</text>`;
      }
    }
    s += `<text x="${st.w / 2}" y="${R.frontY(st) + 70}" text-anchor="middle" font-size="40" fill="#8a94a3" font-weight="700" letter-spacing="20">客　席</text>`;
    s += `<text x="${st.w / 2}" y="-78" text-anchor="middle" font-size="26" fill="#a9b1bd">（舞台奥）</text>`;
    return s;
  };

  // ---------------------------------------------------------------- 下絵（舞台図の重ね合わせ）
  // u: { src, x, y, w, h, rot(度・左上の角が中心), crop:{l,t,r,b}(0〜1), opacity }
  R.underlayCrop = u => Object.assign({ l: 0, t: 0, r: 1, b: 1 }, u.crop || {});
  // 画像の中の位置（0〜1）→ 舞台の座標(cm)
  R.underlayToWorld = function (u, fx, fy) {
    const a = ((u.rot || 0) * Math.PI) / 180, lx = fx * u.w, ly = fy * u.h;
    return { x: u.x + lx * Math.cos(a) - ly * Math.sin(a), y: u.y + lx * Math.sin(a) + ly * Math.cos(a) };
  };
  R.worldToUnderlay = function (u, x, y) {
    const a = ((u.rot || 0) * Math.PI) / 180, dx = x - u.x, dy = y - u.y;
    return { fx: (dx * Math.cos(a) + dy * Math.sin(a)) / u.w, fy: (-dx * Math.sin(a) + dy * Math.cos(a)) / u.h };
  };
  // 切り取った範囲の四隅と、それを囲む四角
  R.underlayBounds = function (u) {
    const c = R.underlayCrop(u);
    const pts = [[c.l, c.t], [c.r, c.t], [c.r, c.b], [c.l, c.b]].map(p => R.underlayToWorld(u, p[0], p[1]));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { pts, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  let ulSeq = 0;
  R.underlaySVG = function (u, opt) {
    opt = opt || {};
    const c = R.underlayCrop(u);
    const id = 'ulClip' + (opt.id || ++ulSeq);
    const cx = c.l * u.w, cy = c.t * u.h, cw = (c.r - c.l) * u.w, ch = (c.b - c.t) * u.h;
    let s = `<g transform="translate(${u.x} ${u.y}) rotate(${u.rot || 0})" pointer-events="none">`;
    s += `<clipPath id="${id}"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"/></clipPath>`;
    s += `<image href="${u.src}" x="0" y="0" width="${u.w}" height="${u.h}" opacity="${u.opacity == null ? 0.5 : u.opacity}" preserveAspectRatio="none" clip-path="url(#${id})"/>`;
    if (opt.edit) s += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="none" stroke="#2f6fde" stroke-width="${3 / (opt.k || 1)}" stroke-dasharray="${10 / (opt.k || 1)}"/>`;
    return s + '</g>';
  };

  // ---------------------------------------------------------------- 舞台の大きさを変える丸いつまみの位置
  R.stageKnobs = function (st) {
    const bw = R.backWidth(st), cx = st.w / 2, out = [];
    const add = (kind, x, y, arrow, title) => out.push({ kind, x, y, arrow, title });
    if (st.shape === 'round') {
      // 丸い舞台：いちばん広い所の幅と、中央の奥行
      const yMid = R.stagePoly(st).reduce((a, p) => (p[0] > a[0] ? p : a), [0, 0])[1];
      add('stageW', 0, yMid, '↔', 'ドラッグで舞台の幅を変える');
      add('stageW', st.w, yMid, '↔', 'ドラッグで舞台の幅を変える');
      add('stageD', cx, st.d, '↕', 'ドラッグで舞台の奥行を変える');
    } else if (st.shape === 'arc') {
      // 弧の舞台：前の角（幅）、角の奥行、真ん中のふくらみ
      const yc = st.d - R.arcSag(st);
      add('stageW', 0, yc, '↔', 'ドラッグで舞台の幅を変える');
      add('stageW', st.w, yc, '↔', 'ドラッグで舞台の幅を変える');
      add('stageD', st.w * 0.2, R.frontAt(st, st.w * 0.2), '↕', 'ドラッグで舞台の奥行（角の所）を変える');
      add('stageSag', cx, st.d, '◠', 'ドラッグで弧のふくらみを変える');
    } else {
      add('stageW', 0, st.d, '↔', 'ドラッグで舞台の前の幅を変える');
      add('stageW', st.w, st.d, '↔', 'ドラッグで舞台の前の幅を変える');
      add('stageD', cx + Math.min(260, st.w * 0.2), st.d, '↕', 'ドラッグで舞台の奥行を変える');
    }
    if (bw < st.w - 1) {
      add('stageBW', cx - bw / 2, 0, '↔', 'ドラッグで舞台の奥の幅を変える');
      add('stageBW', cx + bw / 2, 0, '↔', 'ドラッグで舞台の奥の幅を変える');
    }
    return out;
  };

  // ---------------------------------------------------------------- 寸法線
  const fmtM = cm => (cm / 100).toFixed(2).replace(/0$/, '') + 'm';
  // 寸法の文字の大きさ（画面の拡大率 k に合わせる）
  const labelSize = (label, k) => { const fs = 13 / k; return { fs, tw: label.length * fs * 0.62 + 10 / k, th: fs + 6 / k }; };
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  let placed = null; // この回に描いた寸法の文字の四角（重なりを避けるため）
  // pos を渡すと、文字をその位置に置き、線の真ん中から細い引き出し線を引く
  function dimLine(x1, y1, x2, y2, label, color, k, side, at, pos) {
    const sw = 1.6 / k, tk = 9 / k, fs = 13 / k;
    const vert = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    let s = `<g class="dim" pointer-events="none"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}"/>`;
    if (vert) s += `<path d="M${x1 - tk} ${y1}H${x1 + tk}M${x2 - tk} ${y2}H${x2 + tk}" stroke="${color}" stroke-width="${sw}"/>`;
    else s += `<path d="M${x1} ${y1 - tk}V${y1 + tk}M${x2} ${y2 - tk}V${y2 + tk}" stroke="${color}" stroke-width="${sw}"/>`;
    const f = at == null ? 0.5 : at;
    const mx = x1 + (x2 - x1) * f, my = y1 + (y2 - y1) * f;
    const { tw, th } = labelSize(label, k);
    let lx = vert ? mx + (side || 1) * (tw / 2 + 6 / k) : mx, ly = vert ? my : my + (side || -1) * (th / 2 + 3 / k);
    if (pos) {
      lx = pos.x; ly = pos.y;
      const ex = Math.max(lx - tw / 2, Math.min(lx + tw / 2, mx)), ey = Math.max(ly - th / 2, Math.min(ly + th / 2, my));
      s += `<line x1="${mx}" y1="${my}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="${1 / k}" stroke-dasharray="${3 / k} ${2 / k}"/>`;
    }
    if (placed) placed.push({ x0: lx - tw / 2, x1: lx + tw / 2, y0: ly - th / 2, y1: ly + th / 2 });
    s += `<rect x="${lx - tw / 2}" y="${ly - th / 2}" width="${tw}" height="${th}" rx="${4 / k}" fill="#fff" fill-opacity=".92" stroke="${color}" stroke-width="${1 / k}"/>`;
    s += `<text x="${lx}" y="${ly}" dy="0.35em" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${color}">${label}</text></g>`;
    return s;
  }
  // 部品の外形（回転が90°くらいなら幅と奥行を入れかえる）
  function bboxOf(it) {
    const sz = SS.itemSize(it, {});
    const a = Math.abs(((it.rot || 0) % 180 + 180) % 180);
    const swap = a > 45 && a < 135;
    const w = swap ? sz.h : sz.w, h = swap ? sz.w : sz.h;
    return { x0: it.x - w / 2, x1: it.x + w / 2, y0: it.y - h / 2, y1: it.y + h / 2, w, h };
  }
  R.bboxOf = bboxOf;
  /**
   * ステージの主な寸法と、選んだ部品のまわりの距離
   * k: 画面の拡大率（線や文字の太さをそろえる）
   */
  // opt.knobs：画面に舞台のつまみが出ているとき（つまみと重ならないようにする）
  R.dimsSVG = function (doc, k, sel, opt) {
    opt = opt || {};
    placed = [];
    const st = doc.stage;
    const C1 = '#3b6bb5', C2 = '#d6336c';
    let s = '';
    const b = R.backWidth(st);
    const shaped = b < st.w - 1;
    s += dimLine(0, st.d + 34, st.w, st.d + 34, `${R.isCurved(st) ? '最大の幅' : shaped ? '前の幅' : '幅'} ${fmtM(st.w)}`, C1, k, 1);
    if (shaped) s += dimLine((st.w - b) / 2, -36, (st.w + b) / 2, -36, `奥の幅 ${fmtM(b)}`, C1, k, -1);
    // 奥行の数字は、ステージの外（左上のすき間）に出す
    s += dimLine(-42, 0, -42, st.d, `${R.isCurved(st) ? '奥行（中央）' : '奥行'} ${fmtM(st.d)}`, C1, k, 1, 0.1);
    const pod = doc.items.find(it => it.type === 'podium');
    if (sel && sel.type !== 'player' && sel.type !== 'text') {
      const bb = bboxOf(sel);
      const cy = sel.y;
      const [xl, xr] = R.xRange(st, cy);
      // 舞台際（客席側）まで
      const fe = R.frontAt(st, bb.x1 - 30);
      if (fe - bb.y1 > 3) s += dimLine(bb.x1 - 30, bb.y1, bb.x1 - 30, fe, `舞台際まで ${fmtM(fe - bb.y1)}`, C2, k, 1);
      // 奥（反射板）まで
      if (bb.y0 > 3) s += dimLine(sel.x, 0, sel.x, bb.y0, `奥まで ${fmtM(bb.y0)}`, C2, k, 1);
      // 下手・上手の端まで
      if (bb.x0 - xl > 3) s += dimLine(xl, cy, bb.x0, cy, `下手まで ${fmtM(bb.x0 - xl)}`, C2, k, -1);
      if (xr - bb.x1 > 3) s += dimLine(bb.x1, cy, xr, cy, `上手まで ${fmtM(xr - bb.x1)}`, C2, k, -1);
      // 指揮台まで（指揮台の奥のふち〜部品の手前のふち）
      if (pod && sel !== pod) {
        const pb = bboxOf(pod);
        if (pb.y0 - bb.y1 > 3) s += dimLine(pod.x, bb.y1, pod.x, pb.y0, `指揮台まで ${fmtM(pb.y0 - bb.y1)}`, C2, k, -1);
      }
      // 大きさ
      const tag = `${fmtM(bb.w)} × ${fmtM(bb.h)}${sel.hgt ? ` ・高さ${Math.round(sel.hgt)}cm` : ''}`;
      const fs = 13 / k, tw = tag.length * fs * 0.6 + 12 / k;
      const ty = bb.y1 + 10 / k;
      s += `<g pointer-events="none"><rect x="${bb.x0}" y="${ty}" width="${tw}" height="${fs + 8 / k}" rx="${4 / k}" fill="${C2}"/><text x="${bb.x0 + 6 / k}" y="${ty + (fs + 8 / k) / 2}" dy="0.35em" font-size="${fs}" font-weight="700" fill="#fff">${tag}</text></g>`;
      placed.push({ x0: bb.x0, x1: bb.x0 + tw, y0: ty, y1: ty + fs + 8 / k });
    }
    // 指揮台〜舞台際：丸いつまみ・ほかの寸法の文字と重ならない場所を選ぶ
    if (pod) {
      const pb = bboxOf(pod);
      const lxLine = pb.x1 + 30, fe = R.frontAt(st, lxLine);
      if (fe - pb.y1 > 5) {
        const label = `指揮台〜舞台際 ${fmtM(fe - pb.y1)}`;
        const { tw, th } = labelSize(label, k);
        const my = (pb.y1 + fe) / 2, g = 8 / k;
        const knobR = 26 / k;
        const blocks = placed.slice().concat(opt.knobs ? R.stageKnobs(st).map(q => ({ x0: q.x - knobR, x1: q.x + knobR, y0: q.y - knobR, y1: q.y + knobR })) : []);
        const cands = [
          { x: lxLine + tw / 2 + g, y: my },                       // 線の右
          { x: pb.x0 - 30 - tw / 2 - g, y: my },                   // 指揮台の左
          { x: lxLine + tw / 2 + g, y: pb.y0 - th / 2 - g },         // 指揮台の右上
          { x: pb.x0 - 30 - tw / 2 - g, y: pb.y0 - th / 2 - g },     // 指揮台の左上
          { x: pod.x, y: pb.y0 - th / 2 - g * 2 },                  // 指揮台の上
        ];
        const free = c => !blocks.some(b => overlap({ x0: c.x - tw / 2, x1: c.x + tw / 2, y0: c.y - th / 2, y1: c.y + th / 2 }, b));
        const best = cands.find(free) || cands[0];
        s += dimLine(lxLine, pb.y1, lxLine, fe, label, C1, k, 1, 0.5, best === cands[0] ? null : best);
      }
    }
    placed = null;
    return s;
  };

  const LAYER = { riser: 0, riser46: 0, hina: 0, text: 3, player: 2 };
  R.sortedItems = items => items.map((it, i) => ({ it, i })).sort((a, b) => ((LAYER[a.it.type] ?? 1) - (LAYER[b.it.type] ?? 1)) || a.i - b.i).map(o => o.it);

  R.seatNumbers = function (doc, conductor) {
    const players = doc.items.filter(it => it.type === 'player');
    const order = SS.geo.seatOrder(players, conductor);
    const map = new Map();
    order.forEach((it, i) => map.set(it, i + 1));
    return map;
  };

  R.itemsSVG = function (doc, opts, conductor, withIds) {
    const nums = opts.showNumbers ? R.seatNumbers(doc, conductor) : null;
    let bodies = '', texts = '';
    const labels = [];
    R.sortedItems(doc.items).forEach(it => {
      const d = SS.drawItem(it, Object.assign({}, opts, { number: nums ? nums.get(it) : 0, deferLabels: true }));
      if (withIds) bodies += `<g class="item" data-id="${it.id}">${d.body}</g>`;
      else bodies += d.body;
      texts += d.text;
      if (d.label) labels.push(Object.assign({ it }, d.label));
    });
    return bodies + `<g pointer-events="none">${texts}${R.placeLabels(labels, doc)}</g>`;
  };

  // パート名を、となりのパート名・人の頭・譜面台と重ならない候補の場所に置く
  R.placeLabels = function (labels, doc) {
    const boxes = [];
    const box = (lb, p) => ({ x0: p.x - lb.w / 2, x1: p.x + lb.w / 2, y0: p.y - lb.h / 2, y1: p.y + lb.h / 2 });
    const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    // 人の頭（体の中心）と譜面台（体の前 約64cm・幅50cm）はふさがないようにする
    const ps = doc.items.filter(it => it.type === 'player');
    const heads = ps.map(it => ({ it, x0: it.x - 11, x1: it.x + 11, y0: it.y - 11, y1: it.y + 11 }));
    ps.forEach(it => {
      if (['perc', 'drs', 'pf', 'hp'].includes(SS.instrumentKind(it.label))) return;
      const a = ((it.rot || 0) * Math.PI) / 180, sx = it.x - Math.sin(a) * 64, sy = it.y + Math.cos(a) * 64;
      heads.push({ it, x0: sx - 25, x1: sx + 25, y0: sy - 6, y1: sy + 6 });
    });
    // 数の多い列から先に置くより、前（客席側）の人から順に置くほうが自然
    const order = labels.slice().sort((a, b) => b.it.y - a.it.y);
    let out = '';
    order.forEach(lb => {
      let best = null, bestScore = Infinity;
      lb.cands.forEach((p, i) => {
        const bx = box(lb, p);
        const score = boxes.filter(b => hit(bx, b)).length * 10 + heads.filter(h => h.it !== lb.it && hit(bx, h)).length * 3 + i * 0.5;
        if (score < bestScore) { bestScore = score; best = p; }
      });
      boxes.push(box(lb, best));
      out += SS.labelText(lb, best);
    });
    return out;
  };

  // パートごとの人数
  R.counts = function (doc) {
    const map = new Map();
    doc.items.forEach(it => {
      if (it.type !== 'player') return;
      const l = (it.label || '').trim() || '（未設定）';
      map.set(l, (map.get(l) || 0) + 1);
    });
    const groups = SS.PART_GROUPS.map(g => ({ g, parts: [] }));
    map.forEach((n, label) => {
      const g = SS.partGroup(label === '（未設定）' ? '' : label);
      groups.find(x => x.g === g).parts.push({ label, n });
    });
    groups.forEach(x => x.parts.sort((a, b) => a.label.localeCompare(b.label, 'ja', { numeric: true })));
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    return { groups: groups.filter(x => x.parts.length), total };
  };

  // 書き出し用の完全なSVG
  R.fullSVG = function (doc, opts, conductor, ex) {
    ex = Object.assign({ underlay: false, legend: true, pxPerCm: 1 }, ex);
    const st = doc.stage;
    const pad = 60;
    const titleH = doc.title || doc.subtitle ? 175 : 20;
    const bottom = R.frontY(st) + 110;
    let legend = '', legendH = 0;
    if (ex.legend) {
      const c = R.counts(doc);
      const cells = [];
      c.groups.forEach(x => x.parts.forEach(p => cells.push({ color: x.g.color, text: `${p.label} ×${p.n}` })));
      const colW = 190, perRow = Math.max(1, Math.floor(st.w / colW));
      legend += `<text x="0" y="${bottom + 20}" font-size="28" font-weight="700" fill="#1f2733">編成（計 ${c.total} 人）</text>`;
      cells.forEach((cell, i) => {
        const cx = (i % perRow) * colW, cy = bottom + 60 + Math.floor(i / perRow) * 40;
        legend += `<circle cx="${cx + 12}" cy="${cy - 8}" r="11" fill="${opts.colorBy ? cell.color : '#fff'}" stroke="#39414d" stroke-width="1.5"/>`;
        legend += `<text x="${cx + 30}" y="${cy}" font-size="24" fill="#1f2733">${SS.esc(cell.text)}</text>`;
      });
      legendH = 70 + Math.ceil(cells.length / perRow) * 40;
    }
    let x0 = -pad, y0 = -titleH - pad / 2, W = st.w + pad * 2, H = bottom + legendH + pad - y0;
    // 下絵（舞台図）を入れるときは、はみ出す部分まで紙を広げる
    if (ex.underlay && doc.underlay && ex.underlayAll) {
      const b = R.underlayBounds(doc.underlay);
      const nx0 = Math.min(x0, b.x0 - 20), ny0 = Math.min(y0, b.y0 - 20);
      const nx1 = Math.max(x0 + W, b.x1 + 20), ny1 = Math.max(y0 + H, b.y1 + 20);
      x0 = nx0; y0 = ny0; W = nx1 - nx0; H = ny1 - ny0;
    }
    const k = ex.pxPerCm;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(W * k)}" height="${Math.round(H * k)}" viewBox="${x0} ${y0} ${W} ${H}" font-family="'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,sans-serif">`;
    s += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#ffffff"/>`;
    if (doc.title) s += `<text x="${st.w / 2}" y="${-titleH + 30}" text-anchor="middle" font-size="52" font-weight="700" fill="#1f2733">${SS.esc(doc.title)}</text>`;
    if (doc.subtitle) s += `<text x="${st.w / 2}" y="${-titleH + 88}" text-anchor="middle" font-size="30" fill="#4a5462">${SS.esc(doc.subtitle)}</text>`;
    s += R.stageSVG(doc, opts.grid && ex.grid ? (opts.gridSize || 50) : 0);
    const u = doc.underlay;
    if (ex.underlay && u) s += R.underlaySVG(u, { id: 'ex' });
    s += R.itemsSVG(doc, opts, conductor, false);
    if (opts.dims) s += R.dimsSVG(doc, 0.55, null);
    s += legend;
    s += '</svg>';
    return s;
  };

  R.svgToPng = function (svg) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob(b => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を作れませんでした')); };
      img.src = url;
    });
  };

  R.download = function (blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  R.safeName = s => (String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'stage');

  // ---- 共有リンク ----
  function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const s = atob(str);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  async function pipe(bytes, stream) {
    const rs = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(rs).arrayBuffer());
  }
  R.encodeShare = async function (doc) {
    const slim = JSON.parse(JSON.stringify(doc));
    delete slim.underlay;
    slim.items.forEach(it => { it.x = Math.round(it.x); it.y = Math.round(it.y); it.rot = Math.round(it.rot || 0); delete it.id; });
    const bytes = new TextEncoder().encode(JSON.stringify(slim));
    if (window.CompressionStream) return 'z' + b64url(await pipe(bytes, new CompressionStream('deflate-raw')));
    return 'j' + b64url(bytes);
  };
  R.decodeShare = async function (str) {
    const kind = str[0];
    let bytes = unb64url(str.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  // ---- ブラウザ内の保存 ----
  const LIST_KEY = 'stagesetting.saved.v1';
  R.savedList = function () {
    try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); } catch (e) { return []; }
  };
  R.saveToList = function (name, doc) {
    const list = R.savedList();
    const slim = JSON.parse(JSON.stringify(doc));
    delete slim.underlay;
    const existing = list.find(x => x.name === name);
    if (existing) { existing.doc = slim; existing.date = Date.now(); }
    else list.unshift({ id: Date.now().toString(36), name, date: Date.now(), doc: slim });
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  };
  R.deleteFromList = function (id) {
    localStorage.setItem(LIST_KEY, JSON.stringify(R.savedList().filter(x => x.id !== id)));
  };

  SS.render = R;
})(window.SS);
