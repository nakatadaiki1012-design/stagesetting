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

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = () => resolve(window.THREE);
      s.onerror = () => reject(new Error('3Dの部品を読み込めませんでした。インターネットにつながっているか確認してください。'));
      document.head.appendChild(s);
    });
  }

  // ---------------------------------------------------------------- 部品づくり
  const matCache = new Map();
  function mat(color, opt) {
    const key = color + JSON.stringify(opt || {});
    if (!matCache.has(key)) {
      matCache.set(key, new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, opt || {})));
    }
    return matCache.get(key);
  }
  const METAL = { metalness: 0.75, roughness: 0.3 };
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
    const m = mesh(new T.SphereGeometry(r, 18, 14), color, opt);
    m.position.set(x, y, z); g.add(m); return m;
  }
  // 2点を結ぶ円柱（楽器の管など）
  function tube(g, a, b, r, color, opt) {
    const va = new T.Vector3(...a), vb = new T.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = mesh(new T.CylinderGeometry(r, r, len, 12), color, opt);
    m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.add(m); return m;
  }
  function bellCone(g, at, dir, r, len, color) {
    const m = mesh(new T.CylinderGeometry(r, r * 0.25, len, 20, 1, true), color, Object.assign({ side: T.DoubleSide }, METAL));
    const va = new T.Vector3(...at), vd = new T.Vector3(...dir).normalize();
    m.position.copy(va.clone().add(vd.clone().multiplyScalar(-len / 2)));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vd);
    g.add(m); return m;
  }

  const GOLD = '#d4ab45', SILVER = '#cfd4da', BLACKW = '#1e1e22', WOOD = '#8a5228', SKIN = '#f0c8a2', HAIR = '#3b2f28', PANTS = '#2e3440';

  // 奏者（人＋楽器）
  function makePlayer(it, color) {
    const g = new T.Group();
    const kind = SS.instrumentKind(it.label);
    const standing = kind === 'perc' || kind === 'bass';
    const stool = kind === 'cb' || kind === 'drs';
    const bench = kind === 'pf';
    const seatY = stool ? 0.62 : 0.45;
    const head = [];
    if (!standing) {
      if (bench) box(g, 0.75, 0.05, 0.35, '#2a2a2e', 0, 0.48, -0.08);
      else if (stool) cyl(g, 0.17, 0.17, 0.05, '#555', 0, seatY, -0.05);
      else {
        box(g, 0.44, 0.05, 0.42, '#3d4250', 0, seatY, -0.05);
        box(g, 0.44, 0.42, 0.04, '#3d4250', 0, seatY + 0.26, -0.26);
      }
      [[-0.18, -0.22], [0.18, -0.22], [-0.18, 0.12], [0.18, 0.12]].forEach(p => cyl(g, 0.012, 0.012, seatY, '#777', p[0], seatY / 2, p[1]));
      // 太もも・すね
      box(g, 0.34, 0.14, 0.42, PANTS, 0, seatY + 0.09, 0.1);
      box(g, 0.3, seatY, 0.12, PANTS, 0, seatY / 2, 0.3);
    } else {
      cyl(g, 0.07, 0.06, 0.85, PANTS, -0.09, 0.43, 0);
      cyl(g, 0.07, 0.06, 0.85, PANTS, 0.09, 0.43, 0);
    }
    const hipY = standing ? 0.88 : seatY + 0.12;
    const torsoH = 0.56;
    cyl(g, 0.19, 0.15, torsoH, color, 0, hipY + torsoH / 2, -0.02);
    const neckY = hipY + torsoH;
    const headY = neckY + 0.14;
    head.push(sph(g, 0.105, SKIN, 0, headY, 0));
    const hair = sph(g, 0.112, HAIR, 0, headY + 0.03, -0.025);
    hair.scale.set(1, 0.85, 1);
    head.push(hair);
    const mouth = [0, headY - 0.05, 0.1];
    // 楽器
    const my = mouth[1];
    switch (kind) {
      case 'tp': tube(g, mouth, [0, my - 0.06, 0.5], 0.025, GOLD, METAL); bellCone(g, [0, my - 0.07, 0.62], [0, -0.1, 1], 0.065, 0.14, GOLD); break;
      case 'tb': case 'btb':
        tube(g, mouth, [0.02, my - 0.18, 0.95], 0.012, GOLD, METAL); tube(g, [0.06, my, 0.1], [0.06, my - 0.18, 1.0], 0.012, GOLD, METAL);
        bellCone(g, [0.16, my - 0.05, 0.55], [0, -0.15, 1], kind === 'btb' ? 0.13 : 0.11, 0.25, GOLD); break;
      case 'hr': {
        const tor = mesh(new T.TorusGeometry(0.13, 0.025, 10, 28), GOLD, METAL);
        tor.position.set(-0.12, hipY + 0.35, 0.18); tor.rotation.y = Math.PI / 2.4; g.add(tor);
        bellCone(g, [-0.28, hipY + 0.12, -0.02], [-0.2, -0.2, -1], 0.15, 0.22, GOLD); break;
      }
      case 'tuba': cyl(g, 0.17, 0.2, 0.75, GOLD, 0.06, hipY + 0.35, 0.2, METAL); bellCone(g, [0.18, headY + 0.25, 0.1], [0.1, 1, 0], 0.26, 0.3, GOLD); break;
      case 'euph': cyl(g, 0.11, 0.13, 0.5, GOLD, 0.05, hipY + 0.3, 0.2, METAL); bellCone(g, [0.16, headY + 0.1, 0.12], [0.1, 1, 0], 0.15, 0.2, GOLD); break;
      case 'fl': tube(g, [0.03, my, 0.08], [-0.62, my - 0.04, 0.14], 0.012, SILVER, METAL); break;
      case 'picc': tube(g, [0.03, my, 0.08], [-0.33, my - 0.03, 0.12], 0.01, SILVER, METAL); break;
      case 'ob': case 'cl': case 'eh': case 'ssx': {
        const c = kind === 'ssx' ? GOLD : kind === 'eh' ? '#4b3526' : BLACKW;
        tube(g, mouth, [0, my - 0.52, 0.42], 0.018, c, kind === 'ssx' ? METAL : undefined);
        bellCone(g, [0, my - 0.56, 0.45], [0, -0.8, 0.6], 0.035, 0.06, kind === 'ssx' ? GOLD : BLACKW); break;
      }
      case 'bcl': tube(g, mouth, [0, 0.35, 0.3], 0.025, BLACKW); bellCone(g, [0, 0.3, 0.38], [0, 0.4, 1], 0.07, 0.1, SILVER); break;
      case 'asx': case 'tsx': case 'bsx': {
        const r = kind === 'bsx' ? 0.07 : kind === 'tsx' ? 0.05 : 0.04;
        const len = kind === 'bsx' ? 0.75 : kind === 'tsx' ? 0.62 : 0.5;
        tube(g, mouth, [-0.08, my - 0.1, 0.2], 0.012, GOLD, METAL);
        tube(g, [-0.1, my - 0.12, 0.2], [-0.14, my - 0.12 - len, 0.24], r, GOLD, METAL);
        bellCone(g, [-0.14, my - 0.08 - len * 0.55, 0.3], [0, 0.6, 0.8], r * 1.7, 0.12, GOLD); break;
      }
      case 'fg': tube(g, [0.12, hipY + 0.05, 0.2], [-0.15, headY + 0.45, 0.02], 0.035, WOOD); break;
      case 'vn': case 'va': {
        const s = kind === 'va' ? 1.12 : 1;
        const b = box(g, 0.2 * s, 0.05, 0.36 * s, WOOD, 0.13, neckY - 0.02, 0.17);
        b.rotation.y = -0.5; b.rotation.z = 0.3;
        tube(g, [-0.3, neckY - 0.05, 0.2], [0.3, neckY + 0.02, 0.05], 0.004, '#c9b58a'); break;
      }
      case 'vc': { const b = box(g, 0.42, 0.72, 0.2, WOOD, 0, 0.62, 0.34); b.rotation.x = -0.25; tube(g, [0, 1.0, 0.27], [0.02, 1.35, 0.18], 0.02, '#222'); break; }
      case 'cb': { const b = box(g, 0.6, 1.1, 0.24, WOOD, 0.08, 0.72, 0.36); b.rotation.x = -0.12; tube(g, [0.08, 1.27, 0.3], [0.1, 1.85, 0.24], 0.025, '#222'); break; }
      case 'gt': case 'bass': { const b = box(g, 0.34, 0.08, 0.26, kind === 'bass' ? '#6b2a2a' : WOOD, -0.08, hipY + 0.2, 0.16); tube(g, [0.05, hipY + 0.22, 0.16], [0.5, hipY + 0.35, 0.14], 0.02, WOOD); void b; break; }
      default: break;
    }
    // 譜面台
    const noStand = ['perc', 'drs', 'pf', 'hp'].includes(kind);
    if (!noStand && V.showStands) {
      const sz = kind === 'tb' || kind === 'btb' ? [-0.26, 0.58] : kind === 'vc' ? [0, 0.66] : kind === 'cb' ? [-0.12, 0.7] : [0, 0.56];
      cyl(g, 0.01, 0.01, 1.05, '#444', sz[0], 0.52, sz[1]);
      const desk = box(g, 0.5, 0.32, 0.015, '#2f333b', sz[0], 1.12, sz[1] - 0.04);
      desk.rotation.x = -0.45;
    }
    return { g, head };
  }

  // 楽器・台など
  function makeItem(it, color, riserH) {
    const g = new T.Group();
    const c = SS.CATALOG[it.type] || SS.CATALOG.box;
    const w = (it.w || c.w || 80) / 100, d = (it.h || c.h || 60) / 100;
    switch (it.type) {
      case 'podium': box(g, w, 0.2, d, '#9a7448', 0, 0.1, 0); box(g, 0.6, 1.05, 0.03, '#333', 0, 0.2 + 0.55, -d / 2 + 0.05).rotation.x = 0; break;
      case 'riser': case 'riser46': box(g, w, riserH, d, '#c49a64', 0, riserH / 2, 0); break;
      case 'timp32': case 'timp29': case 'timp26': case 'timp23': case 'timp': {
        const r = Math.min(w, d) / 2 * 0.92;
        cyl(g, r, r * 0.55, 0.55, '#b87333', 0, 0.42, 0, METAL, 28);
        cyl(g, r * 1.02, r * 1.02, 0.02, '#f3ead7', 0, 0.71, 0, { roughness: 0.9 }, 28);
        [0, 2.1, 4.2].forEach(a => cyl(g, 0.015, 0.015, 0.2, '#666', Math.sin(a) * r * 0.5, 0.1, Math.cos(a) * r * 0.5));
        break;
      }
      case 'marimba': case 'marimba43': box(g, w, 0.06, d * 0.8, '#7a3f22', 0, 0.9, 0); box(g, w * 0.98, 0.5, d * 0.5, '#555', 0, 0.55, 0, METAL); break;
      case 'xylo': case 'vib': case 'glock': case 'keyboard': box(g, w, 0.07, d, color, 0, 0.88, 0, it.type === 'vib' || it.type === 'glock' ? METAL : undefined); box(g, w * 0.9, 0.05, d * 0.7, '#444', 0, 0.3, 0); [-1, 1].forEach(s => box(g, 0.05, 0.6, 0.05, '#555', s * w * 0.4, 0.55, 0)); break;
      case 'chimes': box(g, w, 0.05, 0.05, '#555', 0, 1.9, 0); for (let i = 0; i < 18; i++) cyl(g, 0.02, 0.02, 1.2 - i * 0.03, '#d8dce2', -w / 2 + 0.08 + i * (w - 0.16) / 17, 1.3 - i * 0.015, i % 2 ? 0.06 : -0.06, METAL, 10); [-1, 1].forEach(s => box(g, 0.05, 1.9, 0.05, '#555', s * w / 2, 0.95, 0)); break;
      case 'bd': { const m = cyl(g, 0.45, 0.45, 0.41, '#e8e8e8', 0, 0.75, 0, undefined, 30); m.rotation.z = Math.PI / 2; box(g, 0.1, 0.5, 0.5, '#555', 0, 0.25, 0); break; }
      case 'sd': cyl(g, 0.18, 0.18, 0.14, '#ddd', 0, 0.68, 0, METAL); cyl(g, 0.012, 0.012, 0.6, '#555', 0, 0.3, 0); break;
      case 'cym': cyl(g, 0.23, 0.23, 0.01, '#e0c050', 0, 1.0, 0, METAL); cyl(g, 0.012, 0.012, 1.0, '#555', 0, 0.5, 0); break;
      case 'tam': cyl(g, 0.45, 0.45, 0.02, '#b08a3a', 0, 1.1, 0, METAL).rotation.x = Math.PI / 2; box(g, w, 0.05, 0.05, '#444', 0, 1.65, 0); break;
      case 'drums': { const b = cyl(g, 0.28, 0.28, 0.4, '#c33', 0, 0.3, 0.25); b.rotation.x = Math.PI / 2; cyl(g, 0.18, 0.18, 0.2, '#c33', -0.3, 0.7, 0.1); cyl(g, 0.2, 0.2, 0.22, '#c33', 0.35, 0.5, 0); cyl(g, 0.2, 0.2, 0.01, '#e0c050', -0.5, 1.05, -0.2, METAL); cyl(g, 0.23, 0.23, 0.01, '#e0c050', 0.55, 1.1, -0.2, METAL); break; }
      case 'piano': case 'pianoFull': {
        const sh = new T.Shape();
        const hw = w / 2, hd = d / 2;
        sh.moveTo(-hw, hd); sh.lineTo(-hw, -hd + w * 0.1); sh.quadraticCurveTo(-hw, -hd, -hw + w * 0.25, -hd);
        sh.quadraticCurveTo(hw, -hd + d * 0.02, hw * 0.55, -hd + d * 0.45); sh.quadraticCurveTo(hw, hd * 0.3, hw, hd); sh.lineTo(-hw, hd);
        const geo = new T.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false });
        const m = mesh(geo, '#111', { roughness: 0.25, metalness: 0.1 });
        m.rotation.x = Math.PI / 2; m.position.y = 1.0; g.add(m);
        [[-hw + 0.1, hd - 0.1], [hw - 0.15, hd - 0.1], [0, -hd + 0.4]].forEach(p => cyl(g, 0.05, 0.04, 0.65, '#111', p[0], 0.32, p[1]));
        box(g, w, 0.1, 0.18, '#f5f5f5', 0, 0.72, hd - 0.02);
        const lid = mesh(geo, '#151515', { roughness: 0.25 });
        lid.rotation.x = Math.PI / 2; lid.rotation.z = 0; lid.position.y = 1.0; lid.scale.set(1, 1, 0.05);
        const pivot = new T.Group(); pivot.position.set(-hw, 1.0, 0); lid.position.set(hw, 0, 0); pivot.add(lid); pivot.rotation.z = 0.6; g.add(pivot);
        break;
      }
      case 'upright': box(g, w, 1.25, d, '#1a1a1a', 0, 0.62, 0, { roughness: 0.3 }); break;
      case 'harp': { const b = box(g, 0.08, 1.8, d, '#c9a060', 0, 0.9, 0); b.rotation.x = 0.15; tube(g, [0, 1.75, -d / 2], [0, 1.6, d / 2], 0.04, '#c9a060'); box(g, w, 0.12, 0.35, '#c9a060', 0, 0.06, -d / 3); break; }
      case 'amp': box(g, w, 0.5, d, '#2a2a2a', 0, 0.25, 0); break;
      case 'mic': cyl(g, 0.01, 0.01, 1.5, '#333', 0, 0.75, 0); sph(g, 0.03, '#555', 0, 1.52, 0); break;
      case 'chair': box(g, 0.44, 0.05, 0.42, '#3d4250', 0, 0.45, 0); box(g, 0.44, 0.42, 0.04, '#3d4250', 0, 0.71, -0.2); break;
      case 'stand': case 'cstand': cyl(g, 0.01, 0.01, 1.05, '#444', 0, 0.52, 0); box(g, w, 0.35, 0.015, '#2f333b', 0, 1.12, 0).rotation.x = -0.45; break;
      case 'table': box(g, w, 0.04, d, '#8a6d4a', 0, 0.8, 0); [-1, 1].forEach(sx => [-1, 1].forEach(sz => box(g, 0.04, 0.8, 0.04, '#555', sx * (w / 2 - 0.05), 0.4, sz * (d / 2 - 0.05)))); break;
      case 'circle': cyl(g, w / 2, w / 2, 0.5, color, 0, 0.25, 0); break;
      case 'text': return null;
      default: box(g, w, 0.5, d, color, 0, 0.25, 0);
    }
    return g;
  }

  function labelSprite(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(20,24,32,.78)';
    const r = 30;
    x.beginPath(); x.moveTo(r, 8); x.arcTo(248, 8, 248, 88, r); x.arcTo(248, 88, 8, 88, r); x.arcTo(8, 88, 8, 8, r); x.arcTo(8, 8, 248, 8, r); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 50px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text.slice(0, 8), 128, 50);
    const tex = new T.CanvasTexture(cv);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(0.34, 0.13, 1);
    sp.renderOrder = 10;
    return sp;
  }

  // 平台の高さ：前（客席側）から 20cm, 40cm, 60cm… と上がる（it.hgt があればそれを使う）
  function riserHeights(items) {
    const rs = items.filter(it => it.type === 'riser' || it.type === 'riser46');
    const ys = [...new Set(rs.map(r => Math.round(r.y / 30)))].sort((a, b) => b - a);
    const map = new Map();
    rs.forEach(r => map.set(r, (r.hgt || (ys.indexOf(Math.round(r.y / 30)) + 1) * 20) / 100));
    return map;
  }
  function heightAt(x, y, rh) {
    let h = 0;
    rh.forEach((hh, r) => {
      const a = -(r.rot || 0) * Math.PI / 180;
      const dx = x - r.x, dy = y - r.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= (r.w || 182) / 2 && Math.abs(ly) <= (r.h || 91) / 2) h = Math.max(h, hh);
    });
    return h;
  }

  // ---------------------------------------------------------------- シーン
  function buildScene() {
    const doc = SS.app.doc();
    const o = doc.options;
    V.showStands = o.showStands !== false;
    stageW = doc.stage.w / 100; stageD = doc.stage.d / 100;
    scene = new T.Scene();
    scene.background = new T.Color('#1d1f25');
    scene.fog = new T.Fog('#1d1f25', 30, 70);
    const hemi = new T.HemisphereLight('#fff4e0', '#3a3530', 0.75);
    scene.add(hemi);
    const key = new T.DirectionalLight('#fff1d6', 0.9);
    key.position.set(stageW * 0.3, 14, stageD + 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -stageW; sc.right = stageW; sc.top = stageD; sc.bottom = -stageD; sc.near = 1; sc.far = 60;
    key.target.position.set(stageW / 2, 0, stageD / 2);
    scene.add(key); scene.add(key.target);
    const fill = new T.DirectionalLight('#cfe0ff', 0.35);
    fill.position.set(-5, 8, -4); scene.add(fill);

    // ステージ
    const st = doc.stage;
    const pts = [];
    const W = st.w / 100, D = st.d / 100;
    if (st.shape === 'apron') {
      pts.push([0, 0], [W, 0], [W, D]);
      for (let i = 1; i < 24; i++) { const t = i / 24; const x = W * (1 - t); const y = D + 2 * t * (1 - t) * D * 0.28; pts.push([x, y]); }
      pts.push([0, D]);
    } else if (st.shape === 'trapezoid') pts.push([W * 0.1, 0], [W * 0.9, 0], [W, D], [0, D]);
    else pts.push([0, 0], [W, 0], [W, D], [0, D]);
    const shape = new T.Shape(pts.map(p => new T.Vector2(p[0], p[1])));
    const sg = new T.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false });
    const stageMesh = new T.Mesh(sg, [mat('#b98a55', { roughness: 0.55 }), mat('#3b2a1c')]);
    stageMesh.rotation.x = Math.PI / 2;
    stageMesh.receiveShadow = true;
    scene.add(stageMesh);
    // 床の板目（うすい線）
    const grid = new T.GridHelper(Math.max(W, D) * 2, Math.round(Math.max(W, D) * 2 / 0.9), '#a57a48', '#a57a48');
    grid.position.set(W / 2, 0.002, D / 2);
    grid.material.transparent = true; grid.material.opacity = 0.25;
    scene.add(grid);
    // 奥の壁・横の壁
    const wallH = 9;
    box(scene, W + 2, wallH, 0.3, '#6e5238', W / 2, wallH / 2 - 1, -0.15);
    [-0.15, W + 0.15].forEach(x => box(scene, 0.3, wallH, D + 1, '#5c4530', x, wallH / 2 - 1, D / 2 - 0.5));
    // 客席
    const floor = new T.Mesh(new T.PlaneGeometry(W + 20, 40), mat('#2b2724'));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, -1.0, D + 20); floor.receiveShadow = true;
    scene.add(floor);
    const seatGeo = new T.BoxGeometry(0.5, 0.9, 0.5);
    const seats = [];
    for (let row = 0; row < 18; row++) {
      const z = D + 3 + row * 1.0;
      const y = -1.0 + 0.45 + row * 0.12;
      for (let x = 0.8; x < W - 0.5; x += 0.56) { if (Math.abs(x - W / 2) < 0.6) continue; seats.push([x, y, z]); }
    }
    const inst = new T.InstancedMesh(seatGeo, mat('#7a1f2b', { roughness: 0.8 }), seats.length);
    const m4 = new T.Matrix4();
    seats.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); inst.setMatrixAt(i, m4); });
    scene.add(inst);

    // 部品
    playerGroups = new Map();
    const rh = riserHeights(doc.items);
    const ropts = { colorBy: o.colorBy, figure: true };
    doc.items.forEach(it => {
      const color = SS.itemColor(it, ropts);
      const x = it.x / 100, z = it.y / 100;
      const rot = -(it.rot || 0) * Math.PI / 180;
      if (it.type === 'player') {
        const base = heightAt(it.x, it.y, rh);
        const p = makePlayer(it, color === '#ffffff' ? '#8c96a8' : color);
        p.g.position.set(x, base, z);
        p.g.rotation.y = rot;
        if (it.label) {
          const sp = labelSprite(it.label);
          sp.position.set(0, 1.75, 0);
          sp.userData.isLabel = true;
          sp.visible = labelsOn;
          p.g.add(sp);
        }
        p.g.userData.playerId = it.id;
        scene.add(p.g);
        playerGroups.set(it.id, { g: p.g, head: p.head, it, base });
      } else {
        const g = makeItem(it, color, rh.get(it) || 0.2);
        if (!g) return;
        const base = (it.type === 'riser' || it.type === 'riser46') ? 0 : heightAt(it.x, it.y, rh);
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
      const standing = kind === 'perc' || kind === 'bass';
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
    matCache.forEach(m => m.dispose());
    matCache.clear();
    scene = null;
  }

  let bound = false;
  V.open = async function (playerId) {
    $('view3d').classList.remove('hidden');
    $('v3loading').hidden = false;
    $('v3loading').textContent = '3Dを準備しています…';
    try {
      T = await loadThree();
    } catch (err) {
      $('v3loading').textContent = err.message;
      return;
    }
    const cv = $('c3d');
    if (!renderer) {
      renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
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
      $('v3close').onclick = V.close;
      $('v3labels').onchange = e => {
        labelsOn = e.target.checked;
        scene && scene.traverse(o => { if (o.userData && o.userData.isLabel) o.visible = labelsOn; });
      };
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('view3d').classList.contains('hidden')) V.close(); });
    }
    disposeScene();
    buildScene();
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
