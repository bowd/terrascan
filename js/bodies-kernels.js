// bodies-kernels.js — PURE-NUMERIC hot kernels for the data-bodies rebuild.
//
// This module imports NOTHING (no three, no DOM). It is the heavy-lifting half of
// databodies.js, extracted so it can run in a Web Worker (which can't resolve the
// bare 'three' specifier from the import map) OR synchronously on the main thread as
// a fallback. Everything in/out is plain numbers and TypedArrays — databodies.js
// turns the returned arrays into THREE BufferGeometry / InstancedMesh objects.
//
// Grid & indexing match dataengine.js:  cell index k = (di*nlat + j)*nlon + i.
//
// The implementations are the *flat typed-array* rewrites the migration
// investigation proved (cluster blur ~33×, Surface Nets ~2.3×): no per-cell
// closures, no array-of-arrays neighbour lists, no growable [].push in the hot loop.

export const EARTH_RADIUS = 6371; // km (mirror of earthModel.js; kept local so this module imports nothing)
export const depthToUnit = (d) => (EARTH_RADIUS - d) / EARTH_RADIUS;
const D2R = Math.PI / 180;

// Plain-number latLonToVec3 (geo.js returns a THREE.Vector3; here we return a flat triple).
function latLonToVec3(lat, lon, r, out) {
  const la = lat * D2R, lo = lon * D2R, cl = Math.cos(la);
  out[0] = -Math.cos(lo) * cl * r;
  out[1] = Math.sin(la) * r;
  out[2] = Math.sin(lo) * cl * r;
  return out;
}

// ---- clustering pipeline: blur the signed field, then gate by agreement ----------
// FLAT rewrite of databodies.cluster(): ping-pong typed arrays, hoisted plane stride,
// branch-based wrap, no closures and no per-cell `nb` array-of-arrays.
// Returns { sm:Float32Array, agreeArr:Float32Array, nlon, nlat, nd, depths } or null.
export function cluster(f, p) {
  if (!f || !f.dvs || !f.depths || !f.depths.length) return null;
  const nlon = f.nlon, nlat = f.nlat, nd = (f.ndep != null ? f.ndep : f.depths.length);
  if (!nlon || !nlat || !nd) return null;
  const N = nd * nlat * nlon;
  if (f.dvs.length < N) return null;

  const rawAgree = f.agree;
  const agreeArr = new Float32Array(N);
  for (let k = 0; k < N; k++) { let a = rawAgree ? rawAgree[k] : 1; if (a > 1.0001) a /= 255; agreeArr[k] = a; }

  let src = new Float32Array(N);
  const fdvs = f.dvs;
  for (let k = 0; k < N; k++) src[k] = fdvs[k];

  const iters = Math.max(0, Math.round(p.smooth || 0));
  if (iters > 0) {
    let dst = new Float32Array(N);
    const planeStride = nlat * nlon;
    for (let it = 0; it < iters; it++) {
      for (let di = 0; di < nd; di++) {
        // depth neighbours are clamped (no wrap): contribute only when in range
        const dm = di > 0 ? -planeStride : 0;       // step to di-1 plane (0 ⇒ none)
        const dp = di < nd - 1 ? planeStride : 0;   // step to di+1 plane
        const base = di * planeStride;
        for (let j = 0; j < nlat; j++) {
          const jm = j > 0 ? j - 1 : nlat - 1;      // lat wraps (matches (j+nlat)%nlat)
          const jp = j < nlat - 1 ? j + 1 : 0;
          const row = base + j * nlon, rowM = base + jm * nlon, rowP = base + jp * nlon;
          for (let i = 0; i < nlon; i++) {
            const im = i > 0 ? i - 1 : nlon - 1;     // lon wraps
            const ip = i < nlon - 1 ? i + 1 : 0;
            let s = src[row + i] * 0.4, w = 0.4;
            if (dm) { s += src[row + i + dm] * 0.1; w += 0.1; }
            if (dp) { s += src[row + i + dp] * 0.1; w += 0.1; }
            s += src[rowM + i] * 0.1; s += src[rowP + i] * 0.1; w += 0.2;
            s += src[row + im] * 0.1; s += src[row + ip] * 0.1; w += 0.2;
            dst[row + i] = s / w;
          }
        }
      }
      const t = src; src = dst; dst = t; // ping-pong; dst becomes scratch for next pass
    }
  }
  return { sm: src, agreeArr, nlon, nlat, nd, depths: f.depths };
}

