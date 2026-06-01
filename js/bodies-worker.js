// bodies-worker.js — module Web Worker that runs the data-bodies rebuild off the
// main thread. It imports ONLY the pure-numeric kernels (NO three, NO DOM), so it
// dodges the bare-specifier/import-map problem that would break `import * as THREE`
// inside a worker.
//
// Protocol:
//   main -> worker : { id, field:{nlon,nlat,ndep,depths,dvs,agree}, params, strategy }
//                    (field arrays are COPIES — dataengine reuses its live buffers)
//   worker -> main : { id, result:{ strategy, depths, ok, ...typedArrays } }
//                    with the result's ArrayBuffers TRANSFERRED (zero-copy).
//
// `id` lets the main thread coalesce: only the latest job's reply is assembled;
// stale replies are dropped.

import { buildBodies } from './bodies-kernels.js';

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.id == null) return;
  let out;
  try {
    out = buildBodies(msg.field, msg.params, msg.strategy);
  } catch (err) {
    // never wedge the main thread: report a failed (but well-formed) reply
    self.postMessage({ id: msg.id, error: String(err && err.stack || err) });
    return;
  }
  self.postMessage({ id: msg.id, result: out.result, fromWorker: true }, out.transfers);
};
