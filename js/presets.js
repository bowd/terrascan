// presets.js — save / load / delete named configuration presets, with one markable
// as the default that auto-applies on page load. Persisted in localStorage as a single
// JSON blob. Deliberately defensive: a malformed/old blob never throws, it just resets.
const KEY = 'terrascan_presets';

// A baked-in default preset (URL-safe base64 of a settings object). When the user has
// no default of their own, this is applied on load. Paste a "Copy share link" payload
// (the part after ?p=) here to set the public default. Empty = no baked default.
const BUILTIN_DEFAULT = 'eyJ2IjoxLCJkZXB0aCI6LTEwLCJjb2xvck1vZGUiOiJkdnMiLCJzb3VyY2UiOiJyZWFsIiwiZm9jdXNCbGVuZCI6MSwidG9nZ2xlcyI6eyJzdHJ1Y3QiOnRydWUsImJvZGllcyI6dHJ1ZSwic2NhbiI6dHJ1ZSwiaW5mZXIiOmZhbHNlLCJ0aGVvcnkiOnRydWUsInJlbGllZiI6dHJ1ZSwiY29hc3QiOnRydWUsImJvcmRlcnMiOnRydWUsIm1hcmtlcnMiOnRydWUsImZvb3QiOmZhbHNlLCJleHAiOnRydWUsInNwaW4iOmZhbHNlLCJkcmlsbCI6ZmFsc2UsImN1dGF3YXkiOmZhbHNlLCJwZWVsIjp0cnVlfSwiZGlhbHMiOnsicmVsaWVmT3BhY2l0eSI6MSwicmVsaWVmQnJpZ2h0IjowLjkyOTk5OTk5OTk5OTk5OTksImNvYXN0T3BhY2l0eSI6MSwic2NhblN0cmVuZ3RoIjowLjYzLCJzY2FuR2FpbiI6MC40MSwic2NhbkZsb29yIjowLjIxLCJtb2RlbEdhaW4iOjAuOCwibW9kZWxIYXplIjowLjg1LCJib2R5T3BhY2l0eSI6MSwiZmVhdE9wYWNpdHkiOjAuNDYwMDAwMDAwMDAwMDAwMSwiYm9keUdsb3ciOjAuNjEsImJvZHlTaXplIjowLCJkYXRhTGluayI6MCwiZm9jdXNCYW5kIjowfSwiY2x1c3RlciI6eyJ0aHJlc2hvbGQiOjAuODQsInNtb290aCI6MSwiYWdyZWVNaW4iOjEsInN0cmF0ZWd5Ijoid2lyZSJ9LCJub3JtYWxpemUiOnRydWUsIm1vZGVscyI6W3sibmFtZSI6IlNHTE9CRS1yYW5pIiwiZW5hYmxlZCI6dHJ1ZX0seyJuYW1lIjoiUzQwUlRTIiwiZW5hYmxlZCI6dHJ1ZX0seyJuYW1lIjoiUzIwUlRTIiwiZW5hYmxlZCI6dHJ1ZX0seyJuYW1lIjoiU0VJU0dMT0IyIiwiZW5hYmxlZCI6dHJ1ZX0seyJuYW1lIjoiU0VNVUNCLVdNMSIsImVuYWJsZWQiOnRydWV9LHsibmFtZSI6IlRYMjAxMSIsImVuYWJsZWQiOnRydWV9LHsibmFtZSI6IlRYMjAwMCIsImVuYWJsZWQiOnRydWV9LHsibmFtZSI6IlNQMTJSVFMiLCJlbmFibGVkIjp0cnVlfSx7Im5hbWUiOiJTUGFuaSIsImVuYWJsZWQiOnRydWV9LHsibmFtZSI6IkhNU0wtUzA2IiwiZW5hYmxlZCI6dHJ1ZX0seyJuYW1lIjoiR0FQX1A0IiwiZW5hYmxlZCI6dHJ1ZX0seyJuYW1lIjoiTUlUUDA4IiwiZW5hYmxlZCI6dHJ1ZX0seyJuYW1lIjoiTExOTC1HM0R2MyIsImVuYWJsZWQiOnRydWV9LHsibmFtZSI6IlNQMTJSVFMtUCIsImVuYWJsZWQiOnRydWV9XX0';

// ---- share encoding: a settings object <-> compact URL-safe base64 -------------
export function encodeSettings(obj){
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  catch(e){ return ''; }
}
export function decodeSettings(str){
  try { let s=String(str).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='=';
    const o=JSON.parse(decodeURIComponent(escape(atob(s))));
    return (o && typeof o==='object') ? o : null; }
  catch(e){ return null; }
}

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
    if (b.defaultId != null) {
      const p = b.presets.find(x => x.id === b.defaultId);
      if (p) { try { apply(p.settings); return true; } catch (e) {} }
    }
    // fall back to the baked-in public default
    if (BUILTIN_DEFAULT) { const s = decodeSettings(BUILTIN_DEFAULT); if (s) { try { apply(s); return true; } catch (e) {} } }
    return false;
  }

  // a shareable URL-safe base64 of the CURRENT settings
  function shareString() { try { return encodeSettings(capture()); } catch (e) { return ''; } }
  // apply a settings payload that arrived via a share link / pasted string
  function applyShareString(str) { const s = decodeSettings(str); if (!s) return false; try { apply(s); } catch (e) { console.warn('applyShareString failed', e); return false; } return true; }

  return { list, save, load, remove, setDefault, getDefaultId, applyDefault, shareString, applyShareString };
}