// ---- shared world warp: padded grid dims + per-coord world mapping ---------------
// Mirror of databodies.makeWarp(): pads lat by 2 and depth by 2, lon by 1 (wrap seam).
function makeWarp(c) {
  const { nlon, nlat, nd, depths } = c;
  const PLAT = new Float64Array(nlat + 2);
  PLAT[0] = 92; for (let m = 0; m < nlat; m++) PLAT[m + 1] = 90 - (m + 0.5) / nlat * 180; PLAT[nlat + 1] = -92;
  const PDEP = new Float64Array(nd + 2);
  PDEP[0] = depths[0] - 80; for (let m = 0; m < nd; m++) PDEP[m + 1] = depths[m]; PDEP[nd + 1] = depths[nd - 1] + 80;
  const NX = nlon + 1, NY = nlat + 2, NZ = nd + 2;
  return { NX, NY, NZ, PLAT, PDEP, nlon };
}
function interp(arr, fr) {
  let i0 = Math.floor(fr);
  if (i0 < 0) i0 = 0; else if (i0 > arr.length - 2) i0 = arr.length - 2;
  return arr[i0] + (arr[i0 + 1] - arr[i0]) * (fr - i0);
}
// world coords + normalized depth for one fractional grid point (writes into `out` triple, returns depthFrac)
function warpToWorld(w, fx, fy, fz, out) {
  const lon = -180 + (fx + 0.5) / w.nlon * 360;
  let lat = interp(w.PLAT, fy); if (lat < -89.9) lat = -89.9; else if (lat > 89.9) lat = 89.9;
  let depth = interp(w.PDEP, fz); if (depth < 8) depth = 8; else if (depth > 2950) depth = 2950;
  latLonToVec3(lat, lon, depthToUnit(depth), out);
  return depth / EARTH_RADIUS;
}

// ---- pre-sample the signed iso field ONCE into a flat array ----------------------
// Replaces the per-cell `field(x,y,z)` closure that the original re-evaluated ~8×
// per cell (sample pass) + 4× per cell (quad pass). One scan over the padded grid.
//   sign[idx] : 1 if field<0 (inside), 0 otherwise  (Uint8 — used for masks & quads)
//   val[idx]  : the actual field value (Float32 — used for vertex placement)
// Padding cells and agreement-gated cells get the sentinel -1000 (so sign=1).
function presampleField(c, p, sign, NX, NY, NZ) {
  const { sm, agreeArr, nlon, nlat } = c, agreeMin = p.agreeMin, thr = p.threshold;
  const M = NX * NY * NZ;
  const signMap = new Uint8Array(M);
  const valMap = new Float32Array(M);
  const planeStride = nlat * nlon;
  let idx = 0;
  for (let z = 0; z < NZ; z++) {
    const zEdge = (z === 0 || z === NZ - 1);
    const diBase = (z - 1) * planeStride;        // valid only when !zEdge
    for (let y = 0; y < NY; y++) {
      const yEdge = (y === 0 || y === NY - 1);
      const jBase = diBase + (y - 1) * nlon;      // valid only when !yEdge && !zEdge
      const edge = zEdge || yEdge;
      for (let x = 0; x < NX; x++, idx++) {
        if (edge) { valMap[idx] = -1000; signMap[idx] = 1; continue; }
        const i = x < nlon ? x : x - nlon;        // x%nlon (x in [0,nlon] so at most one wrap)
        const k = jBase + i;
        let v;
        if (agreeArr[k] < agreeMin) v = -1000;
        else v = sign * sm[k] - thr;
        valMap[idx] = v;
        signMap[idx] = v < 0 ? 1 : 0;
      }
    }
  }
  return { signMap, valMap };
}

