/* ブラウザ内の保存（localStorage）を安全に読み書きする
 *
 * - 書けなかった（容量いっぱい・プライベートモードなど）ときは例外を投げずに false を返す
 * - 読んだデータが壊れていたら、黙って捨てずに「壊れたデータの置き場」へ写してから空として扱う
 *   （そのまま上書きすると、元に戻せなくなるため）
 * - 自動保存を置き換える前に、ひとつ前の配置図を「前に開いていた配置図」として取っておく
 */
window.SS = window.SS || {};

(function (SS) {
  'use strict';
  const BROKEN_PREFIX = 'stagesetting.broken.';
  const BACKUP_KEY = 'stagesetting.autosave.prev.v1';

  const ls = () => { try { return window.localStorage; } catch (e) { return null; } };

  function getRaw(key) {
    const s = ls();
    if (!s) return null;
    try { return s.getItem(key); } catch (e) { return null; }
  }
  function setRaw(key, value) {
    const s = ls();
    if (!s) return false;
    try { s.setItem(key, value); return true; } catch (e) { return false; }
  }
  function remove(key) {
    const s = ls();
    if (!s) return;
    try { s.removeItem(key); } catch (e) { /* ignore */ }
  }

  // 壊れたデータを取っておく（同じ key の壊れたデータは最新の1つだけ）。容量が足りないときは何もしない
  function quarantine(key, raw) {
    if (raw == null || raw === '') return false;
    return setRaw(BROKEN_PREFIX + key, JSON.stringify({ key, date: Date.now(), raw }));
  }

  // JSON を読む。valid(value) が false のときと、JSON として読めないときは壊れたデータとして取っておく
  // 戻り値：{ value, broken }（データがないときは value: fallback, broken: false）
  function readJSON(key, valid, fallback) {
    const raw = getRaw(key);
    if (raw == null || raw === '') return { value: fallback, broken: false };
    let v;
    try { v = JSON.parse(raw); } catch (e) { quarantine(key, raw); return { value: fallback, broken: true }; }
    if (valid && !valid(v)) { quarantine(key, raw); return { value: fallback, broken: true }; }
    return { value: v, broken: false };
  }

  // JSON を書く。書けたら true
  function writeJSON(key, value) {
    let s;
    try { s = JSON.stringify(value); } catch (e) { return false; }
    return setRaw(key, s);
  }

  const isDoc = d => !!d && typeof d === 'object' && Array.isArray(d.items);

  // いまの自動保存を「前に開いていた配置図」として取っておく（別の配置図で置き換える前に呼ぶ）
  // 同じ中身ならとっておき直さない。取っておけたら true
  function backupAutosave(autosaveKey, reason) {
    const raw = getRaw(autosaveKey);
    if (!raw) return false;
    let d;
    try { d = JSON.parse(raw); } catch (e) { return false; }
    if (!isDoc(d)) return false;
    const prev = getRaw(BACKUP_KEY);
    if (prev) { try { if (JSON.parse(prev).raw === raw) return true; } catch (e) { /* 壊れていれば上書きしてよい */ } }
    return setRaw(BACKUP_KEY, JSON.stringify({ date: Date.now(), reason: reason || '', raw }));
  }
  // 取っておいた「前に開いていた配置図」{ date, reason, doc }（なければ null）
  function readBackup() {
    const r = readJSON(BACKUP_KEY, v => v && typeof v.raw === 'string', null);
    if (!r.value) return null;
    try { const d = JSON.parse(r.value.raw); return isDoc(d) ? { date: r.value.date, reason: r.value.reason, doc: d } : null; } catch (e) { return null; }
  }

  // 取っておいた壊れたデータ（ファイルにして渡せるように）
  function brokenEntries() {
    const s = ls(), out = [];
    if (!s) return out;
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(BROKEN_PREFIX)) { try { out.push(JSON.parse(s.getItem(k))); } catch (e) { /* ignore */ } }
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  SS.store = { getRaw, setRaw, remove, readJSON, writeJSON, quarantine, isDoc, backupAutosave, readBackup, brokenEntries, BACKUP_KEY, BROKEN_PREFIX };
})(window.SS);
