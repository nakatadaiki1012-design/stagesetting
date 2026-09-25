/* 3Dビュー（Three.js）。座標は m、Y が上、Z が客席方向 */
window.SS = window.SS || {};

(function (SS) {
  const V = {};
  const $ = id => document.getElementById(id);
  let T = null;            // THREE
  let renderer = null, scene = null, camera = null, raf = 0;
  let mode = 'orbit';
  const orbit = { target: null, r: 16, phi: 1.2, theta: 0 };
  const fp = { pos: null, yaw: 0, pitch: -0.08, fov: 60 };
  let playerGroups = new Map();
  let hiddenHead = null;
  let labelsOn = true;
  let stageW = 14, stageD = 9;
  let baseLights = [], rig = null, sceneRH = new Map(); // 照明テスト：もとの明かり・足した明かり・段の高さ
  V.clothes = 'black';

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = () => resolve(window.THREE);
      // 失敗した script は取りのぞく（次に3Dを開いたとき、もう一度読み込みを試す）
      s.onerror = () => { s.remove(); reject(new Error('3Dの部品を読み込めませんでした。インターネットにつながっているか確認して、「✕ 閉じる」で戻ってから、もう一度 3D を押してください。')); };
      document.head.appendChild(s);
    });
  }

  // ---------------------------------------------------------------- 部品づくり
  const matCache = new Map();
  function mat(color, opt) {
    const key = color + JSON.stringify(opt || {});
    if (!matCache.has(key)) {
      const o = Object.assign({ roughness: 0.6, metalness: 0 }, opt || {});
      o.color = new T.Color(color).convertSRGBToLinear();
      matCache.set(key, new T.MeshStandardMaterial(o));
    }
    return matCache.get(key);
  }
  const METAL = { metalness: 0.9, roughness: 0.22 };
  function mesh(geo, color, opt) {
    const m = new T.Mesh(geo, mat(color, opt));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function box(g, w, h, d, color, x, y, z, opt) {
    const m = mesh(new T.BoxGeometry(w, h, d), color, opt);
    m.position.set(x, y, z); g.add(m); return m;
  }
  function cyl(g, r1, r2, h, color, x, y, z, opt, seg) {
    const m = mesh(new T.CylinderGeometry(r1, r2, h, seg || 20), color, opt);
    m.position.set(x, y, z); g.add(m); return m;
  }
  function sph(g, r, color, x, y, z, opt) {
    const m = mesh(new T.SphereGeometry(r, 20, 16), color, opt);
    m.position.set(x, y, z); g.add(m); return m;
  }
  // 2点を結ぶ円柱（楽器の管・腕など）
  function tube(g, a, b, r, color, opt, r2) {
    const va = new T.Vector3(...a), vb = new T.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = mesh(new T.CylinderGeometry(r2 == null ? r : r2, r, len, 12), color, opt);
    m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.add(m); return m;
  }
  // 弦楽器の胴（くびれのある形を厚みのある板に）。長さ len は Y 方向、幅 wid は X 方向、厚み dep は Z 方向
  function fiddleBody(len, wid, dep, color) {
    const L = len / 2, W = wid / 2, sh = new T.Shape();
    sh.moveTo(0, L);
    sh.bezierCurveTo(W * 0.9, L, W * 0.85, L * 0.35, W * 0.62, L * 0.12);
    sh.bezierCurveTo(W * 0.55, 0, W * 0.55, -L * 0.1, W * 0.7, -L * 0.2);
    sh.bezierCurveTo(W * 1.05, -L * 0.5, W * 0.9, -L, 0, -L);
    sh.bezierCurveTo(-W * 0.9, -L, -W * 1.05, -L * 0.5, -W * 0.7, -L * 0.2);
    sh.bezierCurveTo(-W * 0.55, -L * 0.1, -W * 0.55, 0, -W * 0.62, L * 0.12);
    sh.bezierCurveTo(-W * 0.85, L * 0.35, -W * 0.9, L, 0, L);
    const geo = new T.ExtrudeGeometry(sh, { depth: dep, bevelEnabled: true, bevelThickness: dep * 0.25, bevelSize: Math.min(W, L) * 0.04, bevelSegments: 3, curveSegments: 10 });
    geo.translate(0, 0, -dep / 2);
    const m = mesh(geo, color, { roughness: 0.28, metalness: 0.05 });
    return m;
  }
  function bellCone(g, at, dir, r, len, color) {
    const m = mesh(new T.CylinderGeometry(r, r * 0.22, len, 24, 1, true), color, Object.assign({ side: T.DoubleSide }, METAL));
    const va = new T.Vector3(...at), vd = new T.Vector3(...dir).normalize();
    m.position.copy(va.clone().add(vd.clone().multiplyScalar(-len / 2)));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vd);
    g.add(m); return m;
  }

  // 木目・板のテクスチャ（その場で描く）
  const texCache = {};
  function planksTexture(base, plankPx, vertical) {
    const key = base + plankPx + vertical;
    if (texCache[key]) return texCache[key];
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 1024;
    const x = cv.getContext('2d');
    const c = new T.Color(base);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1024 / plankPx; i++) {
      const k = 0.86 + rnd() * 0.24;
      x.fillStyle = `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
      if (vertical) x.fillRect(i * plankPx, 0, plankPx, 1024); else x.fillRect(0, i * plankPx, 1024, plankPx);
      // 木目
      x.strokeStyle = 'rgba(60,35,15,.10)';
      for (let j = 0; j < 6; j++) {
        x.beginPath();
        const o = i * plankPx + rnd() * plankPx;
        if (vertical) { x.moveTo(o, 0); x.bezierCurveTo(o + 6, 300, o - 6, 700, o + 3, 1024); } else { x.moveTo(0, o); x.bezierCurveTo(300, o + 6, 700, o - 6, 1024, o + 3); }
        x.stroke();
      }
      x.fillStyle = 'rgba(40,25,10,.35)';
      if (vertical) x.fillRect(i * plankPx, 0, 2, 1024); else x.fillRect(0, i * plankPx, 1024, 2);
      // 板の継ぎ目
      const cut = rnd() * 1024;
      if (vertical) x.fillRect(i * plankPx, cut, plankPx, 2); else x.fillRect(cut, i * plankPx, 2, plankPx);
    }
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    texCache[key] = t;
    return t;
  }

  // パートの色（図では淡い色）を、3Dの服用にはっきりした濃い色にする
  function vivid(hex) {
    const c = new T.Color(hex), hsl = {};
    c.getHSL(hsl);
    if (hsl.s < 0.08) return '#4a5263';
    c.setHSL(hsl.h, Math.max(0.72, hsl.s), Math.min(0.42, Math.max(0.3, hsl.l * 0.55)));
    return '#' + c.getHexString();
  }
  // 反射板・客席の壁：木のパネル（色むら・木目・目地）。slat=true で細い木のルーバー（すき間が暗い）
  function panelTexture(base, slat) {
    const key = 'panel' + base + slat;
    if (texCache[key]) return texCache[key];
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 1024;
    const x = cv.getContext('2d');
    const c = new T.Color(base);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const rgb = k => `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
    if (slat) {
      x.fillStyle = '#120c08'; x.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 32; i++) {
        const k = 0.85 + rnd() * 0.3;
        const g = x.createLinearGradient(i * 32, 0, i * 32 + 24, 0);
        g.addColorStop(0, rgb(k * 0.8)); g.addColorStop(0.5, rgb(k * 1.08)); g.addColorStop(1, rgb(k * 0.75));
        x.fillStyle = g; x.fillRect(i * 32 + 2, 0, 24, 1024);
      }
    } else {
      const pw = 128, ph = 512;
      for (let i = 0; i < 1024 / pw; i++) for (let j = 0; j < 1024 / ph; j++) {
        const k = 0.88 + rnd() * 0.22;
        const g = x.createLinearGradient(0, j * ph, 0, j * ph + ph);
        g.addColorStop(0, rgb(k * 1.06)); g.addColorStop(1, rgb(k * 0.92));
        x.fillStyle = g; x.fillRect(i * pw, j * ph, pw, ph);
        // 木目（ゆるく波打つ縦の線）
        for (let l = 0; l < 14; l++) {
          x.strokeStyle = `rgba(70,40,15,${0.05 + rnd() * 0.08})`;
          x.lineWidth = 1 + rnd() * 1.5;
          const o = i * pw + rnd() * pw;
          x.beginPath(); x.moveTo(o, j * ph);
          x.bezierCurveTo(o + 8 - rnd() * 16, j * ph + ph * 0.3, o + 8 - rnd() * 16, j * ph + ph * 0.7, o + 4 - rnd() * 8, j * ph + ph);
          x.stroke();
        }
        // 目地（影と光）
        x.fillStyle = 'rgba(25,14,6,.55)'; x.fillRect(i * pw, j * ph, 3, ph); x.fillRect(i * pw, j * ph, pw, 3);
        x.fillStyle = 'rgba(255,230,190,.18)'; x.fillRect(i * pw + 3, j * ph + 3, 2, ph - 3);
      }
    }
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    texCache[key] = t;
    return t;
  }

  const GOLD = '#d9b04a', SILVER = '#d8dde3', BLACKW = '#161618', WOOD = '#7e4520', HAIRS = ['#2b211b', '#3b2f28', '#1c1714', '#4a3526', '#2a2522'];
  const SKINS = ['#f1c9a5', '#e8b995', '#f5d3b3', '#dcae88'];
  function hashId(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

  // 足元の影（床になじませる）
  let blobTex = null;
  function blobShadow(size, strength) {
    if (!blobTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const x = cv.getContext('2d');
      const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      blobTex = new T.CanvasTexture(cv);
    }
    const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: strength, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    m.renderOrder = 1;
    return m;
  }

  // 腕（肩→ひじ→手）
  function arm(g, sh, hand, color, skin) {
    const mid = [(sh[0] + hand[0]) / 2 + Math.sign(sh[0]) * 0.07, Math.min(sh[1], hand[1]) - 0.1, (sh[2] + hand[2]) / 2 - 0.02];
    tube(g, sh, mid, 0.045, color, { roughness: 0.8 }, 0.05);
    tube(g, mid, hand, 0.037, color, { roughness: 0.8 }, 0.043);
    sph(g, 0.046, color, mid[0], mid[1], mid[2], { roughness: 0.8 });
    // 手（少し平たい）
    const h = sph(g, 0.038, skin, hand[0], hand[1], hand[2]);
    h.scale.set(0.9, 0.65, 1.25);
    tube(g, [hand[0], hand[1], hand[2] - 0.05], hand, 0.03, '#f4f4f2', { roughness: 0.9 });
  }

  // 奏者（人＋楽器）
  // 譜面台（楽譜つき）。(x, z) が支柱、楽譜は -z 側（奏者の方）を向く
  function makeStand(g, x, z) {
    // 3本脚：開くと直径 約54cm。1本は奏者の方へ
    [Math.PI, Math.PI / 3, -Math.PI / 3].forEach(a => tube(g, [x, 0.3, z + 0.04], [x + Math.sin(a) * 0.27, 0.0, z + 0.04 + Math.cos(a) * 0.27], 0.008, '#222'));
    cyl(g, 0.009, 0.009, 0.86, '#222', x, 0.55, z);
    // 楽譜は奏者の方を向く（上が奥に倒れる）
    const desk = new T.Group();
    desk.position.set(x, 1.12, z + 0.03);
    desk.rotation.x = 0.42;
    box(desk, 0.5, 0.34, 0.012, '#1a1a1d', 0, 0, 0, { roughness: 0.5 });
    box(desk, 0.44, 0.3, 0.004, '#f4f1e8', 0, 0.01, -0.009, { roughness: 0.95 });
    box(desk, 0.5, 0.03, 0.05, '#1a1a1d', 0, -0.17, -0.02);
    g.add(desk);
  }

  // shared：2人で1本の譜面台のとき（譜面台は別に1本だけ描く）
  function makePlayer(it, partColor, shared, kindAs) {
    const g = new T.Group();
    const kind = kindAs || SS.instrumentKind(it.label);
    const standing = kind === 'perc' || kind === 'bass' || kind === 'voice' || kind === 'mc';
    const stool = kind === 'cb' || kind === 'drs';
    const bench = kind === 'pf';
    const seatY = stool ? 0.64 : 0.46;
    const hsh = hashId(it.id || it.label);
    const skin = SKINS[hsh % SKINS.length];
    const hairC = HAIRS[(hsh >> 3) % HAIRS.length];
    const longHair = (hsh >> 5) % 3 === 0;
    const cloth = V.clothes === 'part' ? vivid(partColor) : '#17181c';
    const pants = V.clothes === 'part' ? '#1d2129' : '#141417';
    const head = [];
    if (!standing) {
      if (bench) {
        box(g, 0.78, 0.07, 0.36, '#1d1d20', 0, 0.49, -0.08, { roughness: 0.4 });
        [[-0.34, -0.22], [0.34, -0.22], [-0.34, 0.06], [0.34, 0.06]].forEach(p => box(g, 0.04, 0.46, 0.04, '#1d1d20', p[0], 0.23, p[1]));
      } else if (stool) {
        cyl(g, 0.17, 0.17, 0.06, '#222', 0, seatY, -0.05);
        [0, 2.1, 4.2].forEach(a => tube(g, [Math.sin(a) * 0.05, seatY, -0.05 + Math.cos(a) * 0.05], [Math.sin(a) * 0.22, 0, -0.05 + Math.cos(a) * 0.22], 0.012, '#555', METAL));
      } else {
        // オーケストラ椅子（黒い座面・背もたれ・金属の脚）
        box(g, 0.45, 0.06, 0.44, '#1c1d22', 0, seatY, -0.05, { roughness: 0.7 });
        const back = box(g, 0.43, 0.36, 0.05, '#1c1d22', 0, seatY + 0.3, -0.27, { roughness: 0.7 });
        back.rotation.x = -0.12;
        [[-0.19, -0.24], [0.19, -0.24], [-0.19, 0.14], [0.19, 0.14]].forEach(p => cyl(g, 0.012, 0.012, seatY, '#8c9096', p[0], seatY / 2, p[1], METAL, 8));
        [-0.19, 0.19].forEach(xx => tube(g, [xx, seatY, -0.24], [xx, seatY + 0.5, -0.29], 0.012, '#8c9096', METAL));
      }
      // 太もも・すね・くつ
      [-0.1, 0.1].forEach(xx => {
        tube(g, [xx, seatY + 0.09, -0.08], [xx * 1.2, seatY + 0.08, 0.3], 0.075, pants, { roughness: 0.85 });
        tube(g, [xx * 1.2, seatY + 0.08, 0.3], [xx * 1.25, 0.06, 0.34], 0.058, pants, { roughness: 0.85 });
        sph(g, 0.075, pants, xx * 1.2, seatY + 0.08, 0.3, { roughness: 0.85 });
        box(g, 0.1, 0.06, 0.24, '#0d0d0f', xx * 1.25, 0.03, 0.4, { roughness: 0.35 });
      });
    } else {
      [-0.1, 0.1].forEach(xx => {
        tube(g, [xx, 0.9, 0], [xx, 0.06, 0.02], 0.07, pants, { roughness: 0.85 }, 0.06);
        box(g, 0.1, 0.06, 0.26, '#0d0d0f', xx, 0.03, 0.08, { roughness: 0.35 });
      });
    }
    const hipY = standing ? 0.92 : seatY + 0.14;
    const torsoH = 0.55;
    // 胴体（上がやや広い）
    // 上着の形（腰から肩へ広がる）
    const prof = [[0.001, 0], [0.16, 0], [0.175, 0.07], [0.165, 0.22], [0.185, 0.4], [0.2, 0.48], [0.17, 0.54], [0.09, 0.575], [0.001, 0.58]]
      .map(p => new T.Vector2(p[0], p[1] * torsoH / 0.58));
    const torso = mesh(new T.LatheGeometry(prof, 28), cloth, { roughness: 0.82 });
    torso.position.set(0, hipY, -0.03);
    torso.scale.set(1, 1, 0.6);
    g.add(torso);
    sph(g, 0.085, cloth, -0.175, hipY + torsoH - 0.06, -0.03, { roughness: 0.82 });
    sph(g, 0.085, cloth, 0.175, hipY + torsoH - 0.06, -0.03, { roughness: 0.82 });
    // 白いシャツの胸元と蝶ネクタイ
    const shirt = new T.Mesh(new T.CircleGeometry(0.075, 3), mat('#f4f4f2', { roughness: 0.9 }));
    shirt.position.set(0, hipY + torsoH - 0.1, 0.085);
    shirt.rotation.z = -Math.PI / 2;
    shirt.scale.set(1.3, 0.8, 1);
    g.add(shirt);
    box(g, 0.07, 0.022, 0.02, '#0b0b0c', 0, hipY + torsoH - 0.03, 0.092);
    // えり（白）
    const collar = cyl(g, 0.065, 0.07, 0.05, V.clothes === 'part' ? '#eeeeee' : '#f2f2f2', 0, hipY + torsoH + 0.005, -0.01, { roughness: 0.9 });
    void collar;
    cyl(g, 0.05, 0.055, 0.1, skin, 0, hipY + torsoH + 0.05, -0.01);
    const neckY = hipY + torsoH;
    const headY = neckY + 0.17;
    const hd = sph(g, 0.1, skin, 0, headY, 0.005);
    hd.scale.set(0.92, 1.08, 1);
    // 耳・鼻
    [-1, 1].forEach(sx => { const e = sph(g, 0.024, skin, sx * 0.092, headY - 0.005, -0.005); e.scale.set(0.5, 1, 0.8); head.push(e); });
    head.push(sph(g, 0.016, skin, 0, headY - 0.015, 0.1));
    head.push(hd);
    const hair = sph(g, 0.108, hairC, 0, headY + 0.035, -0.022, { roughness: 0.9 });
    hair.scale.set(0.98, 0.9, 1.02);
    head.push(hair);
    if (longHair) head.push(box(g, 0.2, 0.22, 0.08, hairC, 0, headY - 0.07, -0.08, { roughness: 0.9 }));
    const shL = [0.19, neckY - 0.06, -0.02], shR = [-0.19, neckY - 0.06, -0.02];
    const my = headY - 0.05, mouth = [0, my, 0.1];
    // 楽器と手の位置
    let hands = [[-0.12, hipY + 0.05, 0.25], [0.12, hipY + 0.05, 0.25]];
    switch (kind) {
      case 'voice': {
        // 歌う人：胸の前で楽譜のファイル（黒い表紙）を開いて持つ
        const fy = neckY - 0.22;
        box(g, 0.3, 0.2, 0.012, 0x1f2328, 0, fy, 0.24, { roughness: 0.6 });
        hands = [[-0.13, fy - 0.06, 0.23], [0.13, fy - 0.06, 0.23]];
        break;
      }
      case 'tp': {
        tube(g, mouth, [0, my - 0.07, 0.44], 0.02, GOLD, METAL);
        box(g, 0.05, 0.09, 0.08, GOLD, 0, my - 0.1, 0.24, METAL);
        bellCone(g, [0, my - 0.08, 0.6], [0, -0.12, 1], 0.062, 0.16, GOLD);
        hands = [[-0.02, my - 0.1, 0.24], [0.04, my - 0.12, 0.2]];
        break;
      }
      case 'tb': case 'btb': {
        tube(g, mouth, [0.0, my - 0.16, 0.95], 0.01, SILVER, METAL);
        tube(g, [0.05, my - 0.01, 0.1], [0.05, my - 0.17, 0.95], 0.01, SILVER, METAL);
        tube(g, [0.0, my - 0.16, 0.95], [0.05, my - 0.17, 0.95], 0.01, SILVER, METAL);
        tube(g, [0.0, my - 0.02, 0.1], [0.14, my - 0.02, 0.1], 0.012, GOLD, METAL);
        tube(g, [0.14, my - 0.02, 0.1], [0.15, my - 0.07, 0.42], 0.014, GOLD, METAL);
        bellCone(g, [0.15, my - 0.08, 0.6], [0, -0.1, 1], kind === 'btb' ? 0.125 : 0.108, 0.3, GOLD);
        hands = [[0.025, my - 0.12, 0.58], [0.1, my - 0.05, 0.18]];
        break;
      }
      case 'hr': {
        const tor = mesh(new T.TorusGeometry(0.13, 0.022, 10, 32), GOLD, METAL);
        tor.position.set(-0.08, my - 0.18, 0.2); tor.rotation.y = Math.PI / 2.3; g.add(tor);
        tube(g, mouth, [-0.06, my - 0.1, 0.2], 0.008, GOLD, METAL);
        bellCone(g, [-0.3, hipY + 0.1, 0.02], [-0.25, -0.45, -1], 0.155, 0.26, GOLD);
        hands = [[-0.28, hipY + 0.15, 0.06], [-0.02, my - 0.2, 0.24]];
        break;
      }
      case 'tuba': {
        const body = cyl(g, 0.16, 0.2, 0.72, GOLD, 0.07, hipY + 0.34, 0.2, METAL, 24); void body;
        bellCone(g, [0.2, headY + 0.3, 0.12], [0.12, 1, -0.05], 0.22, 0.34, GOLD);
        tube(g, mouth, [0.05, my - 0.1, 0.2], 0.012, GOLD, METAL);
        hands = [[-0.05, hipY + 0.3, 0.33], [0.2, hipY + 0.35, 0.28]];
        break;
      }
      case 'euph': {
        cyl(g, 0.1, 0.13, 0.5, GOLD, 0.06, hipY + 0.28, 0.2, METAL, 20);
        bellCone(g, [0.18, headY + 0.1, 0.14], [0.15, 1, 0], 0.15, 0.22, GOLD);
        tube(g, mouth, [0.04, my - 0.1, 0.2], 0.01, GOLD, METAL);
        hands = [[-0.02, hipY + 0.3, 0.3], [0.16, hipY + 0.32, 0.26]];
        break;
      }
      case 'fl': case 'picc': {
        const L = kind === 'fl' ? 0.66 : 0.33;
        tube(g, [0.06, my + 0.01, 0.08], [0.06 - L, my - 0.04, 0.15], 0.011, SILVER, METAL);
        hands = [[0.02, my - 0.04, 0.12], [-L * 0.55, my - 0.05, 0.15]];
        break;
      }
      case 'ob': case 'cl': case 'eh': case 'ssx': {
        const c = kind === 'ssx' ? GOLD : kind === 'eh' ? '#3d2a1c' : BLACKW;
        const mo = kind === 'ssx' ? METAL : { roughness: 0.3 };
        tube(g, mouth, [0, my - 0.5, 0.4], 0.016, c, mo, 0.02);
        bellCone(g, [0, my - 0.55, 0.44], [0, -0.8, 0.6], 0.036, 0.07, c);
        hands = [[0, my - 0.17, 0.22], [0, my - 0.36, 0.32]];
        break;
      }
      case 'bcl': {
        tube(g, mouth, [0, 0.36, 0.3], 0.024, BLACKW, { roughness: 0.3 });
        bellCone(g, [0.02, 0.3, 0.4], [0, 0.4, 1], 0.07, 0.12, SILVER);
        hands = [[0, my - 0.3, 0.22], [0, 0.55, 0.28]];
        break;
      }
      case 'asx': case 'tsx': case 'bsx': {
        const r = kind === 'bsx' ? 0.065 : kind === 'tsx' ? 0.048 : 0.04;
        const len = kind === 'bsx' ? 0.72 : kind === 'tsx' ? 0.6 : 0.48;
        tube(g, mouth, [-0.07, my - 0.12, 0.2], 0.011, GOLD, METAL);
        tube(g, [-0.08, my - 0.12, 0.2], [-0.13, my - 0.12 - len, 0.24], r, GOLD, METAL, r * 0.7);
        const br = kind === 'bsx' ? 0.085 : kind === 'tsx' ? 0.073 : 0.063; // ベルの直径 17／14.6／12.5cm
        bellCone(g, [-0.13, my - 0.05 - len * 0.62, 0.32], [0, 0.6, 0.8], br, 0.14, GOLD);
        hands = [[-0.09, my - 0.2, 0.22], [-0.12, my - 0.12 - len * 0.7, 0.27]];
        break;
      }
      case 'fg': {
        tube(g, [0.12, hipY + 0.05, 0.2], [-0.16, headY + 0.45, 0.0], 0.034, WOOD, { roughness: 0.35 });
        tube(g, mouth, [-0.02, my - 0.08, 0.14], 0.005, SILVER, METAL);
        hands = [[0.05, hipY + 0.2, 0.18], [-0.07, my - 0.12, 0.12]];
        break;
      }
      case 'vn': case 'va': {
        const s = kind === 'va' ? 1.12 : 1;
        // 胴 35.5×20.5cm（ビオラ 40×23）、厚み約4cm。左肩にのせて左前へ。ネック・渦巻き、弓 75cm
        const b = fiddleBody(0.355 * s, 0.205 * s, 0.035, WOOD);
        b.rotation.x = Math.PI / 2; // 長い向きを前へ、表板を上へ
        const pv = new T.Group(); pv.add(b);
        pv.rotation.order = 'YXZ'; pv.rotation.y = 0.55; pv.rotation.z = -0.35; // 左前へ向け、弦側へ少し傾ける
        pv.position.set(0.14, neckY - 0.01, 0.17); g.add(pv);
        const dir = new T.Vector3(Math.sin(0.55), 0, Math.cos(0.55));
        const nk0 = new T.Vector3(0.14, neckY, 0.17).addScaledVector(dir, 0.17 * s), nk1 = nk0.clone().addScaledVector(dir, 0.13 * s);
        tube(g, nk0.toArray(), nk1.toArray(), 0.011, '#1a120c');
        sph(g, 0.018, WOOD, nk1.x, nk1.y, nk1.z);
        tube(g, [-0.34, neckY - 0.03, 0.24], [0.38, neckY + 0.04, 0.04], 0.004, '#c9b58a');
        hands = [[0.28 * s, neckY - 0.02, 0.33 * s], [-0.18, neckY - 0.03, 0.2]];
        break;
      }
      case 'vc': {
        // 胴 76×44cm、厚み約12cm。少し手前に傾ける
        const b = fiddleBody(0.76, 0.44, 0.12, WOOD); b.position.set(0, 0.62, 0.36); b.rotation.x = -0.25; g.add(b);
        tube(g, [0, 1.0, 0.28], [0.02, 1.35, 0.18], 0.02, '#1a1a1a');
        tube(g, [0, 0.26, 0.42], [0, 0.0, 0.5], 0.006, '#888', METAL);
        tube(g, [-0.36, 0.72, 0.36], [0.24, 0.66, 0.4], 0.004, '#c9b58a');
        hands = [[0.05, 1.1, 0.24], [-0.22, 0.72, 0.38]];
        break;
      }
      case 'cb': {
        // 胴 112×68cm、厚み約20cm
        const b = fiddleBody(1.12, 0.68, 0.18, WOOD); b.position.set(0.08, 0.72, 0.38); b.rotation.x = -0.12; g.add(b);
        tube(g, [0.08, 1.27, 0.3], [0.1, 1.85, 0.24], 0.025, '#1a1a1a');
        hands = [[0.1, 1.45, 0.28], [-0.2, 0.75, 0.42]];
        break;
      }
      case 'gt': case 'bass': {
        box(g, 0.34, 0.08, 0.26, kind === 'bass' ? '#6b2a2a' : WOOD, -0.08, hipY + 0.2, 0.16, { roughness: 0.3 });
        tube(g, [0.05, hipY + 0.22, 0.16], [0.5, hipY + 0.35, 0.14], 0.02, WOOD);
        hands = [[-0.08, hipY + 0.22, 0.24], [0.35, hipY + 0.32, 0.18]];
        break;
      }
      case 'perc': case 'drs': {
        [-1, 1].forEach(s => {
          tube(g, [s * 0.12, hipY + 0.3, 0.3], [s * 0.15, hipY + 0.22, 0.62], 0.006, '#c9a36b');
          sph(g, 0.022, '#e8e0d0', s * 0.15, hipY + 0.22, 0.62);
        });
        hands = [[-0.12, hipY + 0.3, 0.3], [0.12, hipY + 0.3, 0.3]];
        break;
      }
      case 'pf': hands = [[-0.12, 0.74, 0.34], [0.12, 0.74, 0.34]]; break;
      case 'mc': hands = [[-0.2, hipY + 0.02, 0.06], [0.2, hipY + 0.02, 0.06]]; break; // 司会：手は体の横
      default: break;
    }
    // 右手は -x 側、左手は +x 側
    const hr = hands[0][0] <= hands[1][0] ? hands[0] : hands[1];
    const hl = hands[0][0] <= hands[1][0] ? hands[1] : hands[0];
    arm(g, shR, hr, cloth, skin);
    arm(g, shL, hl, cloth, skin);
    // 譜面台（楽譜つき）
    const noStand = ['perc', 'drs', 'pf', 'hp', 'voice', 'mc'].includes(kind);
    if (!noStand && V.showStands && !shared) {
      const sz = kind === 'tb' || kind === 'btb' ? [-0.32, 0.6] : kind === 'vc' ? [0, 0.72] : kind === 'cb' ? [-0.14, 0.78] : [0, 0.64];
      makeStand(g, sz[0], sz[1]);
    }
    g.add(blobShadow(0.9, 0.35));
    return { g, head };
  }

  // 平台の高さ：ひな壇(hina)は it.hgt。昔の平台は前から 21, 42, 64cm…
  function riserHeights(items) {
    const map = new Map();
    const rs = items.filter(it => it.type === 'riser' || it.type === 'riser46');
    const ys = [...new Set(rs.map(r => Math.round(r.y / 30)))].sort((a, b) => b - a);
    const std = [21.2, 42.4, 63.6, 84.8];
    rs.forEach(r => map.set(r, (r.hgt || std[Math.min(3, ys.indexOf(Math.round(r.y / 30)))]) / 100));
    items.filter(it => it.type === 'hina').forEach(h => map.set(h, (h.hgt || 21.2) / 100));
    return map;
  }
  function heightAt(x, y, rh) {
    let h = 0;
    rh.forEach((hh, r) => {
      if (r.type === 'hina' && SS.hinaArc(r)) { if (SS.hinaContains(r, x, y, 2)) h = Math.max(h, hh); return; }
      const a = -(r.rot || 0) * Math.PI / 180;
      const dx = x - r.x, dy = y - r.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= (r.w || 182) / 2 + 2 && Math.abs(ly) <= (r.h || 91) / 2 + 2) h = Math.max(h, hh);
    });
    return h;
  }

  // ペダルハープ（高さ約1.8m）。+z が奏者側、-z に支柱
  function makeHarp(g, w, d) {
    const sz = d / 0.98, sx = w / 0.55;
    const WOODH = { roughness: 0.35 };
    box(g, 0.5 * sx, 0.12, 0.56 * sz, '#8a5a2a', 0, 0.06, -0.15 * sz, WOODH);
    for (let i = 0; i < 7; i++) box(g, 0.025, 0.012, 0.07, '#d4ad4e', (-0.21 + i * 0.07) * sx, 0.03, 0.16 * sz, METAL);
    // 支柱と飾り
    cyl(g, 0.034, 0.04, 1.6, '#d6b25e', 0, 0.92, -0.4 * sz, { metalness: 0.6, roughness: 0.3 });
    cyl(g, 0.075, 0.05, 0.14, '#d6b25e', 0, 1.78, -0.4 * sz, { metalness: 0.6, roughness: 0.3 });
    // 響板（下が太く、上が細い。奏者の肩へ傾く）
    const sb = tube(g, [0, 0.16, -0.06 * sz], [0, 1.45, 0.43 * sz], 0.17, '#c9954e', WOODH, 0.055);
    sb.scale.x = 0.8;
    // ネック（S字）
    const curve = new T.CatmullRomCurve3([[0, 1.45, 0.43], [0, 1.64, 0.27], [0, 1.56, 0.06], [0, 1.7, -0.2], [0, 1.76, -0.4]].map(p => new T.Vector3(p[0], p[1], p[2] * sz)));
    const neck = new T.Mesh(new T.TubeGeometry(curve, 40, 0.035, 10, false), mat('#b98542', WOODH));
    neck.castShadow = true; g.add(neck);
    // 弦（響板の中心から、ネックまで）
    const pos = [];
    const samples = curve.getPoints(80);
    for (let i = 0; i < 24; i++) {
      const t = 0.05 + (i / 23) * 0.88;
      const y0 = 0.16 + (1.45 - 0.16) * t, z0 = (-0.06 + 0.49 * t) * sz;
      let best = samples[0];
      samples.forEach(p => { if (Math.abs(p.z - z0) < Math.abs(best.z - z0)) best = p; });
      pos.push(0, y0, z0, 0, best.y - 0.02, z0);
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.add(new T.LineSegments(sg, new T.LineBasicMaterial({ color: '#f0e2c0' })));
  }

  // グランドピアノ（ヤマハC3X・CFXの寸法を参考に。手前＝+z が鍵盤、左が低音側）
  function makeGrandPiano(g, w, d) {
    const hw = w / 2, hd = d / 2;
    const kb = Math.min(0.22, d * 0.09);          // 鍵盤の奥行
    const top = 1.0, rimH = 0.3;                  // ふたの高さ・側板の高さ
    const PIANO = { roughness: 0.1, metalness: 0.15 };
    const toXZ = (nx, ny, inset) => {
      const m = inset || 0;
      return [-hw + (m + nx * (1 - 2 * m)) * w, hd - kb - (m * 0.6 + ny * (1 - 1.6 * m)) * (d - kb)];
    };
    const shapeOf = inset => {
      const sh = new T.Shape();
      SS.pianoOutline().forEach(([nx, ny], i) => { const [x, z] = toXZ(nx, ny, inset); if (i) sh.lineTo(x, z); else sh.moveTo(x, z); });
      sh.closePath();
      return sh;
    };
    const flat = (sh, depth, color, opt, y) => {
      const m = mesh(new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 }), color, opt);
      m.rotation.x = Math.PI / 2; m.position.y = y; g.add(m); return m;
    };
    // 側板（中が見えるように、内側をくり抜く）
    const rim = shapeOf(0);
    rim.holes.push(new T.Path(shapeOf(0.035).getPoints()));
    flat(rim, rimH, '#0b0b0d', PIANO, top);
    // 底板・響板・金色のフレーム・弦
    flat(shapeOf(0), 0.03, '#0b0b0d', PIANO, top - rimH + 0.03);
    flat(shapeOf(0.035), 0.01, '#d9b77e', { roughness: 0.55 }, top - 0.12);
    flat(shapeOf(0.08), 0.015, '#c9a24a', { metalness: 0.75, roughness: 0.3 }, top - 0.085);
    for (let i = 0; i < 18; i++) {
      const nx = 0.12 + i * 0.045, len = (d - kb) * (0.9 - i * 0.034);
      box(g, 0.004, 0.004, Math.max(0.3, len), '#e8e4da', -hw + nx * w, top - 0.07, hd - kb - 0.06 - Math.max(0.3, len) / 2, METAL);
    }
    // 鍵盤まわり：鍵盤の台・白鍵・黒鍵・左右の拍子木・鍵盤のふた（開いた状態で奥に）
    box(g, w, 0.09, kb + 0.04, '#0b0b0d', 0, top - rimH + 0.02, hd - kb / 2 + 0.02, PIANO);
    const kw = w - 0.14;
    box(g, kw, 0.022, kb * 0.8, '#f7f5ee', 0, top - rimH + 0.075, hd - kb * 0.45, { roughness: 0.3 });
    const nWhite = 52, ww = kw / nWhite;
    for (let i = 0; i < nWhite - 1; i++) {
      const n = (i + 5) % 7; // A0から数えて、黒鍵があるのは C,D,F,G,A の右
      if (n === 2 || n === 6) continue;
      box(g, ww * 0.55, 0.018, kb * 0.48, '#111113', -kw / 2 + ww * (i + 1), top - rimH + 0.095, hd - kb * 0.6, { roughness: 0.25 });
    }
    [-1, 1].forEach(sx => box(g, 0.07, 0.1, kb + 0.04, '#0b0b0d', sx * (hw - 0.035), top - rimH + 0.08, hd - kb / 2 + 0.02, PIANO));
    box(g, kw, 0.07, 0.03, '#0b0b0d', 0, top - rimH + 0.11, hd - kb - 0.01, PIANO);
    // 譜面台
    const desk = box(g, w * 0.55, 0.3, 0.018, '#0b0b0d', 0, top + 0.15, hd - kb - 0.2, PIANO);
    desk.rotation.x = -0.25;
    // 脚（3本・先に金色のキャスター）
    [[0.06, 0.04], [0.94, 0.04], [0.24, 0.9]].forEach(([nx, ny]) => {
      const [x, z] = toXZ(nx, ny, 0.02);
      cyl(g, 0.07, 0.05, top - rimH, '#0b0b0d', x, (top - rimH) / 2, z, PIANO, 16);
      sph(g, 0.035, '#c9a24a', x, 0.035, z, METAL);
    });
    // ペダル（リラ）
    const lz = hd - kb - 0.2;
    [-0.09, 0.09].forEach(x => box(g, 0.035, top - rimH - 0.1, 0.04, '#0b0b0d', x, (top - rimH) / 2 + 0.03, lz, PIANO));
    box(g, 0.3, 0.06, 0.12, '#0b0b0d', 0, 0.09, lz, PIANO);
    [-0.07, 0, 0.07].forEach(x => box(g, 0.035, 0.012, 0.12, '#d4ad4e', x, 0.1, lz + 0.1, METAL));
    // 大屋根（低音側のちょうつがいで開き、突上棒で支える）
    const lid = new T.Mesh(new T.ExtrudeGeometry(shapeOf(0), { depth: 0.022, bevelEnabled: false }), mat('#0b0b0d', PIANO));
    lid.castShadow = true;
    lid.rotation.x = Math.PI / 2;
    lid.position.set(hw, 0.022, 0);
    const pivot = new T.Group();
    pivot.position.set(-hw, top + 0.001, 0);
    pivot.add(lid);
    const open = 0.5;
    pivot.rotation.z = open;
    g.add(pivot);
    const [px, pz] = toXZ(0.72, 0.42, 0.04);
    const stickLen = Math.tan(open) * (px + hw);
    tube(g, [px, top, pz], [px, top + stickLen - 0.01, pz], 0.012, '#0b0b0d', PIANO);
  }

  // ひな壇（平台＋足＋まわりの黒い幕）
  function makeRiser(g, w, d, hgt, panelD, panelW) {
    panelW = panelW || 1.82;
    const top = 0.121;
    const woodTex = planksTexture('#c89a62', 64, false);
    const topMat = new T.MeshStandardMaterial({ map: woodTex, roughness: 0.55 });
    woodTex.repeat.set(w / 1.2, d / 1.2);
    const slab = new T.Mesh(new T.BoxGeometry(w, top, d), [mat('#8a6a44'), mat('#8a6a44'), topMat, mat('#6a4f30'), mat('#8a6a44'), mat('#8a6a44')]);
    slab.position.y = hgt - top / 2;
    slab.castShadow = true; slab.receiveShadow = true;
    g.add(slab);
    // 平台のつなぎ目
    for (let x = -w / 2 + panelW; x < w / 2 - 0.05; x += panelW) box(g, 0.006, 0.002, d, '#5a4128', x, hgt + 0.001, 0);
    for (let z = -d / 2 + panelD; z < d / 2 - 0.05; z += panelD) box(g, w, 0.002, 0.006, '#5a4128', 0, hgt + 0.001, z);
    if (hgt > 0.13) {
      // 足（箱馬）は見えないよう幕で囲う
      const skirt = mat('#0e0e10', { roughness: 0.95 });
      const hs = hgt - top;
      [[0, d / 2 - 0.005, w, 0.01], [0, -d / 2 + 0.005, w, 0.01]].forEach(p => { const m = new T.Mesh(new T.BoxGeometry(p[2], hs, p[3]), skirt); m.position.set(p[0], hs / 2, p[1]); m.receiveShadow = true; g.add(m); });
      [[-w / 2 + 0.005], [w / 2 - 0.005]].forEach(p => { const m = new T.Mesh(new T.BoxGeometry(0.01, hs, d), skirt); m.position.set(p[0], hs / 2, 0); g.add(m); });
    }
  }

  // 楽器・台など
  function makeItem(it, color, riserH) {
    const g = new T.Group();
    const c = SS.CATALOG[it.type] || SS.CATALOG.box;
    const w = (it.w || c.w || 80) / 100, d = (it.h || c.h || 60) / 100;
    switch (it.type) {
      case 'podium': {
        makeRiser(g, w, d, 0.2, d);
        // 指揮者用の譜面台
        cyl(g, 0.02, 0.02, 0.9, '#222', 0, 0.65, -d / 2 + 0.12);
        const desk = box(g, 0.65, 0.45, 0.015, '#1a1a1d', 0, 1.25, -d / 2 + 0.14); desk.rotation.x = -0.35;
        box(g, 0.58, 0.4, 0.005, '#f4f1e8', 0, 1.25, -d / 2 + 0.152).rotation.x = -0.35;
        break;
      }
      case 'riser': case 'riser46': makeRiser(g, w, d, riserH, (it.type === 'riser46' ? 1.212 : 0.909)); break;
      case 'hina':
        if (SS.hinaArc(it)) {
          // 弧のひな壇：平台を1枚ずつ扇に並べる
          SS.hinaPanels(it).forEach(q => {
            const pg = new T.Group();
            makeRiser(pg, q.w / 100, q.d / 100, riserH, q.d / 100, q.w / 100);
            pg.position.set(q.x / 100, 0, q.y / 100);
            pg.rotation.y = -(q.rot * Math.PI) / 180;
            g.add(pg);
          });
        } else makeRiser(g, w, d, riserH, SS.panelSize(it).d / 100, SS.panelSize(it).w / 100);
        break;
      case 'mc': {
        // 司会：立って話す人と、前にマイクスタンド
        const p = makePlayer({ id: it.id, label: it.label || '司会' }, '#8c96a8', false, 'mc');
        p.g.position.z = -0.08;
        g.add(p.g);
        const mz = d / 2 - 0.12;
        cyl(g, 0.012, 0.012, 1.42, '#222', 0, 0.71, mz, METAL, 8);
        [0, 2.1, 4.2].forEach(a => tube(g, [0, 0.02, mz], [Math.sin(a) * 0.2, 0.0, mz + Math.cos(a) * 0.2], 0.01, '#222'));
        tube(g, [0, 1.42, mz], [0, 1.5, mz - 0.14], 0.01, '#222', METAL);
        sph(g, 0.028, '#555', 0, 1.51, mz - 0.16, METAL);
        break;
      }
      case 'door': {
        // 出入り口：壁の側（-z）に両開きの扉と枠
        const z = -d / 2 + 0.05;
        box(g, w + 0.16, 2.5, 0.12, '#2a1a10', 0, 1.25, z, { roughness: 0.5 });
        [-1, 1].forEach(sx => { box(g, w / 2 - 0.02, 2.36, 0.14, '#6a4a30', sx * w / 4, 1.18, z, { roughness: 0.45 }); box(g, 0.03, 0.3, 0.16, '#d8d0c0', sx * 0.06, 1.1, z, METAL); });
        break;
      }
      case 'runway': {
        // 花道：舞台と同じ高さ（客席の床から1m）の板張りの床
        const tex = planksTexture('#c08d55', 48, true); tex.repeat.set(w / 2.2, d / 2.2);
        const m = new T.Mesh(new T.BoxGeometry(w, 1.0, d), [mat('#141414'), mat('#141414'), new T.MeshPhysicalMaterial({ map: tex, roughness: 0.4, clearcoat: 0.4 }), mat('#141414'), mat('#141414'), mat('#141414')]);
        m.position.set(0, -0.5 + 0.003, 0); m.receiveShadow = true; g.add(m);
        break;
      }
      case 'cable': case 'outlet': case 'tap': break; // 床の線・コンセントは3Dでは描かない
      case 'micTall': // 録音用マイク：3本脚の高いスタンド
        for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3; tube(g, [0, 0.5, 0], [Math.sin(a) * w / 2, 0.01, Math.cos(a) * w / 2], 0.012, '#333', METAL); }
        cyl(g, 0.012, 0.012, 3.0, '#333', 0, 1.5, 0, METAL);
        box(g, 0.05, 0.16, 0.05, '#222', 0, 3.05, 0);
        break;
      case 'monitor': // くさび形のモニタースピーカー
        box(g, w, 0.3, d, '#2a2d33', 0, 0.15, 0).rotation.x = -0.35;
        break;
      case 'stairs': // 上がり段：奥（ひな壇の側）へ3段上がる
        for (let i = 0; i < 3; i++) { const h = (i + 1) * 0.14; box(g, w, h, d / 3, '#d8c7a4', 0, h / 2, d / 2 - d / 6 - (i * d) / 3); }
        break;
      case 'timp32': case 'timp29': case 'timp26': case 'timp23': case 'timp': {
        const r = Math.min(w, d) / 2 * 0.9;
        const bowl = mesh(new T.SphereGeometry(r, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#b87333', METAL);
        bowl.scale.set(1, 0.85, 1); bowl.position.y = 0.72; g.add(bowl);
        cyl(g, r * 1.04, r * 1.04, 0.05, '#9a9da3', 0, 0.72, 0, METAL, 32);
        cyl(g, r, r, 0.012, '#f3ead7', 0, 0.75, 0, { roughness: 0.85 }, 32);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; tube(g, [Math.sin(a) * r * 1.02, 0.74, Math.cos(a) * r * 1.02], [Math.sin(a) * r * 0.9, 0.5, Math.cos(a) * r * 0.9], 0.008, '#b0b3b8', METAL); }
        [0, 2.1, 4.2].forEach(a => tube(g, [Math.sin(a) * r * 0.5, 0.35, Math.cos(a) * r * 0.5], [Math.sin(a) * r * 0.85, 0.02, Math.cos(a) * r * 0.85], 0.02, '#555', METAL));
        box(g, 0.12, 0.05, 0.25, '#333', 0, 0.03, -r * 0.9); // ペダルは奏者の側
        break;
      }
      case 'marimba': case 'marimba43': case 'xylo': case 'vib': case 'glock': {
        // 鍵盤（2列）と共鳴管
        const n = Math.max(20, Math.round(w / 0.045));
        const metalBars = it.type === 'vib' || it.type === 'glock';
        const barMat = mat(metalBars ? '#c8ccd2' : '#7a3a1c', metalBars ? METAL : { roughness: 0.45 });
        const barH = 0.9;
        const low = it.type.startsWith('marimba') ? 1 : 0.8;
        const geo = new T.BoxGeometry(1, 1, 1);
        const inst = new T.InstancedMesh(geo, barMat, n * 2);
        const m4 = new T.Matrix4();
        let k = 0;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          // 奏者から見て左（+x）が低音で長い鍵盤
          const len = (d * 0.42) * (0.55 + 0.45 * (low * t + (1 - low) * 0.5));
          const x = -w / 2 + 0.04 + t * (w - 0.08);
          m4.compose(new T.Vector3(x, barH, -d * 0.22), new T.Quaternion(), new T.Vector3(w / n * 0.8, 0.022, len)); inst.setMatrixAt(k++, m4);
          m4.compose(new T.Vector3(x + w / n * 0.5, barH + 0.02, d * 0.22), new T.Quaternion(), new T.Vector3(w / n * 0.8, 0.022, len * 0.9)); inst.setMatrixAt(k++, m4);
        }
        inst.castShadow = true;
        g.add(inst);
        box(g, w, 0.04, d * 0.95, '#3a2a1c', 0, barH - 0.04, 0);
        if (it.type !== 'glock') for (let i = 0; i < n; i += 2) { const t = i / (n - 1); const L = 0.1 + 0.55 * t * (it.type.startsWith('marimba') ? 1 : 0.4); cyl(g, 0.02, 0.02, L, '#a8a09a', -w / 2 + 0.04 + t * (w - 0.08), barH - 0.06 - L / 2, 0, METAL, 8); }
        [-1, 1].forEach(sx => { box(g, 0.05, barH, 0.05, '#333', sx * (w / 2 - 0.06), barH / 2, -d * 0.3); box(g, 0.05, barH, 0.05, '#333', sx * (w / 2 - 0.06), barH / 2, d * 0.3); });
        break;
      }
      case 'keyboard': box(g, w, 0.08, d, '#222', 0, 0.85, 0); box(g, w * 0.9, 0.02, d * 0.5, '#f5f5f5', 0, 0.9, d * 0.18); [-1, 1].forEach(s => tube(g, [s * w * 0.35, 0.83, 0], [s * w * 0.3, 0, 0], 0.015, '#444')); break;
      case 'chimes': {
        box(g, w, 0.05, 0.05, '#555', 0, 1.9, 0, METAL);
        for (let i = 0; i < 18; i++) cyl(g, 0.019, 0.019, 1.3 - i * 0.03, '#e2d8b8', -w / 2 + 0.08 + i * (w - 0.16) / 17, 1.85 - (1.3 - i * 0.03) / 2, i % 2 ? 0.06 : -0.06, METAL, 12);
        [-1, 1].forEach(s => box(g, 0.05, 1.9, 0.05, '#555', s * w / 2, 0.95, 0, METAL));
        box(g, w, 0.04, d, '#444', 0, 0.05, 0);
        break;
      }
      case 'bd': {
        // 2D と同じ向き：胴の直径は横（x）、ヘッドは前後（奏者の方と、その反対）
        const R = Math.min(w * 0.455, 0.46), L = Math.min(d * 0.68, 0.45), cy = R + 0.25;
        const m = cyl(g, R, R, L, '#efeae0', 0, cy, 0, { roughness: 0.6 }, 36); m.rotation.x = Math.PI / 2;
        [-1, 1].forEach(sz => { const r = cyl(g, R + 0.01, R + 0.01, 0.04, '#6b3a1c', 0, cy, sz * (L / 2 - 0.02), undefined, 36); r.rotation.x = Math.PI / 2; const hd = cyl(g, R - 0.02, R - 0.02, 0.005, '#f6f1e4', 0, cy, sz * (L / 2 + 0.001), { roughness: 0.8 }, 36); hd.rotation.x = Math.PI / 2; });
        // 台（ゆりかご）と脚
        tube(g, [-R * 0.7, 0.02, 0], [-R * 0.5, cy - R * 0.8, 0], 0.025, '#444', METAL); tube(g, [R * 0.7, 0.02, 0], [R * 0.5, cy - R * 0.8, 0], 0.025, '#444', METAL);
        box(g, R * 1.6, 0.04, 0.05, '#444', 0, 0.02, -d * 0.35); box(g, R * 1.6, 0.04, 0.05, '#444', 0, 0.02, d * 0.35);
        [-1, 1].forEach(sx => box(g, 0.05, 0.04, d * 0.7, '#444', sx * R * 0.75, 0.02, 0));
        break;
      }
      case 'sd': cyl(g, w / 2, w / 2, 0.14, '#ddd', 0, 0.7, 0, METAL, 28); cyl(g, w / 2 - 0.005, w / 2 - 0.005, 0.005, '#f8f8f5', 0, 0.775, 0); [0, 2.1, 4.2].forEach(a => tube(g, [0, 0.6, 0], [Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25], 0.01, '#666', METAL)); break;
      case 'cym': cyl(g, w / 2, 0.02, 0.03, '#e2c35a', 0, 1.02, 0, METAL, 32); cyl(g, 0.012, 0.012, 1.0, '#555', 0, 0.5, 0, METAL); [0, 2.1, 4.2].forEach(a => tube(g, [0, 0.2, 0], [Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25], 0.01, '#666', METAL)); break;
      case 'tam': { const m = cyl(g, Math.min(w * 0.45, 0.6), Math.min(w * 0.45, 0.6), 0.02, '#b08a3a', 0, 1.1, 0, METAL, 36); m.rotation.x = Math.PI / 2; box(g, w, 0.05, 0.05, '#333', 0, 1.62, 0); [-1, 1].forEach(s => box(g, 0.05, 1.62, 0.05, '#333', s * w / 2, 0.81, 0)); break; }
      case 'drums': {
        // 2D の絵と同じ配置（奏者は -z の側に座り、+z＝前を向く）。x・z は 2D の cm を w・d に合わせて縮める
        const kx = w / 1.8, kz = d / 1.5, k = Math.min(kx, kz), P = (x, z) => [x * kx / 100, z * kz / 100];
        const shell = { roughness: 0.3 };
        // バスドラム（ヘッドは前後）
        const [bx, bz] = P(0, 9), bR = 0.28 * k, bL = 0.44 * kz;
        const b = cyl(g, bR, bR, bL, '#8c1d24', bx, bR + 0.02, bz, shell, 28); b.rotation.x = Math.PI / 2;
        [-1, 1].forEach(sz => { const hd = cyl(g, bR - 0.01, bR - 0.01, 0.005, '#f2efe8', bx, bR + 0.02, bz + sz * (bL / 2 + 0.002), { roughness: 0.8 }, 28); hd.rotation.x = Math.PI / 2; });
        // タム2つ（バスドラムの上、奏者の方へ少し傾ける）
        [[-16, -6, 0.14], [16, -6, 0.13]].forEach(([x, z, r]) => { const [px, pz] = P(x, z); const t = cyl(g, r * k, r * k, 0.2, '#8c1d24', px, 0.78, pz, shell, 20); t.rotation.x = -0.35; });
        // フロアタム（奏者の右手側）
        { const [px, pz] = P(-52, -26); cyl(g, 0.21 * k, 0.21 * k, 0.4, '#8c1d24', px, 0.42, pz, shell, 20); cyl(g, 0.2 * k, 0.2 * k, 0.005, '#f2efe8', px, 0.623, pz); [0, 2.1, 4.2].forEach(a => tube(g, [px + Math.sin(a) * 0.2 * k, 0.3, pz + Math.cos(a) * 0.2 * k], [px + Math.sin(a) * 0.24 * k, 0, pz + Math.cos(a) * 0.24 * k], 0.008, '#666', METAL)); }
        // スネア（ひざのあいだ）
        { const [px, pz] = P(6, -44); cyl(g, 0.17 * k, 0.17 * k, 0.14, '#ddd', px, 0.62, pz, METAL, 24); cyl(g, 0.165 * k, 0.165 * k, 0.005, '#f8f8f5', px, 0.693, pz); [0, 2.1, 4.2].forEach(a => tube(g, [px, 0.55, pz], [px + Math.sin(a) * 0.22, 0, pz + Math.cos(a) * 0.22], 0.008, '#666', METAL)); }
        // シンバル：ハイハット（左手側・2枚）、クラッシュ（左の前）、ライド（右の前）
        [[48, -34, 0.18, 0.88, 2], [52, 38, 0.22, 1.35, 1], [-56, 32, 0.25, 1.15, 1]].forEach(([x, z, r, h, n]) => {
          const [px, pz] = P(x, z);
          cyl(g, 0.012, 0.012, h, '#555', px, h / 2, pz, METAL, 8);
          for (let i = 0; i < n; i++) cyl(g, r * k, 0.02, 0.025, '#e2c35a', px, h + i * 0.03, pz, METAL, 28);
          [0, 2.1, 4.2].forEach(a => tube(g, [px, 0.25, pz], [px + Math.sin(a) * 0.25, 0, pz + Math.cos(a) * 0.25], 0.008, '#666', METAL));
        });
        break;
      }
      case 'piano': case 'pianoFull': makeGrandPiano(g, w, d); break;
      case 'upright': box(g, w, 1.25, d, '#0c0c0e', 0, 0.62, 0, { roughness: 0.15 }); box(g, w * 0.9, 0.02, 0.15, '#f7f7f2', 0, 0.75, d / 2 + 0.07); break;
      case 'harp': makeHarp(g, w, d); break;
      case 'amp': box(g, w, 0.5, d, '#1d1d1f', 0, 0.25, 0); box(g, w * 0.85, 0.3, 0.005, '#333', 0, 0.28, d / 2 + 0.003); break;
      case 'mic': cyl(g, 0.01, 0.01, 1.5, '#222', 0, 0.75, 0, METAL); sph(g, 0.03, '#555', 0, 1.52, 0, METAL); [0, 2.1, 4.2].forEach(a => tube(g, [0, 0.02, 0], [Math.sin(a) * 0.25, 0.0, Math.cos(a) * 0.25], 0.01, '#222')); break;
      case 'chair': box(g, 0.45, 0.06, 0.44, '#1c1d22', 0, 0.46, 0); box(g, 0.43, 0.36, 0.05, '#1c1d22', 0, 0.76, -0.2); [[-0.19, -0.2], [0.19, -0.2], [-0.19, 0.18], [0.19, 0.18]].forEach(p => cyl(g, 0.012, 0.012, 0.46, '#8c9096', p[0], 0.23, p[1], METAL, 8)); break;
      case 'stand': case 'cstand': cyl(g, 0.01, 0.01, 0.9, '#222', 0, 0.45, 0); box(g, w, 0.34, 0.012, '#1a1a1d', 0, 1.12, 0).rotation.x = 0.42; break;
      case 'table': box(g, w, 0.04, d, '#1a1a1d', 0, 0.8, 0); box(g, w * 0.95, 0.005, d * 0.9, '#3a2a4a', 0, 0.823, 0); [-1, 1].forEach(sx => [-1, 1].forEach(sz => box(g, 0.035, 0.8, 0.035, '#555', sx * (w / 2 - 0.05), 0.4, sz * (d / 2 - 0.05)))); break;
      case 'circle': cyl(g, w / 2, w / 2, 0.5, color, 0, 0.25, 0); break;
      case 'text': return null;
      default: box(g, w, 0.5, d, color, 0, 0.25, 0);
    }
    return g;
  }

  // パート名の札。遠くからでも読めるよう、画面の上でいつも同じ大きさ（文字の大きさは「小・中・大」から）。
  // 札はパートの色のふち取り、白い太字に黒いふち
  const LABEL_SIZE = { s: 0.025, m: 0.033, l: 0.046 };
  function labelSprite(text, color) {
    const t = String(text).slice(0, 10);
    const cv = document.createElement('canvas'), H = 128, fs = 82;
    const m = cv.getContext('2d');
    m.font = `bold ${fs}px sans-serif`;
    const W = Math.max(H * 1.3, Math.ceil(m.measureText(t).width) + 56);
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const r = 34;
    const round = (x0, y0, x1, y1) => { x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x1, y0, x1, y1, r); x.arcTo(x1, y1, x0, y1, r); x.arcTo(x0, y1, x0, y0, r); x.arcTo(x0, y0, x1, y0, r); x.closePath(); };
    round(4, 4, W - 4, H - 4);
    x.fillStyle = 'rgba(16,20,28,.86)'; x.fill();
    x.lineWidth = 8; x.strokeStyle = color || '#ffffff'; x.stroke();
    x.font = `bold ${fs}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#000'; x.lineJoin = 'round'; x.strokeText(t, W / 2, H / 2 + 4);
    x.fillStyle = '#fff'; x.fillText(t, W / 2, H / 2 + 4);
    const tex = new T.CanvasTexture(cv);
    tex.anisotropy = 4;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    sp.userData.aspect = W / H;
    setLabelScale(sp);
    sp.renderOrder = 10;
    return sp;
  }
  function setLabelScale(sp) {
    const h = LABEL_SIZE[V.labelSize] || LABEL_SIZE.m;
    sp.scale.set(h * sp.userData.aspect, h, 1);
  }

  // 金属の映り込み用の環境（まわりの明るさ）
  function makeEnvironment() {
    const pm = new T.PMREMGenerator(renderer);
    const env = new T.Scene();
    const room = new T.Mesh(new T.BoxGeometry(30, 16, 30), new T.MeshBasicMaterial({ color: '#3a2c20', side: T.BackSide }));
    env.add(room);
    [[0, 7.5, 4, 14, 3], [-8, 5, -6, 6, 2], [8, 5, -6, 6, 2], [0, 6, 12, 18, 2]].forEach(p => {
      const l = new T.Mesh(new T.PlaneGeometry(p[3], p[4]), new T.MeshBasicMaterial({ color: '#fff4dd' }));
      l.position.set(p[0], p[1], p[2]); l.lookAt(0, 0, 0); env.add(l);
    });
    const rt = pm.fromScene(env, 0.04);
    pm.dispose();
    return rt.texture;
  }

  // ---------------------------------------------------------------- シーン
  function buildScene() {
    const doc = SS.app.doc();
    const o = doc.options;
    V.showStands = o.showStands !== false;
    const st = doc.stage;
    const W = st.w / 100, D = st.d / 100;
    stageW = W; stageD = D;
    scene = new T.Scene();
    scene.background = new T.Color('#0d0e11');
    scene.fog = new T.Fog('#0d0e11', 35, 80);
    scene.environment = makeEnvironment();
    baseLights = [];
    const hemi = new T.HemisphereLight('#fff1dc', '#2a2420', 0.35);
    scene.add(hemi); baseLights.push(hemi);
    // 舞台照明（前明かりと天井の明かり）
    const key = new T.DirectionalLight('#fff0d8', 0.75);
    key.position.set(W * 0.5, 16, D + 10);
    key.target.position.set(W / 2, 0, D * 0.45);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const sc = key.shadow.camera;
    sc.left = -W * 0.75; sc.right = W * 0.75; sc.top = D * 0.9; sc.bottom = -D * 0.9; sc.near = 2; sc.far = 50;
    scene.add(key); scene.add(key.target); baseLights.push(key);
    [-0.3, 0.5, 1.3].forEach(fx => {
      const sp = new T.SpotLight('#ffe7c4', 0.55, 40, 0.55, 0.6, 1.2);
      sp.position.set(W * fx, 11, D + 6);
      sp.target.position.set(W / 2 + (fx - 0.5) * W * 0.3, 0, D * 0.4);
      scene.add(sp); scene.add(sp.target); baseLights.push(sp);
    });
    for (let i = 0; i < 3; i++) {
      const pl = new T.PointLight('#fff2dd', 0.35, 18, 1.6);
      pl.position.set(W * (0.25 + i * 0.25), 6.5, D * 0.45);
      scene.add(pl); baseLights.push(pl);
    }
    baseLights.forEach(l => { l.userData.i0 = l.intensity; });

    // ステージの床（板張り）
    const poly = SS.render.stagePoly(st).map(p => [p[0] / 100, p[1] / 100]);
    const shape = new T.Shape(poly.map(p => new T.Vector2(p[0], p[1])));
    const sg = new T.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false });
    const floorTex = planksTexture('#c08d55', 48, true);
    floorTex.repeat.set(1 / 2.2, 1 / 2.2);
    const floorMat = new T.MeshPhysicalMaterial({ map: floorTex, roughness: 0.38, metalness: 0.02, clearcoat: 0.45, clearcoatRoughness: 0.22 });
    const stageMesh = new T.Mesh(sg, [floorMat, mat('#141414')]);
    stageMesh.rotation.x = Math.PI / 2;
    stageMesh.receiveShadow = true;
    scene.add(stageMesh);
    // ホールの設備：オーケストラピットのふた・花道は、舞台と同じ高さの床として客席側へ出す
    const fg = SS.fixtureGeom ? SS.fixtureGeom(st) : {};
    [fg.pit, fg.hanamichi].forEach(r => {
      if (!r) return;
      const w = (r.x1 - r.x0) / 100, d = (r.y1 - r.y0) / 100;
      const tex = floorTex.clone(); tex.needsUpdate = true; tex.repeat.set(1 / 2.2, 1 / 2.2);
      const m = new T.Mesh(new T.BoxGeometry(w, 1.0, d), [mat('#141414'), mat('#141414'), new T.MeshPhysicalMaterial({ map: tex, roughness: 0.4, clearcoat: 0.4 }), mat('#141414'), mat('#141414'), mat('#141414')]);
      m.position.set((r.x0 + r.x1) / 200, -0.5 + 0.004, (r.y0 + r.y1) / 200);
      m.receiveShadow = true;
      scene.add(m);
    });

    // 音響反射板（奥・左右の壁と天井の板）
    const shellH = 7.5;
    const wallTex = panelTexture('#b98550', false);
    const wallMat = () => { const m = new T.MeshStandardMaterial({ map: wallTex.clone(), roughness: 0.5 }); m.map.needsUpdate = true; return m; };
    const bl = poly[0], br = poly[1];
    const yc = st.shape === 'arc' ? (st.d - SS.render.arcSag(st)) / 100 : D;
    const fr = [W, yc], fl = [0, yc];
    const wall = (a, b, depthOff) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = wallMat();
      m.map.repeat.set(len / 5, shellH / 5);
      const w = new T.Mesh(new T.BoxGeometry(len, shellH, 0.25), m);
      w.position.set((a[0] + b[0]) / 2, shellH / 2, (a[1] + b[1]) / 2);
      w.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      w.translateZ(depthOff);
      w.receiveShadow = true;
      scene.add(w);
      // 下の腰板（濃い木）と、音を散らす縦のふくらみ（半円柱）
      const base = new T.Mesh(new T.BoxGeometry(len, 0.9, 0.06), mat('#4a2f1a', { roughness: 0.45 }));
      base.position.set((a[0] + b[0]) / 2, 0.45, (a[1] + b[1]) / 2);
      base.rotation.y = w.rotation.y; base.translateZ(depthOff + 0.15); base.receiveShadow = true;
      scene.add(base);
      const n = Math.floor(len / 0.9);
      const dif = new T.InstancedMesh(new T.CylinderGeometry(0.14, 0.14, shellH - 1.4, 14, 1, false, -Math.PI / 2, Math.PI), mat('#c48f58', { roughness: 0.4 }), Math.max(1, n - 1));
      const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), w.rotation.y);
      const off = new T.Vector3(0, 0, depthOff + 0.125).applyQuaternion(q);
      const mm = new T.Matrix4();
      for (let i = 1; i < n; i++) {
        const t = i / n;
        mm.compose(new T.Vector3(a[0] + (b[0] - a[0]) * t + off.x, 0.9 + (shellH - 1.4) / 2, a[1] + (b[1] - a[1]) * t + off.z), q, new T.Vector3(1, 1, 1));
        dif.setMatrixAt(i - 1, mm);
      }
      dif.castShadow = false; dif.receiveShadow = true;
      scene.add(dif);
      // 上のふち：あたたかい間接照明
      const glow = new T.Mesh(new T.BoxGeometry(len, 0.05, 0.05), new T.MeshBasicMaterial({ color: '#ffd9a0' }));
      glow.position.set((a[0] + b[0]) / 2, shellH - 0.3, (a[1] + b[1]) / 2);
      glow.rotation.y = w.rotation.y; glow.translateZ(depthOff + 0.2);
      scene.add(glow);
    };
    wall(bl, br, -0.13);
    if (st.shape !== 'apron' && st.shape !== 'round') {
      wall(fl, bl, -0.13);
      wall(br, fr, -0.13);
    }
    // 上手・下手の出入り口（扉）：横の壁に、濃い色の扉と枠
    (fg.doors || []).forEach(dr => {
      const yc = (dr.y0 + dr.y1) / 2, [a0, a1] = SS.render.xRange(st, yc - 20), [b0, b1] = SS.render.xRange(st, yc + 20);
      const ang = dr.side === 'L' ? Math.atan2(b0 - a0, 40) : Math.atan2(b1 - a1, 40);
      const g = new T.Group();
      const dw = (dr.y1 - dr.y0) / 100;
      box(g, 0.32, 2.5, dw + 0.16, '#2a1a10', 0, 1.25, 0, { roughness: 0.5 });
      box(g, 0.34, 2.36, dw, '#6a4a30', 0, 1.18, 0, { roughness: 0.45 });
      box(g, 0.36, 0.03, dw * 0.9, '#d8d0c0', 0, 1.1, 0, METAL);
      g.position.set(dr.x / 100, 0, yc / 100);
      g.rotation.y = ang;
      scene.add(g);
    });
    // ステージの前のふち
    box(scene, W + 2, 0.9, 0.1, '#1a1410', W / 2, -0.55, D + 0.06);

    // 客席（床・いす・壁）
    const floor = new T.Mesh(new T.PlaneGeometry(W + 24, 40), mat('#3a2426', { roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, -1.0, D + 20); floor.receiveShadow = true;
    scene.add(floor);
    const seatPos = [];
    const fg2 = SS.fixtureGeom ? SS.fixtureGeom(st) : {};
    const seatFree = [fg2.pit, fg2.hanamichi].filter(Boolean).concat(doc.items.filter(it => it.type === 'runway').map(it => SS.itemAABB(it, {})));
    for (let row = 0; row < 20; row++) {
      const z = D + 2.8 + row * 0.95;
      const y = -1.0 + row * 0.14;
      for (let x = -2; x < W + 2; x += 0.55) {
        if (Math.abs(x - W / 2) < 0.7) continue;
        // ピットのふた・花道の上には、いすを置かない
        if (seatFree.some(r => x > r.x0 / 100 - 0.4 && x < r.x1 / 100 + 0.4 && z < r.y1 / 100 + 0.5)) continue;
        seatPos.push([x, y, z]);
      }
    }
    const cushion = new T.InstancedMesh(new T.BoxGeometry(0.48, 0.12, 0.45), mat('#7a1a26', { roughness: 0.9 }), seatPos.length);
    const back = new T.InstancedMesh(new T.BoxGeometry(0.5, 0.6, 0.08), mat('#7a1a26', { roughness: 0.9 }), seatPos.length);
    const m4 = new T.Matrix4();
    seatPos.forEach((p, i) => {
      m4.makeTranslation(p[0], p[1] + 0.45, p[2]); cushion.setMatrixAt(i, m4);
      m4.makeTranslation(p[0], p[1] + 0.75, p[2] + 0.24); back.setMatrixAt(i, m4);
    });
    scene.add(cushion); scene.add(back);
    // 客席の横の壁（木の縦格子）とバルコニー席
    const hallTex = panelTexture('#8a5a32', true);
    [-3, W + 3].forEach((x, si) => {
      const wm = new T.MeshStandardMaterial({ map: hallTex.clone(), roughness: 0.6 });
      wm.map.needsUpdate = true; wm.map.repeat.set(30 / 3.2, 12 / 3.2);
      const w = new T.Mesh(new T.BoxGeometry(0.3, 12, 30), wm);
      w.position.set(x, 5, D + 15); w.receiveShadow = true; scene.add(w);
      const dir = si ? -1 : 1;
      for (let lv = 0; lv < 2; lv++) {
        const y = 3 + lv * 3.2;
        box(scene, 2.2, 0.25, 26, '#3a2a1e', x + dir * 1.2, y, D + 16);
        box(scene, 0.12, 0.9, 26, '#7a5230', x + dir * 2.3, y + 0.55, D + 16, { roughness: 0.35 });
        // バルコニーの手すりの下の間接照明
        const lamp = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 26), new T.MeshBasicMaterial({ color: '#ffcf8a' }));
        lamp.position.set(x + dir * 2.37, y - 0.1, D + 16); scene.add(lamp);
        const seats = new T.InstancedMesh(new T.BoxGeometry(0.5, 0.8, 0.5), mat('#7a1a26', { roughness: 0.9 }), 40);
        const mm = new T.Matrix4();
        for (let i = 0; i < 40; i++) { mm.makeTranslation(x + dir * 1.0, y + 0.5, D + 3.5 + i * 0.62); seats.setMatrixAt(i, mm); }
        scene.add(seats);
      }
    });
    // 非常口の表示（天井は作らない：真上からも見えるように）
    [-2.8, W + 2.8].forEach(x => {
      const e = new T.Mesh(new T.PlaneGeometry(0.6, 0.25), new T.MeshBasicMaterial({ color: '#2fbf5b' }));
      e.position.set(x + (x < 0 ? 0.2 : -0.2), 2.4, D + 2); e.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(e);
    });

    // 部品
    playerGroups = new Map();
    const rh = riserHeights(doc.items);
    sceneRH = rh;
    const ropts = { colorBy: true, figure: true };
    // 弦楽器は2人で1本の譜面台：2人の譜面台の位置の真ん中に1本
    const pairs = SS.standPairs ? SS.standPairs(doc.items) : new Map();
    if (V.showStands) pairs.forEach((b, a) => {
      if (doc.items.indexOf(a) > doc.items.indexOf(b)) return;
      const p = SS.standPoint(a, ropts), q = SS.standPoint(b, ropts);
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const ra = ((a.rot || 0) * Math.PI) / 180, rb = ((b.rot || 0) * Math.PI) / 180;
      const g = new T.Group();
      makeStand(g, 0, 0);
      g.position.set(mx / 100, heightAt(mx, my, rh), my / 100);
      g.rotation.y = -Math.atan2(Math.sin(ra) + Math.sin(rb), Math.cos(ra) + Math.cos(rb));
      scene.add(g);
    });
    doc.items.forEach(it => {
      const color = SS.itemColor(it, ropts);
      const x = it.x / 100, z = it.y / 100;
      const rot = -(it.rot || 0) * Math.PI / 180;
      if (it.type === 'player') {
        const base = heightAt(it.x, it.y, rh);
        const p = makePlayer(it, color === '#ffffff' ? '#8c96a8' : color, pairs.has(it));
        p.g.position.set(x, base, z);
        p.g.rotation.y = rot;
        // 2人で1本の譜面台の組は、札を1枚だけ（重なって読めなくならないように）
        const pb = pairs.get(it);
        if (it.label && !(pb && (pb.label || '') === it.label && doc.items.indexOf(pb) < doc.items.indexOf(it))) {
          const sp = labelSprite(it.label, color === '#ffffff' ? '#8c96a8' : color);
          sp.position.set(0, 1.95, 0);
          sp.userData.isLabel = true;
          sp.visible = labelsOn;
          p.g.add(sp);
        }
        p.g.userData.playerId = it.id;
        scene.add(p.g);
        playerGroups.set(it.id, { g: p.g, head: p.head, it, base });
      } else {
        const isRiser = it.type === 'riser' || it.type === 'riser46' || it.type === 'hina' || it.type === 'runway' || it.type === 'door';
        const g = makeItem(it, color, rh.get(it) || 0.2);
        if (!g) return;
        if (!isRiser && it.type !== 'podium') {
          const cat = SS.CATALOG[it.type] || {};
          g.add(blobShadow(Math.max((it.w || cat.w || 60), (it.h || cat.h || 60)) / 100 * 1.25, 0.3));
        }
        const base = isRiser ? 0 : heightAt(it.x, it.y, rh);
        g.position.set(x, base, z);
        g.rotation.y = rot;
        scene.add(g);
      }
    });
  }

  // ---------------------------------------------------------------- カメラ
  function setCam(m, arg) {
    if (hiddenHead) { hiddenHead.forEach(h => { h.visible = true; }); hiddenHead = null; }
    mode = m;
    document.querySelectorAll('.v3-bar [data-cam]').forEach(b => b.classList.toggle('active', b.getAttribute('data-cam') === m));
    const doc = SS.app.doc();
    const c = SS.app.conductor();
    const target = new T.Vector3(stageW / 2, 0.8, stageD * 0.5);
    if (m === 'audience') { mode = 'orbit'; Object.assign(orbit, { target, r: Math.max(12, stageW * 0.9), phi: 1.3, theta: 0 }); $('v3title').textContent = '客席から'; }
    else if (m === 'top') { mode = 'orbit'; Object.assign(orbit, { target, r: Math.max(stageW, stageD) * 1.25, phi: 0.02, theta: 0 }); $('v3title').textContent = '真上から'; }
    else if (m === 'orbit') { Object.assign(orbit, { target, r: Math.max(12, stageW * 0.85), phi: 1.05, theta: 0.6 }); $('v3title').textContent = '自由に回す'; }
    else if (m === 'conductor') {
      mode = 'fp';
      fp.pos = new T.Vector3(c.x / 100, 0.2 + 1.62, c.y / 100);
      fp.yaw = Math.PI; fp.pitch = -0.12; fp.fov = 70;
      $('v3title').textContent = '指揮者の目線';
    } else if (m === 'seat') {
      const pg = playerGroups.get(arg);
      if (!pg) return setCam('audience');
      mode = 'fp';
      const kind = SS.instrumentKind(pg.it.label);
      const standing = kind === 'perc' || kind === 'bass' || kind === 'voice';
      const eye = (standing ? 1.62 : 1.2) + pg.base;
      const a = pg.g.rotation.y;
      fp.pos = new T.Vector3(pg.g.position.x + Math.sin(a) * 0.08, eye, pg.g.position.z + Math.cos(a) * 0.08);
      fp.yaw = a; fp.pitch = -0.1; fp.fov = 70;
      // 自分の体と楽器は視界のじゃまになるので隠す
      hiddenHead = [pg.g];
      pg.g.visible = false;
      $('v3title').textContent = `${pg.it.label || '奏者'}${pg.it.name ? '（' + pg.it.name + '）' : ''}の席から`;
      document.querySelectorAll('.v3-bar [data-cam]').forEach(b => b.classList.remove('active'));
    }
    void doc;
    updateCamera();
  }

  function updateCamera() {
    if (mode === 'orbit') {
      const o = orbit;
      o.phi = Math.max(0.02, Math.min(1.52, o.phi));
      o.r = Math.max(2.5, Math.min(60, o.r));
      camera.fov = 50;
      camera.position.set(
        o.target.x + o.r * Math.sin(o.phi) * Math.sin(o.theta),
        o.target.y + o.r * Math.cos(o.phi),
        o.target.z + o.r * Math.sin(o.phi) * Math.cos(o.theta)
      );
      camera.lookAt(o.target);
    } else {
      fp.pitch = Math.max(-1.3, Math.min(1.2, fp.pitch));
      fp.fov = Math.max(30, Math.min(95, fp.fov));
      camera.fov = fp.fov;
      camera.position.copy(fp.pos);
      const dir = new T.Vector3(Math.sin(fp.yaw) * Math.cos(fp.pitch), Math.sin(fp.pitch), Math.cos(fp.yaw) * Math.cos(fp.pitch));
      camera.lookAt(fp.pos.clone().add(dir));
    }
    camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- 操作
  const ptrs = new Map();
  let dragInfo = null;
  function onDown(e) {
    const cv = $('c3d');
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragInfo = { x: e.clientX, y: e.clientY, moved: false, dist: pinchDist() };
  }
  function pinchDist() {
    if (ptrs.size < 2) return 0;
    const [a, b] = [...ptrs.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function onMove(e) {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dragInfo) return;
    if (Math.hypot(e.clientX - dragInfo.x, e.clientY - dragInfo.y) > 5) dragInfo.moved = true;
    if (ptrs.size >= 2) {
      const d = pinchDist();
      if (dragInfo.dist) zoom(dragInfo.dist / d);
      dragInfo.dist = d;
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (mode === 'orbit') { orbit.theta -= dx * 0.006; orbit.phi -= dy * 0.006; }
    else { fp.yaw -= dx * 0.004; fp.pitch += dy * 0.004; }
    updateCamera();
  }
  function onUp(e) {
    ptrs.delete(e.pointerId);
    if (dragInfo && !dragInfo.moved && ptrs.size === 0) pick(e);
    if (ptrs.size === 0) dragInfo = null;
  }
  function zoom(f) {
    if (mode === 'orbit') orbit.r *= f; else fp.fov *= f;
    updateCamera();
  }
  function pick(e) {
    const cv = $('c3d');
    const r = cv.getBoundingClientRect();
    const v = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new T.Raycaster();
    ray.setFromCamera(v, camera);
    const hits = ray.intersectObjects(scene.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !(o.userData && o.userData.playerId)) o = o.parent;
      if (o) { setCam('seat', o.userData.playerId); return; }
    }
  }

  function resize() {
    if (!renderer) return;
    const cv = $('c3d');
    const w = cv.clientWidth, h = cv.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    renderer.render(scene, camera);
  }

  function disposeScene() {
    if (!scene) return;
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.isMaterial && o.material.map) o.material.map.dispose();
    });
    if (scene.environment) scene.environment.dispose();
    matCache.forEach(m => m.dispose());
    matCache.clear();
    scene = null;
  }

  let bound = false, closeBound = false;
  // ---------------------------------------------------------------- 照明のテスト
  // 配置図に保存（doc.lighting）。地明かりの明るさ・反射板を下から色で照らす（アッパー）・上から色・ピンスポット
  const LIGHT_COLORS = [['#ffffff', '白'], ['#ffd28a', '電球色'], ['#3a6bff', '青'], ['#35c8ff', '水色'], ['#ff3b3b', '赤'], ['#ff9f1a', 'オレンジ'], ['#35d06a', '緑'], ['#b04dff', '紫'], ['#ff5fb0', 'ピンク']];
  const SPOT_FROM = { back: '客席のうしろ（真ん中）', left: '2階の下手側', right: '2階の上手側', top: '舞台の真上' };
  const SPOT_SIZE = { s: ['小（顔と上半身）', 0.55], m: ['中（1人）', 0.9], l: ['大（2〜3人）', 1.5] };
  let glowT = null;
  function glowTex() {
    if (glowT) return glowT;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 128);
    const gh = x.createLinearGradient(0, 0, 64, 0); gh.addColorStop(0, 'rgba(0,0,0,1)'); gh.addColorStop(0.5, 'rgba(0,0,0,0)'); gh.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = gh; x.globalAlpha = 0.6; x.fillRect(0, 0, 64, 128);
    glowT = new T.CanvasTexture(cv);
    return glowT;
  }
  V.lightingOf = function () {
    const d = SS.app.doc();
    return Object.assign({ base: 100, horizon: false, hColor: '#3a6bff', hColor2: '', hPower: 70, wash: false, wColor: '#b04dff', wPower: 60, spots: [] }, d.lighting || {});
  };
  function saveLighting(L) { SS.app.doc().lighting = L; if (SS.app.touch) SS.app.touch(); }
  function spotSource(from, W, D) {
    if (from === 'left') return new T.Vector3(-2.5, 7.5, D + 11);
    if (from === 'right') return new T.Vector3(W + 2.5, 7.5, D + 11);
    if (from === 'top') return new T.Vector3(W / 2, 11, D * 0.5);
    return new T.Vector3(W / 2, 9, D + 22);
  }
  // ピンスポットを当てる相手：司会・指揮者・奏者（パート名と名前）
  function spotTargets() {
    const items = SS.app.doc().items, out = [];
    items.filter(it => it.type === 'mc').forEach(it => out.push([it.id, `🎤 ${it.label || '司会'}`]));
    items.filter(it => it.type === 'podium').forEach(it => out.push([it.id, '🎼 指揮者（指揮台）']));
    items.filter(it => it.type === 'player').forEach(it => out.push([it.id, `${it.label || '奏者'}${it.name ? '（' + it.name + '）' : ''}`]));
    return out;
  }
  function applyLighting() {
    if (!scene || !T) return;
    const L = V.lightingOf(), W = stageW, D = stageD;
    // 目で見た明るさに近くなるよう、％は2乗で効かせる（50%でもしっかり暗くなる）
    const k0 = Math.max(0, Math.min(1, L.base / 100)), k = Math.pow(k0, 1.8);
    baseLights.forEach(l => { l.intensity = l.userData.i0 * k; });
    // 映り込みの明るさ（環境光）も同じだけ落とす（暗くしないと、ピンスポットや色の明かりが見えない）
    scene.traverse(o => { if (!o.isMesh || !o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.envMapIntensity == null) return; if (m.userData.env0 == null) m.userData.env0 = m.envMapIntensity; m.envMapIntensity = m.userData.env0 * Math.max(0.03, k); }); });
    if (rig) {
      scene.remove(rig);
      rig.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.userData.own) o.material.dispose(); if (o.shadow && o.shadow.map) o.shadow.map.dispose(); });
    }
    rig = new T.Group();
    scene.add(rig);
    const addSpot = (color, power, from, to, angle, penumbra, shadow, reach) => {
      const sp = new T.SpotLight(color, power, reach || 0, angle, penumbra, reach ? 1.2 : 1);
      sp.position.copy(from); sp.target.position.copy(to);
      if (shadow) { sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0005; }
      rig.add(sp); rig.add(sp.target);
      return sp;
    };
    // 反射板（舞台の奥の壁）を、床に置いた明かりで下から色で照らす
    if (L.horizon) {
      const poly = SS.render.stagePoly(SS.app.doc().stage).map(p => [p[0] / 100, p[1] / 100]);
      const a = poly[0], b = poly[1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(3, Math.round(len / 1.5));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const col = L.hColor2 && i % 2 ? L.hColor2 : L.hColor;
        addSpot(col, (L.hPower / 100) * 1.6, new T.Vector3(x, 0.15, z + 1.0), new T.Vector3(x, 3.2, z), 0.42, 0.8, false, 12);
        // 壁にうつる色（下が濃く、上へうすく）
        const glow = new T.Mesh(new T.PlaneGeometry((len / n) * 1.25, 5.5), new T.MeshBasicMaterial({ map: glowTex(), color: col, transparent: true, opacity: 0.85 * (L.hPower / 100), depthWrite: false, toneMapped: false }));
        glow.position.set(x, 2.75, z + 0.32); glow.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); glow.userData.own = true; rig.add(glow);
        const fx = box(rig, 0.3, 0.16, 0.24, '#111', x, 0.08, z + 0.42);
        void fx;
        const lens = new T.Mesh(new T.CircleGeometry(0.07, 16), new T.MeshBasicMaterial({ color: col }));
        lens.position.set(x, 0.17, z + 0.4); lens.rotation.x = -Math.PI / 2 + 0.5; lens.userData.own = true; rig.add(lens);
      }
    }
    // 上から色の照明（舞台全体）
    if (L.wash) addSpot(L.wColor, (L.wPower / 100) * 1.4, new T.Vector3(W / 2, 12, D * 0.55), new T.Vector3(W / 2, 0, D * 0.5), 0.8, 0.5, false);
    // ピンスポット
    const items = SS.app.doc().items;
    (L.spots || []).forEach((s2, i) => {
      const it = items.find(o => o.id === s2.target);
      if (!it) return;
      const base = heightAt(it.x, it.y, sceneRH);
      const aim = new T.Vector3(it.x / 100, base + (it.type === 'podium' ? 0.2 : 0), it.y / 100);
      const src = spotSource(s2.from || 'back', W, D);
      const r = (SPOT_SIZE[s2.size] || SPOT_SIZE.m)[1];
      const dist = src.distanceTo(aim);
      const ang = Math.atan(r / dist);
      addSpot(s2.color || '#ffffff', 2.6, src, aim, ang, 0.3, i < 4);
      // 光の筋（うすく見える円すい）
      const cone = new T.Mesh(new T.ConeGeometry(r, dist, 32, 1, true), new T.MeshBasicMaterial({ color: s2.color || '#ffffff', transparent: true, opacity: 0.06, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      cone.position.copy(src.clone().add(aim).multiplyScalar(0.5));
      cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), src.clone().sub(aim).normalize());
      cone.userData.own = true;
      rig.add(cone);
    });
  }
  V.applyLighting = applyLighting;

  // 照明のパネル
  function swatches(name, cur, allowNone) {
    return `<div class="v3-sw" data-sw="${name}">${allowNone ? `<button type="button" data-c="" class="${!cur ? 'on' : ''}" title="なし">なし</button>` : ''}${LIGHT_COLORS.map(([c, t]) => `<button type="button" data-c="${c}" title="${t}" class="${cur === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>`;
  }
  function renderLightPanel() {
    const box2 = $('v3light'); if (!box2) return;
    const L = V.lightingOf(), tg = spotTargets();
    const opt = (list, cur) => list.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${SS.esc(t)}</option>`).join('');
    box2.innerHTML = `<div class="v3l-head"><b>💡 照明のテスト</b><button type="button" class="v3l-x" id="v3lClose" title="閉じる">✕</button></div>
      <label class="field">地明かり（ふだんの舞台の明かり） <b>${L.base}%</b><input type="range" min="0" max="100" step="5" value="${L.base}" data-k="base"></label>
      <div class="v3l-sec"><label class="check"><input type="checkbox" data-k="horizon"${L.horizon ? ' checked' : ''}> 反射板を下から色で照らす（床に置いた明かり）</label>
        ${L.horizon ? `${swatches('hColor', L.hColor)}<div class="small">2色を交互に：</div>${swatches('hColor2', L.hColor2, true)}<label class="field">強さ <b>${L.hPower}%</b><input type="range" min="10" max="100" step="5" value="${L.hPower}" data-k="hPower"></label>` : ''}</div>
      <div class="v3l-sec"><label class="check"><input type="checkbox" data-k="wash"${L.wash ? ' checked' : ''}> 上から色の明かり（舞台全体）</label>
        ${L.wash ? `${swatches('wColor', L.wColor)}<label class="field">強さ <b>${L.wPower}%</b><input type="range" min="10" max="100" step="5" value="${L.wPower}" data-k="wPower"></label>` : ''}</div>
      <div class="v3l-sec"><b class="small">ピンスポット</b>
        ${(L.spots || []).map((s2, i) => `<div class="v3l-spot" data-i="${i}">
          <label class="field">当てる人<select data-s="target">${opt(tg, s2.target)}</select></label>
          <div class="row2"><label class="field">どこから<select data-s="from">${opt(Object.entries(SPOT_FROM), s2.from || 'back')}</select></label>
          <label class="field">大きさ<select data-s="size">${opt(Object.entries(SPOT_SIZE).map(([k2, v]) => [k2, v[0]]), s2.size || 'm')}</select></label></div>
          ${swatches('spot' + i, s2.color || '#ffffff')}
          <button type="button" class="btn small" data-del="${i}">このピンスポットを消す</button></div>`).join('')}
        <button type="button" class="btn wide" id="v3lAdd"${tg.length ? '' : ' disabled'}>＋ ピンスポットを足す</button>
        ${tg.length ? '' : '<p class="small">当てる人がいません。「部品」の「司会（マイクスタンド）」や奏者を置いてください。</p>'}
        <p class="small">司会の位置は、2D の図で「部品」の <b>司会（マイクスタンド）</b> を置いて決めます。</p></div>
      <button type="button" class="btn wide" id="v3lReset">照明をもとに戻す</button>`;
    const set = (k2, v) => { const L2 = V.lightingOf(); L2[k2] = v; saveLighting(L2); applyLighting(); };
    box2.querySelectorAll('[data-k]').forEach(el => {
      const k2 = el.getAttribute('data-k');
      if (el.type === 'checkbox') el.onchange = () => { set(k2, el.checked); renderLightPanel(); };
      else { el.oninput = () => { set(k2, +el.value); el.previousElementSibling && (el.previousElementSibling.textContent = el.value + '%'); }; }
    });
    box2.querySelectorAll('[data-sw]').forEach(sw => {
      const name = sw.getAttribute('data-sw');
      sw.querySelectorAll('button').forEach(b => { b.onclick = () => {
        const L2 = V.lightingOf(), c = b.getAttribute('data-c');
        if (/^spot\d+$/.test(name)) { const i = +name.slice(4); L2.spots = L2.spots.map((q, j) => (j === i ? Object.assign({}, q, { color: c }) : q)); } else L2[name] = c;
        saveLighting(L2); applyLighting(); renderLightPanel();
      }; });
    });
    box2.querySelectorAll('.v3l-spot').forEach(row => {
      const i = +row.getAttribute('data-i');
      row.querySelectorAll('[data-s]').forEach(el => { el.onchange = () => { const L2 = V.lightingOf(); L2.spots = L2.spots.map((q, j) => (j === i ? Object.assign({}, q, { [el.getAttribute('data-s')]: el.value }) : q)); saveLighting(L2); applyLighting(); }; });
      row.querySelector('[data-del]').onclick = () => { const L2 = V.lightingOf(); L2.spots = L2.spots.filter((q, j) => j !== i); saveLighting(L2); applyLighting(); renderLightPanel(); };
    });
    if ($('v3lAdd')) $('v3lAdd').onclick = () => {
      const L2 = V.lightingOf(); const used = new Set((L2.spots || []).map(q => q.target));
      const t = tg.find(([id]) => !used.has(id)) || tg[0];
      L2.spots = (L2.spots || []).concat([{ target: t[0], color: '#ffffff', size: 'm', from: 'back' }]);
      // はじめてのピンスポットは、ほかの明かりを少し暗くして見やすく
      if (L2.spots.length === 1 && L2.base > 60) L2.base = 60;
      saveLighting(L2); applyLighting(); renderLightPanel();
    };
    $('v3lReset').onclick = () => { saveLighting(null); delete SS.app.doc().lighting; applyLighting(); renderLightPanel(); };
    $('v3lClose').onclick = () => { box2.hidden = true; $('v3lightBtn').classList.remove('active'); };
  }

  V.open = async function (playerId) {
    // 閉じるボタンと Esc は、読み込みの前に登録する（読み込みに失敗しても閉じられるように）
    if (!closeBound) {
      closeBound = true;
      $('v3close').onclick = V.close;
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('view3d').classList.contains('hidden')) V.close(); });
    }
    $('view3d').classList.remove('hidden');
    $('v3loading').hidden = false;
    $('v3loading').textContent = '3Dを準備しています…（3Dの表示には、インターネット接続が必要です）';
    try {
      T = await loadThree();
    } catch (err) {
      $('v3loading').textContent = err.message;
      return;
    }
    if ($('view3d').classList.contains('hidden')) return; // 読み込み中に閉じられた
    const cv = $('c3d');
    if (!renderer) {
      renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.physicallyCorrectLights = false;
      camera = new T.PerspectiveCamera(50, 1, 0.05, 200);
    }
    if (!bound) {
      bound = true;
      cv.addEventListener('pointerdown', onDown);
      cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerup', onUp);
      cv.addEventListener('pointercancel', onUp);
      cv.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
      window.addEventListener('resize', resize);
      document.querySelectorAll('.v3-bar [data-cam]').forEach(b => { b.onclick = () => setCam(b.getAttribute('data-cam')); });
      $('v3clothes').onchange = e => { V.clothes = e.target.checked ? 'part' : 'black'; const id = hiddenHead && hiddenHead[0] && hiddenHead[0].userData.playerId; disposeScene(); buildScene(); rig = null; applyLighting(); if (id) setCam('seat', id); };
      $('v3labelSize').onchange = e => {
        V.labelSize = e.target.value;
        try { localStorage.setItem('stagesetting.v3label', V.labelSize); } catch (err) { /* ignore */ }
        scene && scene.traverse(o => { if (o.userData && o.userData.isLabel) setLabelScale(o); });
      };
      $('v3lightBtn').onclick = () => { const p = $('v3light'); p.hidden = !p.hidden; $('v3lightBtn').classList.toggle('active', !p.hidden); if (!p.hidden) renderLightPanel(); };
      $('v3labels').onchange = e => {
        labelsOn = e.target.checked;
        scene && scene.traverse(o => { if (o.userData && o.userData.isLabel) o.visible = labelsOn; });
      };
    }
    if (!V.labelSize) { try { V.labelSize = localStorage.getItem('stagesetting.v3label') || 'm'; } catch (err) { V.labelSize = 'm'; } }
    $('v3labelSize').value = V.labelSize;
    disposeScene();
    buildScene();
    rig = null;
    applyLighting();
    if (!$('v3light').hidden) renderLightPanel();
    resize();
    setCam(playerId ? 'seat' : 'audience', playerId);
    $('v3loading').hidden = true;
    cancelAnimationFrame(raf);
    loop();
  };

  V.close = function () {
    cancelAnimationFrame(raf);
    $('view3d').classList.add('hidden');
    disposeScene();
  };

  SS.view3d = V;
})(window.SS);