// table-free Surface Nets corner/edge tables
const CORNER = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
const EDGE = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
// flat copies (avoid array-of-arrays indexing in the hot loop)
const CX = new Int8Array(8), CY = new Int8Array(8), CZ = new Int8Array(8);
for (let c = 0; c < 8; c++) { CX[c] = CORNER[c][0]; CY[c] = CORNER[c][1]; CZ[c] = CORNER[c][2]; }
const EA = new Int8Array(12), EB = new Int8Array(12);
for (let e = 0; e < 12; e++) { EA[e] = EDGE[e][0]; EB[e] = EDGE[e][1]; }
// corner offsets in flat-index terms, given strides — filled per call

// ---- FLAT Surface Nets ------------------------------------------------------------
// Pre-sampled sign/val fields + emit straight into pre-sized typed arrays (no push).
// Returns { pos:Float32Array, dep:Float32Array, idx:Uint32Array } (exact-length views).
export function surfaceNets(c, p, sign) {
  const w = makeWarp(c);
  const NX = w.NX, NY = w.NY, NZ = w.NZ;
  const { signMap, valMap } = presampleField(c, p, sign, NX, NY, NZ);

  const sliceStride = NX * NY;                 // idx = (z*NY + y)*NX + x = z*sliceStride + y*NX + x
  const cellVert = new Int32Array(NX * NY * NZ); cellVert.fill(-1);
  // flat per-corner index offsets for a cell at (x,y,z): off = oz*sliceStride + oy*NX + ox
  const cOff = new Int32Array(8);
  for (let cc = 0; cc < 8; cc++) cOff[cc] = CZ[cc] * sliceStride + CY[cc] * NX + CX[cc];

  // upper bound on vertices = number of active cells <= total cells; size generously, then subarray.
  const maxV = (NX - 1) * (NY - 1) * (NZ - 1);
  const pos = new Float32Array(maxV * 3);
  const dep = new Float32Array(maxV);
  let pc = 0;                                  // vertex cursor
  const g = new Float64Array(8);
  const wOut = new Float64Array(3);

  // --- vertex pass ---
  for (let z = 0; z < NZ - 1; z++) {
    for (let y = 0; y < NY - 1; y++) {
      let base = z * sliceStride + y * NX;     // idx of (x=0,y,z)
      for (let x = 0; x < NX - 1; x++, base++) {
        let mask = 0;
        // corner signs from the pre-sampled flat map
        if (signMap[base + cOff[0]]) mask |= 1;
        if (signMap[base + cOff[1]]) mask |= 2;
        if (signMap[base + cOff[2]]) mask |= 4;
        if (signMap[base + cOff[3]]) mask |= 8;
        if (signMap[base + cOff[4]]) mask |= 16;
        if (signMap[base + cOff[5]]) mask |= 32;
        if (signMap[base + cOff[6]]) mask |= 64;
        if (signMap[base + cOff[7]]) mask |= 128;
        if (mask === 0 || mask === 255) continue;
        // pull the 8 corner values
        for (let cc = 0; cc < 8; cc++) g[cc] = valMap[base + cOff[cc]];
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (let e = 0; e < 12; e++) {
          const a = EA[e], b = EB[e], ga = g[a], gb = g[b];
          if ((ga < 0) === (gb < 0)) continue;
          const t = ga / (ga - gb);
          sx += CX[a] + (CX[b] - CX[a]) * t;
          sy += CY[a] + (CY[b] - CY[a]) * t;
          sz += CZ[a] + (CZ[b] - CZ[a]) * t;
          cnt++;
        }
        const d = warpToWorld(w, x + sx / cnt, y + sy / cnt, z + sz / cnt, wOut);
        cellVert[base] = pc;
        pos[pc * 3] = wOut[0]; pos[pc * 3 + 1] = wOut[1]; pos[pc * 3 + 2] = wOut[2];
        dep[pc] = d;
        pc++;
      }
    }
  }

  // --- quad pass: each face crossing -> 2 triangles (6 indices) ---
  const idxMax = pc * 18;                      // generous upper bound (3 faces × 6 idx per cell)
  const idx = new Uint32Array(idxMax);
  let ic = 0;
  // neighbour index offsets (flat)
  const oX = 1, oY = NX, oZ = sliceStride;
  for (let z = 1; z < NZ - 1; z++) {
    for (let y = 1; y < NY - 1; y++) {
      let here = z * sliceStride + y * NX + 1; // idx of (x=1,y,z)
      for (let x = 1; x < NX - 1; x++, here++) {
        const v0 = signMap[here];
        // +X face
        if (v0 !== signMap[here + oX]) {
          const a = cellVert[here], b = cellVert[here - oY], cc = cellVert[here - oY - oZ], dd = cellVert[here - oZ];
          if (a >= 0 && b >= 0 && cc >= 0 && dd >= 0) {
            idx[ic++] = a; idx[ic++] = b; idx[ic++] = dd; idx[ic++] = b; idx[ic++] = cc; idx[ic++] = dd;
          }
        }
        // +Y face
        if (v0 !== signMap[here + oY]) {
          const a = cellVert[here], b = cellVert[here - oZ], cc = cellVert[here - oX - oZ], dd = cellVert[here - oX];
          if (a >= 0 && b >= 0 && cc >= 0 && dd >= 0) {
            idx[ic++] = a; idx[ic++] = b; idx[ic++] = dd; idx[ic++] = b; idx[ic++] = cc; idx[ic++] = dd;
          }
        }
        // +Z face
        if (v0 !== signMap[here + oZ]) {
          const a = cellVert[here], b = cellVert[here - oX], cc = cellVert[here - oX - oY], dd = cellVert[here - oY];
          if (a >= 0 && b >= 0 && cc >= 0 && dd >= 0) {
            idx[ic++] = a; idx[ic++] = b; idx[ic++] = dd; idx[ic++] = b; idx[ic++] = cc; idx[ic++] = dd;
          }
        }
      }
    }
  }

  return {
    pos: pos.subarray(0, pc * 3),
    dep: dep.subarray(0, pc),
    idx: idx.subarray(0, ic),
  };
}

