// dataengine.js — pure-JS (no THREE, no DOM) runtime ensemble combiner.
//
// Holds several per-model seismic tomography volumes on a COMMON grid and, in
// real time, combines the ENABLED ones into (a) a single mean %-anomaly field
// and (b) a cross-model AGREEMENT field. This is the live-toggle counterpart to
// the build-time ensemble baked by build-tomo.mjs: same combine spirit, but the
// UI can flip individual models / whole kinds in or out and re-mix on the fly.
//
// Grid & indexing (shared with the rest of the build):
//   grid  = { nlon, nlat, ndep, depths:[km...], dvsScale }
//   model = { name, kind:'S'|'P', dvs:Int8Array(ndep*nlat*nlon) }
//   value% at cell k  =  dvs[k] / dvsScale       (exactly 0 ⇒ "no data" here)
//   cell index        k = (di*nlat + j)*nlon + i   (i lon, j lat, di depth)

const GLOBAL_TARGET_RMS = 1.0; // fixed reference amplitude for RMS normalization
const STRONG_MIN = 0.15;       // |v|% above which a cell "votes" fast/slow
const CONSENSUS_AGREE = 0.78;  // agreement when too few models vote strongly

export function makeDataEngine({ grid, models }) {
  const { nlon, nlat, ndep, depths, dvsScale } = grid;
  const N = ndep * nlat * nlon;

  // Per-model runtime state. Precompute RMS over each model's non-zero cells
  // once at construction and cache it (used for normalize-ON scaling).
  const entries = models.map((m) => ({
    name: m.name,
    kind: m.kind,
    dvs: m.dvs,
    enabled: true,
    rms: computeRms(m.dvs, dvsScale),
  }));

  let normalize = true;

  // Output buffers — allocated once and overwritten on every combined() call so
  // we never churn GC. combined() always returns these same two arrays.
  const outDvs = new Float32Array(N);
  const outAgree = new Float32Array(N);

  // Scratch accumulators, also reused across calls (sized once).
  const sum = new Float32Array(N);   // running Σ of contributions
  const cnt = new Int32Array(N);     // # enabled models with data at the cell
  const pos = new Int32Array(N);     // # strong-positive (fast) votes
  const neg = new Int32Array(N);     // # strong-negative (slow) votes

  function findEntry(name) {
    return entries.find((e) => e.name === name);
  }

  function list() {
    return entries.map((e) => ({ name: e.name, kind: e.kind, enabled: e.enabled }));
  }

  function setEnabled(name, on) {
    const e = findEntry(name);
    if (e) e.enabled = !!on;
  }

  function enableKind(kind, on) {
    for (const e of entries) if (e.kind === kind) e.enabled = !!on;
  }

  function setNormalize(on) {
    normalize = !!on;
  }

  function params() {
    return { normalize };
  }

  function combined() {
    const active = entries.filter((e) => e.enabled);

    // Defensive: nothing enabled ⇒ zero-filled fields (no divide-by-zero).
    if (active.length === 0) {
      outDvs.fill(0);
      outAgree.fill(0);
      return { nlon, nlat, ndep, depths, dvs: outDvs, agree: outAgree };
    }

    sum.fill(0);
    cnt.fill(0);
    pos.fill(0);
    neg.fill(0);

    // Single pass: enabled models × cells. Per-model scale folds the optional
    // RMS normalization in so high- and low-amplitude models contribute alike.
    for (const e of active) {
      const dvs = e.dvs;
      const scale = normalize
        ? (e.rms > 0 ? GLOBAL_TARGET_RMS / e.rms : 0) / dvsScale
        : 1 / dvsScale;
      for (let k = 0; k < N; k++) {
        const raw = dvs[k];
        if (raw === 0) continue;       // exact 0 ⇒ no data; skip this model here
        const v = raw / dvsScale;      // decoded percent (for the |v| vote test)
        sum[k] += raw * scale;         // normalized (or raw-percent) contribution
        cnt[k]++;
        if (v > STRONG_MIN) pos[k]++;
        else if (v < -STRONG_MIN) neg[k]++;
      }
    }

    for (let k = 0; k < N; k++) {
      const n = cnt[k];
      if (n === 0) {
        outDvs[k] = 0;
        outAgree[k] = 0;
        continue;
      }
      outDvs[k] = sum[k] / n;

      const p = pos[k];
      const ng = neg[k];
      const strong = p + ng;
      let ag;
      if (strong < n * 0.5) ag = CONSENSUS_AGREE; // too few votes ⇒ ordinary mantle
      else ag = Math.max(p, ng) / strong;          // sign agreement among the votes
      outAgree[k] = ag < 0 ? 0 : ag > 1 ? 1 : ag;   // clamp 0..1
    }

    return { nlon, nlat, ndep, depths, dvs: outDvs, agree: outAgree };
  }

  return { list, setEnabled, enableKind, setNormalize, params, combined };
}

// RMS of a model over its non-zero (data-bearing) cells, in PERCENT units.
function computeRms(dvs, dvsScale) {
  let ss = 0, n = 0;
  for (let k = 0; k < dvs.length; k++) {
    const raw = dvs[k];
    if (raw === 0) continue; // exact 0 ⇒ no data; excluded from the RMS
    const v = raw / dvsScale;
    ss += v * v;
    n++;
  }
  return n === 0 ? 0 : Math.sqrt(ss / n);
}
