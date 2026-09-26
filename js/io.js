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
  // 客席側でいちばん前（オーケストラピットのふた・花道まで含める）。寸法・「客席」の文字はこの前に置く
  // 花道の部品（runway）も、客席の方へ出ていればそこまで
  R.frontOuter = function (stage, items) {
    const g = SS.fixtureGeom ? SS.fixtureGeom(stage) : {};
    const d = SS.app && SS.app.doc ? SS.app.doc() : null;
    const list = items || (d && d.stage === stage ? d.items : []);
    const rw = list.filter(it => it.type === 'runway').map(it => SS.itemAABB(it, {}).y1);
    return Math.max(R.frontY(stage), g.pit ? g.pit.y1 : 0, g.hanamichi ? g.hanamichi.y1 : 0, ...rw);
  };

  // ホールの設備（反射板・プロセニアム・緞帳線・迫り・オーケストラピットのふた・花道・出入り口）。入力したものだけ描く
  // k：文字の大きさの基準（marksSVG と同じ。画面でも図面でも、見た目の大きさを一定にする）
  R.fixturesSVG = function (stage, k) {
    if (!SS.fixtureGeom) return '';
    const g = SS.fixtureGeom(stage);
    const col = '#6d4c8f', fs = 12 / k, halo = `stroke="#fff" stroke-width="${3 / k}" paint-order="stroke" stroke-linejoin="round"`;
    const lab = (x, y, t, anchor) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy="0.35em"${anchor ? ` text-anchor="${anchor}"` : ''} font-size="${fs}" font-weight="700" fill="${col}" ${halo}>${t}</text>`;
    let s = '<g class="fixtures" pointer-events="none">';
    if (g.pit) {
      s += `<rect x="${g.pit.x0}" y="${g.pit.y0}" width="${g.pit.x1 - g.pit.x0}" height="${g.pit.y1 - g.pit.y0}" fill="#f1ecf6" stroke="${col}" stroke-width="3" stroke-dasharray="14 8"/>`;
      s += lab((g.pit.x0 + g.pit.x1) / 2, (g.pit.y0 + g.pit.y1) / 2, 'オーケストラピット（ふた）', 'middle');
    }
    if (g.hanamichi) {
      const h = g.hanamichi;
      s += `<rect x="${h.x0}" y="${h.y0}" width="${h.x1 - h.x0}" height="${h.y1 - h.y0}" fill="#f1ecf6" stroke="${col}" stroke-width="3"/>`;
      s += lab((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2, '花道', 'middle');
    }
    g.lifts.forEach((l, i) => {
      s += `<rect x="${l.x0}" y="${l.y0}" width="${l.x1 - l.x0}" height="${l.y1 - l.y0}" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="10 6"/>`;
      s += `<path d="M${l.x0} ${l.y0}L${l.x1} ${l.y1}M${l.x1} ${l.y0}L${l.x0} ${l.y1}" stroke="${col}" stroke-width="1.2" stroke-opacity=".6"/>`;
      s += lab(l.x0 + 4 / k, l.y0 + fs * 0.8, `迫り${l.name ? ' ' + SS.esc(l.name) : g.lifts.length > 1 ? i + 1 : ''}`);
    });
    if (g.curtain) {
      const y = g.curtain.y, [xl, xr] = R.xRange(stage, y);
      s += `<line x1="${xl - 30}" y1="${y}" x2="${xr + 30}" y2="${y}" stroke="#b03a2e" stroke-width="3" stroke-dasharray="24 8 4 8"/>`;
      s += `<text x="${(xr - 6 / k).toFixed(1)}" y="${(y - fs * 0.75).toFixed(1)}" dy="0.35em" text-anchor="end" font-size="${fs}" font-weight="700" fill="#b03a2e" ${halo}>緞帳線</text>`;
    }
    if (g.proscenium) {
      const p = g.proscenium;
      s += `<path d="M${-80} ${p.y}H${p.x0}M${p.x1} ${p.y}H${stage.w + 80}" stroke="#39414d" stroke-width="16" stroke-linecap="butt"/>`;
      s += lab(p.x0 + 4 / k, p.y + 8 + fs * 0.7, 'プロセニアム');
    }
    // 出入り口：壁のすき間（緑の太線）と、空けておく所（点線）
    (g.doors || []).forEach(d => {
      const z = d.zone, out = d.side === 'L' ? -1 : 1;
      s += `<rect x="${z.x0}" y="${z.y0}" width="${z.x1 - z.x0}" height="${z.y1 - z.y0}" fill="#e8f6ec" fill-opacity=".6" stroke="#2f9e57" stroke-width="2" stroke-dasharray="8 6"/>`;
      s += `<line x1="${d.x + out * 4}" y1="${d.y0}" x2="${d.x + out * 4}" y2="${d.y1}" stroke="#2f9e57" stroke-width="10"/>`;
      s += `<text x="${(d.x + out * (14 + 4 / k)).toFixed(1)}" y="${((d.y0 + d.y1) / 2).toFixed(1)}" dy="0.35em" text-anchor="${d.side === 'L' ? 'end' : 'start'}" font-size="${fs}" font-weight="700" fill="#2f9e57" ${halo}>出入口</text>`;
    });
    if (g.shell) {
      const y = g.shell.y, [xl, xr] = R.xRange(stage, Math.max(0, y));
      s += `<line x1="${xl}" y1="${y}" x2="${xr}" y2="${y}" stroke="#39414d" stroke-width="10"/>`;
      s += lab(xl + 6 / k, y - 5 - fs * 0.6, '反射板');
    }
    return s + '</g>';
  };

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
      s += `<clipPath id="stageClip"><path d="${p}"/></clipPath><g class="grid" clip-path="url(#stageClip)" pointer-events="none">`;
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
    return s;
  };

  /**
   * 上手・下手・客席・センター（中心線）・舞台奥 の表示。
   * k：1cm が何単位の大きさで見えるか（画面なら 1cm あたりの px、図面なら文字の大きさの基準）。
   * 文字は k に合わせて一定の見た目の大きさにし、寸法の文字と重ならない位置に置く。
   */
  // mobile：スマホの画面。舞台を画面の幅いっぱいに出すので、下手・上手は舞台の前の角の下に置く（「奥の幅」の寸法は出さない）
  R.marksSVG = function (doc, k, dimsOn, compact, mobile) {
    const st = doc.stage, fy = R.frontY(st), cx = st.w / 2;
    const col = '#5b6678', halo = `stroke="#fff" stroke-width="${3 / k}" paint-order="stroke" stroke-linejoin="round"`;
    let s = R.fixturesSVG(st, k) + '<g class="marks" pointer-events="none">';
    // 舞台奥：「奥の幅」の寸法の文字の上。その右に「センター」、中心線はそこから客席側のふちまで
    const shaped = R.backWidth(st) < st.w - 1 && !mobile;
    // 「奥の幅」の寸法の字（高さ約19px）から十分に離す。中心線は寸法の字の下から引き、字の上を通らないようにする
    const by = dimsOn && shaped ? -36 - (3 + 19 + 16) / k : -8 / k;
    const lineTop = dimsOn && shaped ? -36 + (19 / 2 + 3) / k : by + 3 / k;
    s += `<line x1="${cx}" y1="${lineTop}" x2="${cx}" y2="${fy}" stroke="#7a8699" stroke-width="${1.3 / k}" stroke-dasharray="${10 / k} ${4 / k} ${2 / k} ${4 / k}"/>`;
    s += `<text x="${cx - 6 / k}" y="${by}" text-anchor="end" font-size="${11 / k}" fill="${col}" ${halo}>（舞台奥）</text>`;
    s += `<text x="${cx + 6 / k}" y="${by}" font-size="${11 / k}" font-weight="700" fill="${col}" ${halo}>センター</text>`;
    // 下手（客席から見て左）・上手（客席から見て右）
    const fs = 16 / k, y = st.d * 0.74;
    const [xl, xr] = R.xRange(st, y);
    const lx = Math.min(xl - 12 / k, dimsOn ? -42 - 12 / k : xl - 12 / k);
    if (mobile) {
      const my = R.frontOuter(st) + (dimsOn ? 34 + (3 + 19 + 8) / k : 14 / k) + fs * 0.6;
      s += `<text x="${4 / k}" y="${my}" dy="0.35em" font-size="${fs}" font-weight="700" fill="${col}" ${halo}>下手</text>`;
      s += `<text x="${st.w - 4 / k}" y="${my}" dy="0.35em" text-anchor="end" font-size="${fs}" font-weight="700" fill="${col}" ${halo}>上手</text>`;
    } else {
    s += `<text x="${lx}" y="${y}" dy="0.35em" text-anchor="end" font-size="${fs}" font-weight="700" fill="${col}" ${halo}>下手</text>`;
    if (!compact) s += `<text x="${lx}" y="${y + fs * 1.2}" dy="0.35em" text-anchor="end" font-size="${9 / k}" fill="${col}" ${halo}>（客席から見て左）</text>`;
    s += `<text x="${xr + 12 / k}" y="${y}" dy="0.35em" font-size="${fs}" font-weight="700" fill="${col}" ${halo}>上手</text>`;
    if (!compact) s += `<text x="${xr + 12 / k}" y="${y + fs * 1.2}" dy="0.35em" font-size="${9 / k}" fill="${col}" ${halo}>（客席から見て右）</text>`;
    }
    // 客席：「前の幅」の寸法の文字の下
    const cy = R.frontOuter(st) + (dimsOn ? 34 + (3 + 19 + 10) / k : 12 / k) + 16 / k;
    s += `<text x="${cx}" y="${cy}" dy="0.35em" text-anchor="middle" font-size="${17 / k}" font-weight="700" fill="${col}" letter-spacing="${8 / k}" ${halo}>客　席</text>`;
    s += `<path d="M${cx - 60 / k} ${cy - 14 / k}l${6 / k} ${-8 / k}l${6 / k} ${8 / k}M${cx + 48 / k} ${cy - 14 / k}l${6 / k} ${-8 / k}l${6 / k} ${8 / k}" fill="none" stroke="${col}" stroke-width="${1.5 / k}"/>`;
    return s + '</g>';
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
  let DS = 1; // 寸法の字の大きさの倍率（スマホの画面では小さく）
  const labelSize = (label, k) => { const fs = (13 * DS) / k; return { fs, tw: label.length * fs * 0.62 + 10 / k, th: fs + 6 / k }; };
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  let placed = null; // この回に描いた寸法の文字の四角（重なりを避けるため）
  // pos を渡すと、文字をその位置に置き、線の真ん中から細い引き出し線を引く
  // edit：押すと長さを入力できる寸法（'w' 前の幅・'bw' 奥の幅・'d' 奥行）。画面だけ（書き出しでは使わない）
  function dimLine(x1, y1, x2, y2, label, color, k, side, at, pos, edit) {
    const sw = 1.6 / k, tk = 9 / k, fs = (13 * DS) / k;
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
    const ed = edit ? ` data-dimedit="${edit}" pointer-events="all" style="cursor:pointer"` : '';
    s += `<rect x="${lx - tw / 2}" y="${ly - th / 2}" width="${tw}" height="${th}" rx="${4 / k}" fill="#fff" fill-opacity=".92" stroke="${color}" stroke-width="${(edit ? 1.6 : 1) / k}"${ed}/>`;
    s += `<text x="${lx}" y="${ly}" dy="0.35em" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${color}"${ed}>${label}${edit ? ' ✎' : ''}</text></g>`;
    return s;
  }
  // 部品の外形（回転が90°くらいなら幅と奥行を入れかえる）
  function bboxOf(it) {
    if (it.type === 'hina' && SS.hinaArc && SS.hinaArc(it)) { const b = SS.itemAABB(it, {}); return Object.assign(b, { w: b.x1 - b.x0, h: b.y1 - b.y0 }); }
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
    DS = opt.small ? 0.78 : 1;
    const st = doc.stage;
    const C1 = '#3b6bb5', C2 = '#d6336c';
    let s = '';
    const b = R.backWidth(st);
    const shaped = b < st.w - 1;
    s += dimLine(0, R.frontOuter(st) + 34, st.w, R.frontOuter(st) + 34, `${R.isCurved(st) ? '最大の幅' : shaped ? '前の幅' : '幅'} ${fmtM(st.w)}`, C1, k, 1, null, null, opt.editable ? 'w' : null);
    // スマホ（opt.basic）では「前の幅」と「奥行」だけにする
    if (shaped && !opt.basic) s += dimLine((st.w - b) / 2, -36, (st.w + b) / 2, -36, `奥の幅 ${fmtM(b)}`, C1, k, -1, null, null, opt.editable ? 'bw' : null);
    // 奥行の数字は、ステージの外（左上のすき間）に出す
    s += dimLine(-42, 0, -42, st.d, `${R.isCurved(st) ? '奥行（中央）' : '奥行'} ${fmtM(st.d)}`, C1, k, 1, 0.1, null, opt.editable ? 'd' : null);
    const pod = doc.items.find(it => it.type === 'podium');
    if (sel && sel.type !== 'player' && sel.type !== 'text' && sel.type !== 'cable') {
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
    if (pod && !opt.basic) {
      const pb = bboxOf(pod);
      const lxLine = pb.x1 + 30, fe = R.frontAt(st, lxLine);
      if (fe - pb.y1 > 5) {
        const label = `指揮台〜舞台際 ${fmtM(fe - pb.y1)}`;
        const { tw, th } = labelSize(label, k);
        const my = (pb.y1 + fe) / 2, g = 8 / k;
        const knobR = 26 / k;
        const blocks = placed.slice().concat(opt.knobs ? R.stageKnobs(st).map(q => ({ x0: q.x - knobR, x1: q.x + knobR, y0: q.y - knobR, y1: q.y + knobR })) : []);
        // 奏者・楽器の上にも重ねない（スマホのように字が大きく見えるとき、舞台の外の「前の幅」の線の上へ逃がす）
        doc.items.forEach(it => { if (['hina', 'riser', 'riser46', 'stairs', 'podium', 'text', 'cable'].includes(it.type)) return; blocks.push(it.type === 'player' ? { x0: it.x - 26, x1: it.x + 26, y0: it.y - 26, y1: it.y + 26 } : bboxOf(it)); });
        const fl = placed[0], fy2 = R.frontOuter(st) + 34;
        const cands = [
          { x: lxLine + tw / 2 + g, y: my },                       // 線の右
          { x: pb.x0 - 30 - tw / 2 - g, y: my },                   // 指揮台の左
          { x: lxLine + tw / 2 + g, y: pb.y0 - th / 2 - g },         // 指揮台の右上
          { x: pb.x0 - 30 - tw / 2 - g, y: pb.y0 - th / 2 - g },     // 指揮台の左上
          { x: pod.x, y: pb.y0 - th / 2 - g * 2 },                  // 指揮台の上
          { x: pod.x, y: pb.y0 - th * 1.5 - g * 3 },                // もう少し上
          { x: lxLine + tw / 2 + g, y: pb.y0 - th * 1.5 - g * 3 },   // 右上のさらに上
          { x: pb.x0 - 30 - tw / 2 - g, y: pb.y0 - th * 1.5 - g * 3 },
        ];
        // 舞台の外：「前の幅」の寸法の字の右・左（同じ線の上）
        if (fl) cands.splice(1, 0, { x: fl.x1 + tw / 2 + g, y: fy2 }, { x: fl.x0 - tw / 2 - g, y: fy2 });
        const hits = c => blocks.filter(b => overlap({ x0: c.x - tw / 2, x1: c.x + tw / 2, y0: c.y - th / 2, y1: c.y + th / 2 }, b)).length;
        const best = cands.reduce((a, c) => (hits(c) < hits(a) ? c : a), cands[0]);
        // 部品を選んでいて（ピンクの寸法が出ていて）空いた場所がないときは、今は出さない
        if (!(sel && hits(best) > 0)) s += dimLine(lxLine, pb.y1, lxLine, fe, label, C1, k, 1, 0.5, best === cands[0] ? null : best);
      }
    }
    placed = null;
    DS = 1;
    return s;
  };

  const LAYER = { runway: -1, riser: 0, riser46: 0, hina: 0, stairs: 0, text: 3, player: 2 };
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
    const hno = SS.hinaNumbers && opts.hinaDetail !== false ? SS.hinaNumbers(doc.items) : null;
    // 弦楽器は2人で1本の譜面台：組になった2人の譜面台は、奏者より先に1本だけ描く
    const pairs = SS.standPairs && opts.showStands !== false ? SS.standPairs(doc.items) : new Map();
    let standsDone = false;
    R.sortedItems(doc.items).forEach(it => {
      if (it.type === 'player' && !standsDone) {
        standsDone = true;
        pairs.forEach((b, a) => { if (doc.items.indexOf(a) < doc.items.indexOf(b)) bodies += SS.sharedStandSVG(a, b, opts); });
      }
      const d = SS.drawItem(it, Object.assign({}, opts, { number: nums ? nums.get(it) : 0, deferLabels: true, hinaNo: hno ? hno.get(it) : '', sharedStand: pairs.has(it) }));
      if (withIds) bodies += `<g class="item" data-id="${it.id}">${d.body}</g>`;
      else bodies += d.body;
      texts += d.text;
      if (d.label) labels.push(Object.assign({ it }, d.label));
    });
    if (opts.nameView) return R.partAreasSVG(doc, conductor) + bodies + `<g pointer-events="none">${texts}${R.partAreaLabels(doc, conductor)}</g>`;
    return bodies + `<g pointer-events="none">${texts}${R.placeLabels(labels, doc)}</g>`;
  };
  // 「名前を大きく」の表示：同じパートで、となりどうし（1.5m以内）の人を1つのパートの場所にまとめる
  R.partAreas = function (doc, conductor) {
    const by = new Map();
    doc.items.filter(it => it.type === 'player' && it.label).forEach(p => { if (!by.has(p.label)) by.set(p.label, []); by.get(p.label).push(p); });
    const out = [];
    by.forEach((ps, label) => {
      const left = new Set(ps);
      while (left.size) {
        const first = left.values().next().value, g = [first];
        left.delete(first);
        for (let i = 0; i < g.length; i++) left.forEach(q => { if (Math.hypot(q.x - g[i].x, q.y - g[i].y) <= 150) { g.push(q); left.delete(q); } });
        out.push({ label, members: g });
      }
    });
    const c = conductor || { x: doc.stage.w / 2, y: doc.stage.d };
    out.forEach(a => {
      a.cx = a.members.reduce((s, p) => s + p.x, 0) / a.members.length;
      a.cy = a.members.reduce((s, p) => s + p.y, 0) / a.members.length;
      // パート名の場所：指揮者から見て、かたまりのいちばん外側（後ろ）のさらに外
      const dx = a.cx - c.x, dy = a.cy - c.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const far = Math.max(...a.members.map(p => (p.x - c.x) * ux + (p.y - c.y) * uy));
      const along = (a.cx - c.x) * ux + (a.cy - c.y) * uy;
      a.lx = a.cx + ux * (far - along + 62);
      a.ly = a.cy + uy * (far - along + 62);
    });
    return out;
  };
  const hullPts = pts => {
    const P = pts.map(p => [p.x, p.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    P.forEach(p => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    P.slice().reverse().forEach(p => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  // パートの場所（うすい色の囲み）
  R.partAreasSVG = function (doc, conductor) {
    return R.partAreas(doc, conductor).map(a => {
      const h = hullPts(a.members), col = SS.partGroup ? SS.partGroup(a.label).color : '#6b7686';
      const d = h.length === 1 ? `M${h[0][0]} ${h[0][1]}h0.1` : 'M' + h.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
      return `<path d="${d}" fill="${col}" fill-opacity=".16" stroke="${col}" stroke-opacity=".32" stroke-width="84" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
    }).join('');
  };
  // パート名（パートの場所ごとに1つ。重なるときは外へずらす）
  R.partAreaLabels = function (doc, conductor) {
    // 人の席（と大きく出した名前）の上にはかぶせない
    const seats = doc.items.filter(it => it.type === 'player').map(p => ({ x0: p.x - 40, x1: p.x + 40, y0: p.y - 28, y1: p.y + 28 }));
    const boxes = [];
    const c = conductor || { x: doc.stage.w / 2, y: doc.stage.d };
    const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    return R.partAreas(doc, conductor).map(a => {
      const lab = a.label, fs = 34, w = SS.labelWidth(lab + ' 00') * fs * 0.9 + 24, h = fs * 1.25;
      const dx = a.lx - c.x, dy = a.ly - c.y, L = Math.hypot(dx, dy) || 1;
      // 候補：かたまりの外側（後ろ）→ 横の端（左右）→ 内側（前）の順に、かたまりの近くから。どこも空いていなければ、外側の少し遠く
      const ux = dx / L, uy = dy / L, tx = -uy, ty = ux;
      const al = p => (p.x - c.x) * ux + (p.y - c.y) * uy, tg = p => (p.x - a.cx) * tx + (p.y - a.cy) * ty;
      const near = Math.min(...a.members.map(al)), mid = al({ x: a.cx, y: a.cy });
      const tMin = Math.min(...a.members.map(tg)), tMax = Math.max(...a.members.map(tg));
      const cands = [];
      [0, 20, 40, 60].forEach(d => cands.push({ x: a.lx + ux * d, y: a.ly + uy * d }));
      [0, 25, 50].forEach(d => { cands.push({ x: a.cx + tx * (tMax + w / 2 + 30 + d), y: a.cy + ty * (tMax + w / 2 + 30 + d) }); cands.push({ x: a.cx + tx * (tMin - w / 2 - 30 - d), y: a.cy + ty * (tMin - w / 2 - 30 - d) }); });
      [0, 20, 40].forEach(d => { const k = near - mid - 62 - d; cands.push({ x: a.cx + ux * k, y: a.cy + uy * k }); });
      [80, 110, 140, 180].forEach(d => cands.push({ x: a.lx + ux * d, y: a.ly + uy * d }));
      // 空いている最初の候補。なければ、ほかのパート名との重なり（重い）と席との重なりがいちばん少ない候補
      let pick = null, best = Infinity;
      for (const q of cands) {
        const bx = { x0: q.x - w / 2, x1: q.x + w / 2, y0: q.y - h / 2, y1: q.y + h / 2 };
        const bad = boxes.filter(b => hit(bx, b)).length * 10 + seats.filter(b => hit(bx, b)).length;
        if (bad < best) { best = bad; pick = { x: q.x, y: q.y, bx }; }
        if (!bad) break;
      }
      boxes.push(pick.bx);
      const x = pick.x, y = pick.y;
      const col = SS.partGroup ? SS.partGroup(lab).color : '#6b7686';
      return `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="#fff" stroke="${col}" stroke-width="4"/><text x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy="0.35em" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#1f2733">${SS.esc(lab)}<tspan font-size="${fs * 0.62}" font-weight="600" fill="#6b7686"> ${a.members.length}</tspan></text>`;
    }).join('');
  };

  // パート名を、となりのパート名・人の頭・譜面台と重ならない候補の場所に置く
  R.placeLabels = function (labels, doc) {
    const boxes = [];
    const box = (lb, p) => ({ x0: p.x - lb.w / 2, x1: p.x + lb.w / 2, y0: p.y - lb.h / 2, y1: p.y + lb.h / 2 });
    const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    // となりのパート名とは、くっつかないよう少し（6cm）すき間を空ける
    const hitL = (a, b) => a.x0 - 6 < b.x1 && b.x0 - 6 < a.x1 && a.y0 - 3 < b.y1 && b.y0 - 3 < a.y1;
    // 人の頭（体の中心）と譜面台（体の前 約64cm・幅50cm）はふさがないようにする
    const ps = doc.items.filter(it => it.type === 'player');
    const heads = ps.map(it => ({ it, x0: it.x - 11, x1: it.x + 11, y0: it.y - 11, y1: it.y + 11 }));
    ps.forEach(it => {
      if (['perc', 'drs', 'pf', 'hp', 'voice'].includes(SS.instrumentKind(it.label))) return;
      const a = ((it.rot || 0) * Math.PI) / 180, sx = it.x - Math.sin(a) * 64, sy = it.y + Math.cos(a) * 64;
      heads.push({ it, x0: sx - 25, x1: sx + 25, y0: sy - 6, y1: sy + 6 });
    });
    // 数の多い列から先に置くより、前（客席側）の人から順に置くほうが自然
    const order = labels.slice().sort((a, b) => b.it.y - a.it.y);
    let out = '';
    order.forEach(lb0 => {
      // どの人の名前か分かるよう、なるべく自分の人のそば（はじめの候補）に置く。ほかのパート名とくっつくときは、
      // まず字を少し小さくし（84%・70%）、それでもだめなら次の候補（左右に少しずらした所・横・後ろ）へ
      const cands = lb0.cands.slice(0, 1).concat(lb0.cands.slice(0, 1).flatMap(p => [{ x: +(p.x - lb0.w * 0.3).toFixed(1), y: p.y }, { x: +(p.x + lb0.w * 0.3).toFixed(1), y: p.y }]), lb0.cands.slice(1));
      const scaled = k => Object.assign({}, lb0, { fs: lb0.fs * k, w: lb0.w * k, h: lb0.h * k });
      const labelHits = (lb, p) => boxes.filter(b => hitL(box(lb, p), b)).length;
      const headHits = (lb, p) => heads.filter(h => h.it !== lb.it && hit(box(lb, p), h)).length;
      let pick = null;
      for (const strictHeads of [true, false]) {
        for (const p of cands) {
          for (const k of [1, 0.84, 0.7]) {
            const lb = scaled(k);
            if (!labelHits(lb, p) && (!strictHeads || !headHits(lb, p))) { pick = { lb, p }; break; }
          }
          if (pick) break;
        }
        if (pick) break;
      }
      if (!pick) {
        // どこでもくっつくときは、いちばんましな所に小さく
        let bestScore = Infinity;
        cands.forEach((p, i) => { const lb = scaled(0.7); const sc = labelHits(lb, p) * 10 + headHits(lb, p) * 3 + i * 0.5; if (sc < bestScore) { bestScore = sc; pick = { lb, p }; } });
      }
      boxes.push(box(pick.lb, pick.p));
      out += SS.labelText(pick.lb, pick.p);
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

  // ---------------------------------------------------------------- 前の版とくらべる
  /**
   * base（前の版の部品）と cur（いまの部品）をくらべる。
   * 同じ id どうし → 残りは「種類＋パート名」が同じもののうち近いものどうしを組にする。
   * 戻り値 { added:[it], removed:[it], moved:[{ it, from }] }
   */
  R.diffItems = function (base, cur) {
    const skip = it => it.type === 'text';
    const B = base.filter(it => !skip(it)), C = cur.filter(it => !skip(it));
    const pairs = [], usedB = new Set(), usedC = new Set();
    const bById = new Map(B.filter(it => it.id).map(it => [it.id, it]));
    C.forEach(c => { const b = c.id && bById.get(c.id); if (b && b.type === c.type && !usedB.has(b)) { pairs.push([b, c]); usedB.add(b); usedC.add(c); } });
    const key = it => it.type + '|' + (it.type === 'player' ? (it.label || '').trim() : it.type === 'hina' ? '' : it.label || '');
    const groups = new Map();
    const add = (it, side) => { const k2 = key(it); if (!groups.has(k2)) groups.set(k2, { b: [], c: [] }); groups.get(k2)[side].push(it); };
    B.filter(it => !usedB.has(it)).forEach(it => add(it, 'b'));
    C.filter(it => !usedC.has(it)).forEach(it => add(it, 'c'));
    groups.forEach(g => {
      const cand = [];
      g.b.forEach(b => g.c.forEach(c => cand.push([Math.hypot(b.x - c.x, b.y - c.y), b, c])));
      cand.sort((a, b) => a[0] - b[0]);
      cand.forEach(([, b, c]) => { if (!usedB.has(b) && !usedC.has(c)) { pairs.push([b, c]); usedB.add(b); usedC.add(c); } });
    });
    const moved = pairs.filter(([b, c]) => Math.hypot(b.x - c.x, b.y - c.y) > 15 || Math.abs((((c.rot || 0) - (b.rot || 0)) % 360 + 540) % 360 - 180) > 10 || (b.w && c.w && (Math.abs(b.w - c.w) > 2 || Math.abs(b.h - c.h) > 2)) || (b.hgt || 0) !== (c.hgt || 0)).map(([b, c]) => ({ it: c, from: b }));
    return { added: C.filter(it => !usedC.has(it)), removed: B.filter(it => !usedB.has(it)), moved };
  };
  // 違いのまとめ（例：「Tp +1、Cl1 −1、5か所移動」）
  R.diffSummary = function (df) {
    const name = it => (it.type === 'player' ? (it.label || '奏者') : (SS.CATALOG[it.type] || {}).name || it.type);
    const cnt = {};
    df.added.forEach(it => { cnt[name(it)] = (cnt[name(it)] || 0) + 1; });
    df.removed.forEach(it => { cnt[name(it)] = (cnt[name(it)] || 0) - 1; });
    const parts = Object.keys(cnt).filter(k2 => cnt[k2]).map(k2 => `${k2} ${cnt[k2] > 0 ? '+' : '−'}${Math.abs(cnt[k2])}`);
    if (df.moved.length) parts.push(`${df.moved.length}か所移動`);
    return parts.join('、');
  };
  // 違いの印。色だけでなく形でも分かるように：増えた＝○と＋、減った＝点線の□と−（うすく元の形）、動いた＝矢印
  R.compareSVG = function (df, k, opts) {
    const box = it => { const b = bboxOf(it); return b; };
    let s = '<g class="compare" pointer-events="none">';
    const badge = (x, y, sym, col, square) => {
      const r = 9 / k;
      return (square ? `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="${col}" stroke="#fff" stroke-width="${1.5 / k}"/>` : `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="#fff" stroke-width="${1.5 / k}"/>`) +
        `<text x="${x}" y="${y}" dy="0.36em" text-anchor="middle" font-size="${14 / k}" font-weight="700" fill="#fff">${sym}</text>`;
    };
    df.removed.forEach(it => {
      const d = SS.drawItem(it, Object.assign({}, opts || {}, { deferLabels: false }));
      const b = box(it), p = 6;
      s += `<g opacity=".28">${d.body}</g>`;
      s += `<rect x="${b.x0 - p}" y="${b.y0 - p}" width="${b.x1 - b.x0 + p * 2}" height="${b.y1 - b.y0 + p * 2}" fill="none" stroke="#c92a2a" stroke-width="${2.2 / k}" stroke-dasharray="${6 / k} ${4 / k}"/>`;
      s += badge(b.x0 - p, b.y0 - p, '−', '#c92a2a', true);
    });
    df.moved.forEach(({ it, from }) => {
      const L = Math.hypot(it.x - from.x, it.y - from.y);
      if (L > 15) {
        const ang = Math.atan2(it.y - from.y, it.x - from.x), ah = 10 / k;
        const ex = it.x - Math.cos(ang) * Math.min(L * 0.3, 22), ey = it.y - Math.sin(ang) * Math.min(L * 0.3, 22);
        s += `<circle cx="${from.x}" cy="${from.y}" r="${5 / k}" fill="#fff" stroke="#d9480f" stroke-width="${2 / k}"/>`;
        s += `<path d="M${from.x} ${from.y}L${ex} ${ey}M${ex - Math.cos(ang - 0.5) * ah} ${ey - Math.sin(ang - 0.5) * ah}L${ex} ${ey}L${ex - Math.cos(ang + 0.5) * ah} ${ey - Math.sin(ang + 0.5) * ah}" fill="none" stroke="#d9480f" stroke-width="${2.4 / k}" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else {
        const b = box(it);
        s += `<rect x="${b.x0 - 5}" y="${b.y0 - 5}" width="${b.x1 - b.x0 + 10}" height="${b.y1 - b.y0 + 10}" fill="none" stroke="#d9480f" stroke-width="${2 / k}" stroke-dasharray="${2 / k} ${3 / k}"/>`;
        s += `<text x="${b.x1 + 4 / k}" y="${b.y0}" font-size="${12 / k}" font-weight="700" fill="#d9480f">↻</text>`;
      }
    });
    df.added.forEach(it => {
      const b = box(it);
      if (it.type === 'cable') {
        // ケーブルは線そのものが印。始まり（マイク側）に＋
        const q = (it.pts || [[0, 0]])[0], sx = it.x + q[0], sy = it.y + q[1];
        // つながっているマイクも増えたときは、マイクの印だけにする（印が重ならないように）
        if (df.added.some(o => o !== it && o.type !== 'cable' && (b2 => sx >= b2.x0 - 10 && sx <= b2.x1 + 10 && sy >= b2.y0 - 10 && sy <= b2.y1 + 10)(box(o)))) return;
        s += badge(it.x + q[0] + 12 / k, it.y + q[1] - 12 / k, '＋', '#1e8e4e');
      } else if (Math.max(b.x1 - b.x0, b.y1 - b.y0) > 130) {
        // 大きい物（ひな壇など）は外枠の四角
        s += `<rect x="${b.x0 - 6}" y="${b.y0 - 6}" width="${b.x1 - b.x0 + 12}" height="${b.y1 - b.y0 + 12}" rx="${8 / k}" fill="none" stroke="#1e8e4e" stroke-width="${2.6 / k}"/>`;
        s += badge(b.x1 + 6, b.y0 - 6, '＋', '#1e8e4e');
      } else {
        const r = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 8;
        s += `<circle cx="${it.x}" cy="${it.y}" r="${r}" fill="none" stroke="#1e8e4e" stroke-width="${2.6 / k}"/>`;
        s += badge(it.x + r * 0.71, it.y - r * 0.71, '＋', '#1e8e4e');
      }
    });
    return s + '</g>';
  };

  // ---------------------------------------------------------------- 図面（用紙・縮尺・情報欄）
  R.PAPERS = { A4: [297, 210], A3: [420, 297] }; // 横向きの mm
  R.SCALES = [20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500];
  // 図面用（白黒・線だけ）：色を使わず、白い面と黒い線・黒い文字だけにする
  R.MONO_CSS = `.mono [fill]:not([fill="none"]):not([fill="transparent"]):not(text):not(image){fill:#fff !important}
.mono [stroke]:not([stroke="none"]):not([stroke="transparent"]):not(text){stroke:#000 !important}
.mono text{fill:#000 !important}.mono text[stroke]{stroke:#fff !important}
.mono .grid path{stroke:#b0b0b0 !important}.mono g.hina-legs.hina-legs[fill]:not([fill="none"]){fill:#000 !important}.mono .item-hina rect:first-child{fill:#fff !important}`;

  const MM_TEXT = 2.8; // 寸法などの文字の大きさ（紙の上の mm）
  // 紙の上で見た目の文字の大きさを一定にするための k（dimsSVG・marksSVG 用）。f = 1cm が紙の上で何 mm か
  const kFor = f => (13 * f) / MM_TEXT;

  // 図の中身（舞台・部品・寸法・上手下手など）。単位は cm
  function drawingContent(doc, opts, conductor, ex, k) {
    if (ex.content === 'contest') return contestContent(doc, opts, k);
    if (ex.content === 'assembly') {
      // ひな壇の組み図：段・上がり段・平台・指揮台だけ（平台1枚ずつの番号と足の位置）
      const keep = new Set(['hina', 'stairs', 'riser', 'riser46', 'podium']);
      const d2 = Object.assign({}, doc, { items: doc.items.filter(it => keep.has(it.type)) });
      let s = R.stageSVG(d2, opts.grid && ex.grid ? (opts.gridSize || 50) : 0);
      s += R.itemsSVG(d2, Object.assign({}, opts, { assembly: true, hinaDetail: true }), conductor, false);
      if (opts.dims) s += R.dimsSVG(d2, k, null);
      s += R.marksSVG(d2, k, opts.dims);
      return s;
    }
    let s = R.stageSVG(doc, opts.grid && ex.grid ? (opts.gridSize || 50) : 0);
    if (ex.underlay && doc.underlay) s += R.underlaySVG(doc.underlay, { id: 'ex' });
    s += R.itemsSVG(doc, opts, conductor, false);
    if (ex.compare) s += R.compareSVG(R.diffItems(ex.compare.items, doc.items), k, opts);
    if (ex.extraSVG) s += ex.extraSVG(k); // 転換の印など
    if (opts.dims) s += R.dimsSVG(doc, k, null);
    s += R.marksSVG(doc, k, opts.dims);
    return s;
  }
  // ---------------------------------------------------------------- コンクール提出用（白黒◯×）
  // 出すのは、舞台の形・ひな壇の段・椅子◯・譜面台×・パート名・打楽器などの楽器・指揮台・客席の向きだけ。
  // 寸法・センター線・平台の継ぎ目・上手下手・マイクなどは出さない
  const CONTEST_KEEP = new Set(['podium', 'hina', 'riser', 'riser46', 'piano', 'pianoFull', 'upright', 'keyboard', 'harp']);
  R.contestKeeps = it => it.type === 'player' || CONTEST_KEEP.has(it.type) || ((SS.CATALOG[it.type] || {}).cat === '打楽器') || it.type === 'timp';
  const SEAT_R = 20, X_R = 14;
  // 部品の外形を多角形（図の座標）で
  const polyOf = it => {
    const loc = it.type === 'hina' && SS.hinaOutline ? SS.hinaOutline(it) : (() => { const w = it.w || (SS.CATALOG[it.type] || {}).w || 50, h = it.h || (SS.CATALOG[it.type] || {}).h || 50; return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]; })();
    const a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    return loc.map(([x, y]) => [it.x + x * c - y * sn, it.y + x * sn + y * c]);
  };
  const inPolyW = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  // パート名の略し方（◯に入りきらないとき）。よく使う略号はそのまま、長い名前は頭の文字＋番号
  const SHORT = { picc: 'Pic', piccolo: 'Pic', flute: 'Fl', oboe: 'Ob', clarinet: 'Cl', bassoon: 'Fg', fagott: 'Fg', horn: 'Hr', trumpet: 'Tp', trombone: 'Tb', euph: 'Eu', euphonium: 'Eu', tuba: 'Tu', timp: 'Ti', perc: 'Pc', 'st.b': 'SB', 'b.tb': 'BTb', 'b.cl': 'BCl', 'a.sx': 'ASx', 't.sx': 'TSx', 'b.sx': 'BSx', 'es.cl': 'EsC', solocnt: 'SoC', sopcnt: 'Sop', repcnt: 'Rep', '2ndcnt': '2Co', '3rdcnt': '3Co', flh: 'Flh', solohn: 'SHn', '1sthn': '1Hn', '2ndhn': '2Hn', ebbass: 'EbB', bbbass: 'BbB', bar1: 'Ba1', bar2: 'Ba2' };
  R.shortPart = function (lab) {
    const l = String(lab || '').trim(), k = l.toLowerCase();
    if (SHORT[k]) return SHORT[k];
    const m = /^(.+?)\s*(\d+)$/.exec(l);
    if (m && SHORT[m[1].toLowerCase()]) return SHORT[m[1].toLowerCase()] + m[2];
    if (l.length <= 3) return l;
    return m ? m[1].replace(/[.\s]/g, '').slice(0, 2) + m[2] : l.replace(/[.\s]/g, '').slice(0, 3);
  };
  R.contestPlayersSVG = function (doc, opts) {
    const showLeads = !opts || opts.showLeads !== false;
    const ps = doc.items.filter(it => it.type === 'player');
    const noStand = it => ['perc', 'drs', 'pf', 'hp', 'voice'].includes(SS.instrumentKind(it.label));
    const fwd = it => { const a = ((it.rot || 0) * Math.PI) / 180; return [-Math.sin(a), Math.cos(a)]; };
    // じゃまになる物：椅子の◯、楽器（打楽器・ピアノなど）、指揮台
    const things = doc.items.filter(it => it.type !== 'player' && it.type !== 'hina' && it.type !== 'riser' && it.type !== 'riser46').map(polyOf);
    const inThing = (x, y, r) => things.some(pg => inPolyW(x, y, pg) || pg.some(([px, py]) => Math.hypot(px - x, py - y) < r));
    const lines = doc.items.filter(it => it.type === 'hina' || it.type === 'riser' || it.type === 'riser46').map(polyOf);
    // 1) 譜面台の×：その人の◯の前（指揮者側）に、◯から少し離して。となりの◯・×と重ならない所
    const xs = [];
    const pairs = SS.standPairs ? SS.standPairs(doc.items) : new Map();
    const done = new Set();
    const seatHit = (x, y, r, skip) => ps.some(q => !skip.includes(q) && Math.hypot(q.x - x, q.y - y) < SEAT_R + r + 3);
    const xHit = (x, y) => xs.some(p => Math.hypot(p.x - x, p.y - y) < X_R * 2 + 4);
    const order = ps.slice().sort((a, b) => b.y - a.y);
    order.forEach(it => {
      if (noStand(it) || done.has(it)) return;
      const mate = pairs.get(it);
      const who = mate ? [it, mate] : [it];
      who.forEach(w => done.add(w));
      const f = who.map(fwd).reduce((a, v) => [a[0] + v[0], a[1] + v[1]], [0, 0]);
      const L = Math.hypot(f[0], f[1]) || 1, fx = f[0] / L, fy = f[1] / L;
      const cx = who.reduce((a, w) => a + w.x, 0) / who.length, cy = who.reduce((a, w) => a + w.y, 0) / who.length;
      let best = null, bestS = Infinity;
      [46, 40, 52, 58, 64].forEach((d, di) => [0, -9, 9, -18, 18].forEach((lat, li) => {
        const x = cx + fx * d - fy * lat, y = cy + fy * d + fx * lat;
        const own = who.some(w => Math.hypot(w.x - x, w.y - y) < SEAT_R + X_R + 3);
        const sc = (own ? 50 : 0) + (seatHit(x, y, X_R, who) ? 20 : 0) + (xHit(x, y) ? 20 : 0) + (inThing(x, y, X_R) ? 10 : 0) + di * 0.6 + li * 0.4;
        if (sc < bestS) { bestS = sc; best = { x, y, rot: (Math.atan2(fy, fx) * 180) / Math.PI - 90 }; }
      }));
      xs.push(best);
    });
    let body = '';
    ps.forEach(it => {
      const kind = SS.instrumentKind(it.label);
      body += `<circle cx="${it.x.toFixed(1)}" cy="${it.y.toFixed(1)}" r="${SEAT_R}" fill="#fff" stroke="#111" stroke-width="2.6"${kind === 'perc' || kind === 'bass' ? ' stroke-dasharray="6 4"' : ''}/>`;
    });
    xs.forEach(p => { body += `<path transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(1)})" d="M-11 -11L11 11M11 -11L-11 11" stroke="#111" stroke-width="3.4" stroke-linecap="round" fill="none"/>`; });
    // 2) パート名：どの◯の名前か迷わないよう、いつも◯の中に。入りきらないときは字を小さく、それでも入らなければ略して（例：Trombone → Tb）
    let text = '';
    ps.forEach(it => {
      const lab = (it.label || '').trim();
      if (lab) {
        const fit = t => Math.min(17, (SEAT_R * 2 - 6) / SS.labelWidth(t));
        let t = lab, fs = fit(t);
        if (fs < 10.5) { const ab = R.shortPart(lab); if (ab !== lab) { t = ab; fs = fit(t); } }
        fs = Math.max(7, fs);
        text += `<text x="${it.x.toFixed(1)}" y="${it.y.toFixed(1)}" dy="0.36em" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="#111">${SS.esc(t)}</text>`;
      }
      // 首席の★（◯の右上）
      if (it.lead && showLeads) text += `<text x="${(it.x + SEAT_R * 0.62).toFixed(1)}" y="${(it.y - SEAT_R * 0.95).toFixed(1)}" dy="0.35em" font-size="14" font-weight="700" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${SS.leadMark(it)}</text>`;
    });
    return body + `<g pointer-events="none">${text}</g>`;
  };
  R.contestMarksSVG = function (doc, k) {
    const st = doc.stage, cx = st.w / 2, col = '#111';
    const cy = R.frontOuter(st) + 12 / k + 16 / k;
    return `<g class="marks" pointer-events="none"><text x="${cx}" y="${cy}" dy="0.35em" text-anchor="middle" font-size="${17 / k}" font-weight="700" fill="${col}" letter-spacing="${8 / k}">客　席</text>` +
      `<path d="M${cx - 60 / k} ${cy - 14 / k}l${6 / k} ${-8 / k}l${6 / k} ${8 / k}M${cx + 48 / k} ${cy - 14 / k}l${6 / k} ${-8 / k}l${6 / k} ${8 / k}" fill="none" stroke="${col}" stroke-width="${1.5 / k}"/></g>`;
  };
  function contestContent(doc, opts, k) {
    const d2 = Object.assign({}, doc, { items: doc.items.filter(R.contestKeeps) });
    const o = Object.assign({}, opts, { contestSheet: true, contest: true, mono: true, figure: false, colorBy: false, hinaDetail: false, showNumbers: false });
    let s = R.stageSVG(d2, 0);
    const others = Object.assign({}, d2, { items: d2.items.filter(it => it.type !== 'player') });
    s += R.itemsSVG(others, o, null, false);
    s += R.contestPlayersSVG(d2, opts);
    s += R.contestMarksSVG(d2, k);
    return s;
  }

  // 中身がはみ出さない範囲（文字の大きさまで含めて、ブラウザで実際に測る）
  let measureEl = null;
  function measure(svgInner) {
    if (typeof document === 'undefined') return null;
    if (!measureEl) {
      measureEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      measureEl.setAttribute('style', 'position:absolute;left:-99999px;top:0;width:10px;height:10px;visibility:hidden');
      document.body.appendChild(measureEl);
    }
    measureEl.innerHTML = `<g font-family="'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,sans-serif">${svgInner}</g>`;
    let b = null;
    try { const r = measureEl.firstChild.getBBox(); b = { x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height }; } catch (e) { /* ignore */ }
    measureEl.innerHTML = '';
    return b;
  }
  function contentBounds(doc, opts, conductor, ex, k) {
    const inner = drawingContent(doc, opts, conductor, Object.assign({}, ex, { underlay: false }), k);
    let b = measure(inner);
    if (!b) { const st = doc.stage; b = { x0: -200, y0: -150, x1: st.w + 200, y1: R.frontY(st) + 200 }; }
    const m = 3 / (k / 4.64); // 約3mmのゆとり
    b = { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m };
    if (ex.underlay && doc.underlay && ex.underlayAll) {
      const u = R.underlayBounds(doc.underlay);
      b = { x0: Math.min(b.x0, u.x0), y0: Math.min(b.y0, u.y0), x1: Math.max(b.x1, u.x1), y1: Math.max(b.y1, u.y1) };
    }
    return b;
  }
  const niceLen = cm => { const c = [50, 100, 200, 250, 500, 1000, 2000]; return c.reduce((a, v) => (Math.abs(v - cm) < Math.abs(a - cm) ? v : a), c[0]); };
  const fmtDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? `${+m[1]}年${+m[2]}月${+m[3]}日` : (v || ''); };

  /**
   * 用紙1枚の図面を作る。
   * ex.paper: { size: 'A4'|'A3', orient: 'landscape'|'portrait', scale: 0（用紙に合わせる）| 50 | 100 | 200 … }
   * 戻り値 { svg, info: { f（1cmが紙の上で何mm）, scale, fits, suggest, paperW, paperH, drawBox } }
   */
  R.sheet = function (doc, opts, conductor, ex) {
    ex = Object.assign({ legend: true, pxPerMm: 0 }, ex);
    // 音響の機材（マイク・モニター・ケーブル）を入れないとき
    if (ex.audio === false && SS.isAudio) doc = Object.assign({}, doc, { items: doc.items.filter(it => !SS.isAudio(it)) });
    const pp = Object.assign({ size: 'A4', orient: 'landscape', scale: 0 }, ex.paper || {});
    const [pl, ps] = R.PAPERS[pp.size] || R.PAPERS.A4;
    const PW = pp.orient === 'portrait' ? ps : pl, PH = pp.orient === 'portrait' ? pl : ps;
    // コンクール提出用：余白を小さく、見出しは団体名とメモだけ、情報欄・縮尺のものさしは出さない
    const contest = ex.content === 'contest';
    const M = contest ? 6 : 10; // 紙のふちの余白
    const info = doc.info || {};
    // 見出し（公演名・サブタイトル）
    const assembly = ex.content === 'assembly';
    const title = contest ? (ex.org || '').trim() : doc.title;
    const subtitle = contest ? (ex.memo || '').trim() : assembly ? [doc.subtitle, 'ひな壇の組み図'].filter(Boolean).join('　') : doc.subtitle;
    const headH = title || subtitle ? (title ? 11 : 0) + (subtitle ? 6 : 0) + 3 : 0;
    // 情報欄（右下）と編成表（左下）
    const TBW = contest ? 0 : Math.min(128, PW - 2 * M), rowH = 5.4;
    const rows = [
      [['公演名', doc.title || '']],
      [['会場', info.venue || doc.hall || ''], ['日付', fmtDate(info.date)]],
      [['版', info.version ? `第${info.version}版` : ''], ['作成', info.author || '']],
      [['縮尺', ''], ['用紙', `${pp.size} ${pp.orient === 'portrait' ? '縦' : '横'}`]],
      [['メモ', info.memo || '']],
    ];
    if (info.changeNote) rows.push([['変更', info.changeNote]]);
    const TBH = contest ? 0 : rows.length * rowH;
    let legendItems = [];
    if (assembly) {
      // 部材の表（番号は図の平台の番号と同じ）
      const sm = SS.hinaSummary(doc.items);
      legendItems = sm.rows.map(r => ({ text: `${r.label}　高さ${Math.round(r.hgt)}cm・${fmtM(r.w)}×${fmtM(r.h)}：${r.panelName} ${r.panels}枚［${r.first}〜${r.last}］${r.legs ? `／${r.legName} ${r.legs}個` : ''}` }));
      legendItems.push({ text: '合計：' + Object.keys(sm.pan).map(k2 => `${k2} ${sm.pan[k2]}枚`).concat(Object.keys(sm.leg).map(k2 => `${k2} ${sm.leg[k2]}個`)).concat(sm.stairs ? [`上がり段 ${sm.stairs}台`] : []).join('／'), bold: true });
      legendItems.title = 'ひな壇の部材（目安）';
      legendItems.oneCol = true;
    } else if (ex.legend) {
      const c = R.counts(doc);
      c.groups.forEach(x => x.parts.forEach(p => legendItems.push({ color: x.g.color, text: `${p.label} ×${p.n}` })));
      const pw = SS.powerSummary ? SS.powerSummary(doc.items) : null;
      if (pw && pw.lights) legendItems.push({ color: '#ffe066', text: `譜面灯 ×${pw.lights}` });
      if (pw && pw.need) legendItems.push({ color: '#fff', text: `電源 ${pw.need}口` });
      legendItems.total = c.total;
    }
    // 用意する物（いす・譜面台・平台・箱馬など）。名前が長いので2マス分の幅で
    if (!assembly && ex.equip && SS.equipmentSummary) {
      const eq = SS.equipmentSummary(doc.items);
      if (eq.length) {
        if (!legendItems.length) legendItems.title = '用意する物（目安）';
        else legendItems.push({ text: '用意する物（目安）：', plain: true, bold: true, wide: true });
        eq.forEach(e => legendItems.push({ text: `${e.name} ×${e.n}`, plain: true, wide: true }));
      }
    }
    const cellW = 25, lfs = 3, lrow = 4.6;
    const sideW = PW - 2 * M - TBW - 4; // 情報欄の左の空き
    const textLen = t => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 1 : 0.58), 0);
    // 部材の表は1行が長いので、字が小さくなりすぎるときは情報欄の上に出す
    const legendBeside = !contest && sideW >= 55 && (!legendItems.oneCol || Math.max(...legendItems.map(c => textLen(c.text))) * 2.3 <= sideW);
    const lCols = legendItems.oneCol ? 1 : Math.max(1, Math.floor((legendBeside ? sideW : PW - 2 * M) / cellW));
    // マス目の位置（wide の項目は2マス。行の終わりに入らなければ次の行へ。見出しの項目は行のはじめから）
    let slot = 0;
    legendItems.forEach(c => {
      const span = c.wide && lCols >= 2 ? 2 : 1;
      if ((c.bold && c.plain && slot % lCols) || (slot % lCols) + span > lCols) slot = Math.ceil(slot / lCols) * lCols;
      c.slot = slot; slot += c.bold && c.plain ? lCols : span;
    });
    const legendH = legendItems.length ? 5 + Math.ceil(slot / lCols) * lrow : 0;
    // コンクール提出用：記号の見方（凡例）を図のすぐ下に1行で
    const keyOn = contest && ex.keyLegend !== false;
    const keyH = keyOn ? 7 : 0;
    const bandH = Math.max(TBH, legendBeside ? legendH : 0) + (legendBeside ? 0 : legendH ? legendH + 3 : 0) + keyH;
    const draw = { x: M, y: M + headH, w: PW - 2 * M, h: PH - 2 * M - headH - bandH - (contest ? 0 : 4) };
    const SB = contest ? 0 : 9; // 縮尺のものさしの高さ

    // 縮尺を決める（中身の大きさは文字の大きさで少し変わるので、数回くりかえして合わせる）
    const fitF = () => {
      let f = 0.1;
      for (let i = 0; i < 4; i++) { const b = contentBounds(doc, opts, conductor, ex, kFor(f)); f = Math.min(draw.w / (b.x1 - b.x0), (draw.h - SB) / (b.y1 - b.y0)); }
      return f;
    };
    const fitsAt = n => { const f = 10 / n, b = contentBounds(doc, opts, conductor, ex, kFor(f)); return (b.x1 - b.x0) * f <= draw.w + 0.01 && (b.y1 - b.y0) * f <= draw.h - SB + 0.01; };
    let f, scaleN = pp.scale, fits = true, suggest = 0;
    if (scaleN) {
      f = 10 / scaleN;
      fits = fitsAt(scaleN);
      if (!fits) suggest = R.SCALES.find(n => n > scaleN && fitsAt(n)) || 0;
    } else {
      f = fitF();
      scaleN = 10 / f;
    }
    const k = kFor(f);
    const b = contentBounds(doc, opts, conductor, ex, k);
    const cw = (b.x1 - b.x0) * f, ch = (b.y1 - b.y0) * f;
    const ox = draw.x + (draw.w - cw) / 2 - b.x0 * f, oy = draw.y + (contest ? 0 : Math.max(0, (draw.h - SB - ch) / 2)) - b.y0 * f;
    const scaleText = pp.scale ? `1/${pp.scale}` : `約1/${Math.round(scaleN)}（用紙に合わせる）`;
    rows[3][0][1] = scaleText;

    const pxW = ex.pxPerMm ? Math.round(PW * ex.pxPerMm) : 0;
    const font = `'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,sans-serif`;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${pxW ? `width="${pxW}" height="${Math.round(PH * ex.pxPerMm)}"` : `width="${PW}mm" height="${PH}mm"`} viewBox="0 0 ${PW} ${PH}" font-family="${font}">`;
    if (opts.mono) out += `<style>${R.MONO_CSS}</style>`;
    out += `<rect x="0" y="0" width="${PW}" height="${PH}" fill="#fff"/>`;
    // 見出し
    let hy = M;
    if (title) { out += `<text x="${PW / 2}" y="${hy + 7.5}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#111">${SS.esc(title)}</text>`; hy += 11; }
    if (subtitle) out += `<text x="${PW / 2}" y="${hy + 4}" text-anchor="middle" font-size="4.2" fill="#333">${SS.esc(subtitle)}</text>`;
    // 図（縮尺どおり。はみ出す分は図の枠で切る）
    out += `<clipPath id="drawClip"><rect x="${draw.x}" y="${draw.y}" width="${draw.w}" height="${draw.h}"/></clipPath>`;
    out += `<g clip-path="url(#drawClip)"><g${opts.mono ? ' class="mono"' : ''} transform="translate(${ox.toFixed(3)} ${oy.toFixed(3)}) scale(${f.toFixed(6)})">${drawingContent(doc, opts, conductor, ex, k)}</g></g>`;
    // スケールバー（紙の上の長さが実際の長さと同じ比率）
    if (!contest) {
      const L = niceLen(38 / f), Lmm = L * f, sbx = draw.x + 1, sby = draw.y + draw.h - 3;
      out += `<g font-size="2.6" fill="#111">`;
      for (let i = 0; i < 4; i++) out += `<rect x="${sbx + (Lmm / 4) * i}" y="${sby - 1.6}" width="${Lmm / 4}" height="1.6" fill="${i % 2 ? '#fff' : '#111'}" stroke="#111" stroke-width="0.25"/>`;
      out += `<text x="${sbx}" y="${sby - 2.6}">0</text><text x="${sbx + Lmm / 2}" y="${sby - 2.6}" text-anchor="middle">${L / 200}m</text><text x="${sbx + Lmm}" y="${sby - 2.6}" text-anchor="middle">${L / 100}m</text>`;
      out += `<text x="${sbx + Lmm + 3}" y="${sby}" >縮尺 ${scaleText}</text>`;
      if (ex.compare && !assembly) {
        // 違いの印の見方（白黒でも分かるよう形で）
        const lx = sbx + Lmm + 44, ly = sby - 0.6, r = 1.3, mono = !!opts.mono;
        const cG = mono ? '#fff' : '#1e8e4e', cR = mono ? '#fff' : '#c92a2a', cO = mono ? '#111' : '#d9480f', tc = mono ? '#111' : '#fff', sk = mono ? ' stroke="#111" stroke-width="0.3"' : '';
        out += `<text x="${lx}" y="${sby}" font-weight="700">${SS.esc(ex.compare.name || '前の版')}とくらべて：</text>`;
        const x1 = lx + 3 + (SS.esc(ex.compare.name || '前の版').length + 6) * 2.6;
        out += `<circle cx="${x1}" cy="${ly}" r="${r}" fill="${cG}"${sk}/><text x="${x1}" y="${ly}" dy="0.36em" text-anchor="middle" font-size="2" fill="${tc}" font-weight="700">＋</text><text x="${x1 + 2.2}" y="${sby}">増えた</text>`;
        out += `<rect x="${x1 + 13 - r}" y="${ly - r}" width="${r * 2}" height="${r * 2}" fill="${cR}"${sk}/><text x="${x1 + 13}" y="${ly}" dy="0.36em" text-anchor="middle" font-size="2" fill="${tc}" font-weight="700">−</text><text x="${x1 + 15.2}" y="${sby}">減った</text>`;
        out += `<path d="M${x1 + 25} ${ly}h4.5M${x1 + 28} ${ly - 1.2}L${x1 + 29.5} ${ly}L${x1 + 28} ${ly + 1.2}" fill="none" stroke="${cO}" stroke-width="0.5"/><text x="${x1 + 31}" y="${sby}">動いた</text>`;
      }
      out += '</g>';
      // 情報欄（右下）
      const tx = PW - M - TBW, ty = PH - M - TBH;
      out += `<g font-size="3" fill="#111"><rect x="${tx}" y="${ty}" width="${TBW}" height="${TBH}" fill="#fff" stroke="#111" stroke-width="0.45"/>`;
      rows.forEach((row, ri) => {
        const y = ty + ri * rowH;
        if (ri) out += `<line x1="${tx}" y1="${y}" x2="${tx + TBW}" y2="${y}" stroke="#111" stroke-width="0.25"/>`;
        const cw2 = TBW / row.length;
        row.forEach(([lab, val], ci) => {
          const x = tx + ci * cw2;
          if (ci) out += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + rowH}" stroke="#111" stroke-width="0.25"/>`;
          out += `<line x1="${x + 13}" y1="${y}" x2="${x + 13}" y2="${y + rowH}" stroke="#111" stroke-width="0.15"/>`;
          out += `<text x="${x + 1.5}" y="${y + rowH / 2}" dy="0.35em" font-size="2.6" fill="#444">${lab}</text>`;
          const maxChars = Math.floor((cw2 - 16) / 2.9);
          const v = String(val);
          const fs = v.length > maxChars ? Math.max(1.8, (3 * maxChars) / v.length) : 3;
          out += `<text x="${x + 14.5}" y="${y + rowH / 2}" dy="0.35em" font-size="${fs.toFixed(2)}" font-weight="${lab === '公演名' ? 700 : 400}">${SS.esc(v)}</text>`;
        });
      });
      out += '</g>';
    }
    // 記号の見方（◯＝いす・×＝譜面台・点線の◯＝立って演奏する人・★＝首席）
    if (keyOn) {
      const ky = draw.y + ch + 4.5, fs2 = 2.9;
      const ps2 = doc.items.filter(it => it.type === 'player');
      const standing = ps2.some(it => ['perc', 'bass'].includes(SS.instrumentKind(it.label)));
      const lead = opts.showLeads !== false && ps2.some(it => it.lead);
      const cm = lead && ps2.some(it => it.lead === 'cm');
      let kx = M, g = `<g font-size="${fs2}" fill="#111">`;
      const item = (sym, label) => { g += sym(kx) + `<text x="${(kx + 4.4).toFixed(2)}" y="${ky}" dy="0.35em">${label}</text>`; kx += 4.4 + textLen(label) * fs2 * 0.98 + 5; };
      item(x => `<circle cx="${x + 1.8}" cy="${ky}" r="1.7" fill="#fff" stroke="#111" stroke-width="0.35"/>`, 'いす');
      item(x => `<path d="M${x + 0.4} ${ky - 1.4}l2.8 2.8M${x + 3.2} ${ky - 1.4}l-2.8 2.8" stroke="#111" stroke-width="0.45" stroke-linecap="round"/>`, '譜面台');
      if (standing) item(x => `<circle cx="${x + 1.8}" cy="${ky}" r="1.7" fill="#fff" stroke="#111" stroke-width="0.35" stroke-dasharray="0.7 0.5"/>`, '立って演奏する人（打楽器など）');
      if (lead) item(x => `<text x="${x + 1.8}" y="${ky}" dy="0.35em" text-anchor="middle" font-weight="700">★</text>`, cm ? 'パートのトップ（首席）・★CM＝コンサートマスター' : 'パートのトップ（首席）');
      out += g + '</g>';
    }
    // 編成表（情報欄の左、入らなければ上）
    if (legendItems.length) {
      // コンクール提出用は、図のすぐ下に（記号の見方の下）
      const lx = M, ly = contest ? draw.y + ch + 3 + keyH : legendBeside ? PH - M - Math.max(legendH, TBH) : PH - M - TBH - 3 - legendH;
      out += `<g font-size="${lfs}" fill="#111"><text x="${lx}" y="${ly + 3}" font-weight="700" font-size="3.4">${legendItems.title ? SS.esc(legendItems.title) : `編成（計 ${legendItems.total} 人）`}</text>`;
      if (legendItems.oneCol) {
        // 1行に1段。入りきらない行は字を小さくする
        const avail = legendBeside ? sideW : PW - 2 * M;
        legendItems.forEach((c, i) => {
          const y = ly + 5 + i * lrow + 2.6;
          const fs = Math.max(1.7, Math.min(lfs, avail / textLen(c.text)));
          out += `<text x="${lx}" y="${y}" font-size="${fs.toFixed(2)}"${c.bold ? ' font-weight="700"' : ''}>${SS.esc(c.text)}</text>`;
        });
        legendItems.length = 0;
      }
      legendItems.forEach(c => {
        const x = lx + (c.slot % lCols) * cellW, y = ly + 5 + Math.floor(c.slot / lCols) * lrow + 2.6;
        if (c.plain) { const room = (c.bold ? lCols : c.wide && lCols >= 2 ? 2 : 1) * cellW - 2, fs2 = Math.max(1.8, Math.min(lfs, room / textLen(c.text))); out += `<text x="${x}" y="${y}" font-size="${fs2.toFixed(2)}"${c.bold ? ' font-weight="700"' : ''}>${SS.esc(c.text)}</text>`; return; }
        out += `<circle cx="${x + 1.4}" cy="${y - 1}" r="1.3" fill="${opts.colorBy && !opts.mono ? c.color : '#fff'}" stroke="#333" stroke-width="0.25"/>`;
        out += `<text x="${x + 3.6}" y="${y}">${SS.esc(c.text)}</text>`;
      });
      out += '</g>';
    }
    out += '</svg>';
    return { svg: out, info: { f, scale: scaleN, fits, suggest, paperW: PW, paperH: PH, drawBox: draw, origin: { x: ox, y: oy } } };
  };

  // これまでの呼び方（書き出し用の SVG 文字列）
  R.fullSVG = function (doc, opts, conductor, ex) {
    ex = Object.assign({}, ex);
    if (!ex.paper) ex.paper = { size: 'A4', orient: 'landscape', scale: 0 };
    if (ex.pxPerCm && !ex.pxPerMm) ex.pxPerMm = ex.pxPerCm * 4;
    return R.sheet(doc, opts, conductor, ex).svg;
  };

  // PDF（1ページ・画像入り）を自分で組み立てる。ネットにつながっていなくても作れる
  R.pdfFromJpeg = function (jpegBytes, imgW, imgH, pageWmm, pageHmm) {
    const pt = mm => (mm * 72) / 25.4;
    const W = pt(pageWmm).toFixed(2), H = pt(pageHmm).toFixed(2);
    const enc = new TextEncoder();
    const parts = [], offs = [];
    let len = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`); push(jpegBytes); push('\nendstream'); });
    obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    const xref = len;
    push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  };
  R.svgToPdf = function (svg, pageWmm, pageHmm) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob(b => {
          if (!b) return reject(new Error('PDFを作れませんでした'));
          b.arrayBuffer().then(buf => resolve(R.pdfFromJpeg(new Uint8Array(buf), c.width, c.height, pageWmm, pageHmm)));
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('PDFを作れませんでした')); };
      img.src = url;
    });
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
    // ピンスポットの「当てる人」は部品の番号で覚える（共有リンクでは部品の id を省くため）
    if (slim.lighting && slim.lighting.spots) slim.lighting.spots.forEach(sp => { const i = doc.items.findIndex(it => it.id === sp.target); sp.target = i >= 0 ? '#' + i : ''; });
    const slimItems = list => (list || []).forEach(it => { it.x = Math.round(it.x); it.y = Math.round(it.y); it.rot = Math.round(it.rot || 0); delete it.id; });
    slimItems(slim.items);
    (slim.parts || []).forEach(p => slimItems(p.items)); // 1部・2部…のほかの部
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
  // prev：版を上げたときの、上げる前の配置図（前の版としてとっておき、あとでくらべられる。10版まで）
  R.saveToList = function (name, doc, prev) {
    const list = R.savedList();
    const slimOf = d => { const x = JSON.parse(JSON.stringify(d)); delete x.underlay; return x; };
    const slim = slimOf(doc);
    let existing = list.find(x => x.name === name);
    if (existing) { existing.doc = slim; existing.date = Date.now(); }
    else { existing = { id: Date.now().toString(36), name, date: Date.now(), doc: slim }; list.unshift(existing); }
    if (prev) {
      const v = (prev.info && prev.info.version) || 1;
      existing.versions = (existing.versions || []).filter(x => x.version !== v);
      existing.versions.unshift({ version: v, date: Date.now(), doc: slimOf(prev) });
      existing.versions = existing.versions.slice(0, 10);
    }
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  };
  R.deleteFromList = function (id) {
    localStorage.setItem(LIST_KEY, JSON.stringify(R.savedList().filter(x => x.id !== id)));
  };

  SS.render = R;
})(window.SS);