// ---- 'surfaces'/'wire' numeric build: both signs as flat arrays --------------------
// Returns { posFast, depFast, idxFast, posSlow, depSlow, idxSlow } (any may be empty).
export function buildIsoArrays(c, p) {
  const fast = surfaceNets(c, p, +1);
  const slow = surfaceNets(c, p, -1);
  return {
    posFast: fast.pos, depFast: fast.dep, idxFast: fast.idx,
    posSlow: slow.pos, depSlow: slow.dep, idxSlow: slow.idx,
  };
}

// ---- 'points' numeric build -------------------------------------------------------
// One translucent blob per qualifying cell (subsampled). Instance transform is a pure
// translation (identity rotation, unit scale), so we write the 16-float column-major
// matrix directly (only the translation row differs from identity).
// Returns { matFast, depFast, magFast, matSlow, depSlow, magSlow } (Float32Arrays).
export function buildPointsArrays(c, p) {
  const { sm, agreeArr, nlon, nlat, nd, depths } = c, agreeMin = p.agreeMin, thr = p.threshold;
  const STEP = 2;
  const pp = new Float64Array(3);
  const collect = (sign) => {
    // worst-case count = all subsampled cells over all depths
    const cap = nd * Math.ceil(nlat / STEP) * Math.ceil(nlon / STEP);
    const mat = new Float32Array(cap * 16);
    const depA = new Float32Array(cap);
    const magA = new Float32Array(cap);
    let n = 0;
    for (let di = 0; di < nd; di++) {
      const depth = depths[di], r = depthToUnit(depth), ad = depth / EARTH_RADIUS;
      const planeBase = di * nlat * nlon;
      for (let j = 0; j < nlat; j += STEP) {
        const rowBase = planeBase + j * nlon;
        const lat = 90 - (j + 0.5) / nlat * 180;
        for (let i = 0; i < nlon; i += STEP) {
          const k = rowBase + i, v = sm[k], ag = agreeArr[k];
          if (ag < agreeMin) continue;
          if (sign > 0 ? v <= thr : v >= -thr) continue;
          const lon = -180 + (i + 0.5) / nlon * 360;
          latLonToVec3(lat, lon, r, pp);
          const o = n * 16;
          // column-major identity with translation in elements 12..14
          mat[o] = 1; mat[o + 5] = 1; mat[o + 10] = 1; mat[o + 15] = 1;
          mat[o + 12] = pp[0]; mat[o + 13] = pp[1]; mat[o + 14] = pp[2];
          depA[n] = ad;
          magA[n] = Math.min(1, Math.abs(v) * ag);
          n++;
        }
      }
    }
    return {
      mat: mat.subarray(0, n * 16),
      dep: depA.subarray(0, n),
      mag: magA.subarray(0, n),
    };
  };
  const fast = collect(+1), slow = collect(-1);
  return {
    matFast: fast.mat, depFast: fast.dep, magFast: fast.mag,
    matSlow: slow.mat, depSlow: slow.dep, magSlow: slow.mag,
  };
}

