/* 描画の共通部分・画像書き出し・保存・共有 */
window.SS = window.SS || {};

(function (SS) {
  const R = {};

  // 奥（y=0）の幅。反射板の形（shell）では stage.bw、台形は幅の80%
  R.backWidth = function (stage) {
    if (stage.shape === 'shell') return Math.min(stage.w, stage.bw || stage.w * 0.7);
    if (stage.shape === 'trapezoid') return stage.w * 0.8;
    return stage.w;
  };
  R.stagePath = function (stage) {
    const w = stage.w, d = stage.d;
    switch (stage.shape) {
      case 'apron': return `M0 0H${w}V${d}Q${w / 2} ${d + d * 0.28} 0 ${d}Z`;
      case 'trapezoid': case 'shell': {
        const b = R.backWidth(stage);
        return `M${(w - b) / 2} 0H${(w + b) / 2}L${w} ${d}H0Z`;
      }
      default: return `M0 0H${w}V${d}H0Z`;
    }
  };
  // 奥行 y の位置で使える左右の範囲 [左, 右]
  R.xRange = function (stage, y) {
    const b = R.backWidth(stage);
    const t = Math.max(0, Math.min(1, y / stage.d));
    const half = (b + (stage.w - b) * t) / 2;
    return [stage.w / 2 - half, stage.w / 2 + half];
  };
  // 点がステージの内側（margin だけ内側）に入るように寄せる
  R.clampToStage = function (stage, p, margin) {
    margin = margin || 0;
    const y = Math.max(margin, Math.min(stage.d - margin, p.y));
    const [l, r] = R.xRange(stage, y);
    return { x: Math.max(l + margin, Math.min(r - margin, p.x)), y };
  };
  R.insideStage = function (stage, p, margin) {
    const q = R.clampToStage(stage, p, margin || 0);
    return Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5;
  };
  R.stagePoly = function (stage) {
    const w = stage.w, d = stage.d, b = R.backWidth(stage);
    if (stage.shape === 'apron') {
      const pts = [[0, 0], [w, 0], [w, d]];
      for (let i = 1; i < 24; i++) { const t = i / 24; pts.push([w * (1 - t), d + 2 * t * (1 - t) * d * 0.28]); }
      pts.push([0, d]);
      return pts;
    }
    return [[(w - b) / 2, 0], [(w + b) / 2, 0], [w, d], [0, d]];
  };
  R.frontY = stage => stage.d + (stage.shape === 'apron' ? stage.d * 0.14 : 0);

  R.stageSVG = function (doc, grid) {
    const st = doc.stage;
    const p = R.stagePath(st);
    let s = `<path d="${p}" fill="#fbf6ec" stroke="#b89b6a" stroke-width="6"/>`;
    if (grid) s += `<path d="${p}" fill="url(#gridPat)"/>`;
    s += `<text x="${st.w / 2}" y="${R.frontY(st) + 70}" text-anchor="middle" font-size="40" fill="#8a94a3" font-weight="700" letter-spacing="20">客　席</text>`;
    s += `<text x="${st.w / 2}" y="-24" text-anchor="middle" font-size="26" fill="#a9b1bd">（舞台奥）</text>`;
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
    R.sortedItems(doc.items).forEach(it => {
      const d = SS.drawItem(it, Object.assign({}, opts, { number: nums ? nums.get(it) : 0 }));
      if (withIds) bodies += `<g class="item" data-id="${it.id}">${d.body}</g>`;
      else bodies += d.body;
      texts += d.text;
    });
    return bodies + `<g pointer-events="none">${texts}</g>`;
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
    const x0 = -pad, y0 = -titleH - pad / 2, W = st.w + pad * 2, H = bottom + legendH + pad - y0;
    const k = ex.pxPerCm;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(W * k)}" height="${Math.round(H * k)}" viewBox="${x0} ${y0} ${W} ${H}" font-family="'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,sans-serif">`;
    s += `<defs><pattern id="gridPat" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#d8dde6" stroke-width="1"/></pattern></defs>`;
    s += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#ffffff"/>`;
    if (doc.title) s += `<text x="${st.w / 2}" y="${-titleH + 30}" text-anchor="middle" font-size="52" font-weight="700" fill="#1f2733">${SS.esc(doc.title)}</text>`;
    if (doc.subtitle) s += `<text x="${st.w / 2}" y="${-titleH + 88}" text-anchor="middle" font-size="30" fill="#4a5462">${SS.esc(doc.subtitle)}</text>`;
    s += R.stageSVG(doc, opts.grid && ex.grid);
    const u = doc.underlay;
    if (ex.underlay && u) s += `<image href="${u.src}" x="${u.x}" y="${u.y}" width="${u.w}" height="${u.h}" opacity="${u.opacity}" preserveAspectRatio="none"/>`;
    s += R.itemsSVG(doc, opts, conductor, false);
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
