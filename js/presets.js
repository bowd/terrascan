// presets.js — save / load / delete named configuration presets, with one markable
// as the default that auto-applies on page load. Persisted in localStorage as a single
// JSON blob. Deliberately defensive: a malformed/old blob never throws, it just resets.
const KEY = 'terrascan_presets';

// shape on disk: { presets:[{id,name,settings}], defaultId, seq }
// `seq` is a monotonically-increasing integer counter so ids never collide (no Date.now/random).
function emptyBlob() { return { presets: [], defaultId: null, seq: 0 }; }

function readBlob() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return emptyBlob(); }
  if (!raw) return emptyBlob();
  let b;
  try { b = JSON.parse(raw); } catch (e) { return emptyBlob(); }
  if (!b || typeof b !== 'object' || !Array.isArray(b.presets)) return emptyBlob();
  // sanitise rows: keep only well-formed {id,name,settings}
  const presets = b.presets.filter(p =>
    p && typeof p === 'object' && p.id != null && typeof p.name === 'string' && p.settings && typeof p.settings === 'object');
  let seq = Number.isInteger(b.seq) ? b.seq : 0;
  // make sure seq is past every existing numeric id so we never reissue one
  for (const p of presets) { const n = +p.id; if (Number.isFinite(n) && n >= seq) seq = n + 1; }
  const defaultId = presets.some(p => p.id === b.defaultId) ? b.defaultId : null;
  return { presets, defaultId, seq };
}

function writeBlob(b) {
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) { /* storage full / blocked — ignore */ }
}

export function makePresets({ capture, apply }) {
  function list() {
    // return shallow copies so callers can't mutate the stored rows
    return readBlob().presets.map(p => ({ id: p.id, name: p.name }));
  }
  function getDefaultId() { return readBlob().defaultId; }

  function save(name) {
    const b = readBlob();
    const id = 'p' + b.seq;            // string id derived from the persisted counter
    b.seq += 1;
    let nm = (name || '').trim();
    if (!nm) nm = 'Preset ' + (b.presets.length + 1);
    let settings = null;
    try { settings = capture(); } catch (e) { settings = null; }
    if (!settings) return null;
    b.presets.push({ id, name: nm, settings });
    writeBlob(b);
    return id;
  }

  function load(id) {
    const b = readBlob();
    const p = b.presets.find(x => x.id === id);
    if (!p) return false;
    try { apply(p.settings); } catch (e) { return false; }
    return true;
  }

  function remove(id) {
    const b = readBlob();
    b.presets = b.presets.filter(p => p.id !== id);
    if (b.defaultId === id) b.defaultId = null;
    writeBlob(b);
  }

  function setDefault(id) {
    const b = readBlob();
    // toggle: clicking the current default clears it
    b.defaultId = (b.defaultId === id) ? null : (b.presets.some(p => p.id === id) ? id : b.defaultId);
    writeBlob(b);
  }

  function applyDefault() {
    const b = readBlob();
    if (b.defaultId == null) return false;
    const p = b.presets.find(x => x.id === b.defaultId);
    if (!p) return false;
    try { apply(p.settings); } catch (e) { return false; }
    return true;
  }

  return { list, save, load, remove, setDefault, getDefaultId, applyDefault };
}