// ---- 'volume' numeric build -------------------------------------------------------
// Radially-stretched blob per qualifying cell. Reproduces, in flat math, the original:
//   dir = normalize(pos); q = setFromUnitVectors(up=(0,1,0), dir); scale=(latS,radH,latS)
//   matrix = compose(pos, q, scale)        (== THREE.Object3D.updateMatrix)
// Returns { matFast, depFast, magFast, matSlow, depSlow, magSlow } (Float32Arrays).
const EPS = Number.EPSILON;
function quatFromUp(dx, dy, dz, q) {
  // vFrom = (0,1,0), vTo = (dx,dy,dz) (already unit). Mirror THREE.Quaternion.setFromUnitVectors.
  let r = dy + 1;                              // vFrom·vTo + 1 = dy + 1
  let qx, qy, qz, qw;
  if (r < EPS) {
    r = 0;
    // |vFrom.x|=0 is NOT > |vFrom.z|=0, so the else-branch of three's code runs:
    //   x=0, y=-vFrom.z=0, z=vFrom.y=1, w=0
    qx = 0; qy = 0; qz = 1; qw = 0;
  } else {
    // cross(vFrom, vTo) with vFrom=(0,1,0):
    //   x = 1*dz - 0*dy = dz ; y = 0*dx - 0*dz = 0 ; z = 0*dy - 1*dx = -dx
    qx = dz; qy = 0; qz = -dx; qw = r;
  }
  // normalize
  let len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (len === 0) { q[0] = 0; q[1] = 0; q[2] = 0; q[3] = 1; }
  else { const inv = 1 / len; q[0] = qx * inv; q[1] = qy * inv; q[2] = qz * inv; q[3] = qw * inv; }
  return q;
}
function compose(mat, o, px, py, pz, qx, qy, qz, qw, sx, sy, sz) {
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  mat[o] = (1 - (yy + zz)) * sx; mat[o + 1] = (xy + wz) * sx; mat[o + 2] = (xz - wy) * sx; mat[o + 3] = 0;
  mat[o + 4] = (xy - wz) * sy; mat[o + 5] = (1 - (xx + zz)) * sy; mat[o + 6] = (yz + wx) * sy; mat[o + 7] = 0;
  mat[o + 8] = (xz + wy) * sz; mat[o + 9] = (yz - wx) * sz; mat[o + 10] = (1 - (xx + yy)) * sz; mat[o + 11] = 0;
  mat[o + 12] = px; mat[o + 13] = py; mat[o + 14] = pz; mat[o + 15] = 1;
}
export function buildVolumeArrays(c, p) {
  const { sm, agreeArr, nlon, nlat, nd, depths } = c, agreeMin = p.agreeMin, thr = p.threshold;
  const pp = new Float64Array(3), q = new Float64Array(4);
  const collect = (sign) => {
    const cap = nd * nlat * nlon;
    const mat = new Float32Array(cap * 16);
    const depA = new Float32Array(cap);
    const magA = new Float32Array(cap);
    let n = 0;
    for (let di = 0; di < nd; di++) {
      const depth = depths[di], r = depthToUnit(depth), ad = depth / EARTH_RADIUS;
      const rUp = di < nd - 1 ? depthToUnit(depths[di + 1]) : r - 0.012;
      const rDn = di > 0 ? depthToUnit(depths[di - 1]) : r + 0.012;
      const radH = Math.abs(rDn - rUp) * 0.62 + 0.006;
      const latS = 0.030 + 0.014 * r;
      const planeBase = di * nlat * nlon;
      for (let j = 0; j < nlat; j++) {
        const rowBase = planeBase + j * nlon;
        const lat = 90 - (j + 0.5) / nlat * 180;
        for (let i = 0; i < nlon; i++) {
          const k = rowBase + i, v = sm[k], ag = agreeArr[k];
          if (ag < agreeMin) continue;
          if (sign > 0 ? v <= thr : v >= -thr) continue;
          const lon = -180 + (i + 0.5) / nlon * 360;
          latLonToVec3(lat, lon, r, pp);
          // dir = normalize(pp)
          let L = Math.sqrt(pp[0] * pp[0] + pp[1] * pp[1] + pp[2] * pp[2]); if (L === 0) L = 1;
          const dx = pp[0] / L, dy = pp[1] / L, dz = pp[2] / L;
          quatFromUp(dx, dy, dz, q);
          compose(mat, n * 16, pp[0], pp[1], pp[2], q[0], q[1], q[2], q[3], latS, radH, latS);
          depA[n] = ad;
          magA[n] = Math.min(1, Math.abs(v) * ag);
          n++;
        }
      }
    }
    return {
      mat: mat.subarray(0, n * 16),
      dep: depA.subarray(0, n),
      mag: magA.subarray(0, n),
    };
  };
  const fast = collect(+1), slow = collect(-1);
  return {
    matFast: fast.mat, depFast: fast.dep, magFast: fast.mag,
    matSlow: slow.mat, depSlow: slow.dep, magSlow: slow.mag,
  };
}

// ---- dispatcher used by both the worker and the synchronous fallback --------------
// Takes the raw field arrays + params + strategy, runs cluster + the strategy's numeric
// build, and returns { strategy, depths, ...arrays }. Also returns the list of
// underlying ArrayBuffers to transfer (zero-copy) back from the worker.
export function buildBodies(field, params, strategy) {
  const c = cluster(field, params);
  const strat = (strategy === 'points' || strategy === 'volume' || strategy === 'wire') ? strategy : 'surfaces';
  const base = { strategy: strat, depths: field.depths, ok: !!c };
  if (!c) return { result: base, transfers: [] };

  if (strat === 'points' || strat === 'volume') {
    const a = strat === 'points' ? buildPointsArrays(c, params) : buildVolumeArrays(c, params);
    const result = { ...base, ...a };
    return { result, transfers: collectBuffers([a.matFast, a.depFast, a.magFast, a.matSlow, a.depSlow, a.magSlow]) };
  }
  // surfaces or wire
  const a = buildIsoArrays(c, params);
  const result = { ...base, ...a };
  return { result, transfers: collectBuffers([a.posFast, a.depFast, a.idxFast, a.posSlow, a.depSlow, a.idxSlow]) };
}

// gather the distinct underlying ArrayBuffers from a set of typed-array views
// (subarrays may share a buffer; transfer each buffer at most once).
function collectBuffers(views) {
  const seen = new Set(), out = [];
  for (const v of views) {
    if (v && v.buffer && !seen.has(v.buffer)) { seen.add(v.buffer); out.push(v.buffer); }
  }
  return out;
}
