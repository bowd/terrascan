# TERRASCAN — WebAssembly / Rust / TypeScript / "powers" migration investigation

*Read-only investigation. Date: 2026-06-01. No app source was modified. Benchmarks are Node 22 (V8), real `data/tomo-models.json`, replicating the exact algorithms.*

## Verdict (one paragraph)

**Do not migrate to WASM/Rust, and do not do a full TypeScript build.** WASM/Rust would buy you almost nothing here and would destroy the project's best asset — the zero-build, vendored, import-map workflow. The interaction hitches you can feel are **not** caused by JS being slow at numbers; they're caused by **JS-shaped code** (per-element closures, array-of-arrays neighbour lists, growable `[]`+`push`) in two kernels. I measured a **33× speedup on the cluster blur (71 ms → 2.1 ms)** and **2.3× on Surface Nets** from a *plain-JS* rewrite to flat typed arrays — no toolchain, no build, no `.wasm`. The only genuinely numeric-bound kernel is the ensemble combine (~35–40 ms, already flat/typed) and even that is debounced and off the render loop. The single high-value "power" worth adopting is a **Web Worker + transferable TypedArrays** to move the combine→cluster→Surface-Nets rebuild off the main thread, killing the ~250 ms interaction stall as *jank* even if the wall-clock work is unchanged. For maintainability, adopt **`// @ts-check` + JSDoc + `tsc --checkJs --noEmit`** (types with zero transpile, keep shipping the same `.js`). Recommended order: (1) flat-JS rewrite of the two hot kernels, (2) Worker-ize the rebuild, (3) opt-in `@ts-check`. Everything else is not worth it at this scale.

---

## Architecture & hot paths (what actually runs, and how often)

The render loop (`js/main.js animate()`) does **no heavy CPU math per frame**. Per frame it only:
- updates shader uniforms (`setBand`, `setCurDepth`), runs `controls.update()`, and calls `pipeline.render()` (GPU: offscreen RT + 2× separable Gaussian blur + composite — all on the GPU);
- **conditionally** calls `scanField.update(depth)` — the DataTexture rebuild — but **throttled** to once per ≥35 ms and only while depth is changing (diving/sliding).

Everything expensive is **per-interaction**, triggered by `refreshFromEngine()` (debounced 130 ms via `scheduleRefresh`) on: model toggle, model-kind toggle, normalize toggle, or any cluster slider (`threshold`/`smooth`/`agreeMin`). One interaction runs, in series on the main thread:

```
engine.combined()            -> dataengine.js  (14 × 332k Int8 -> mean + agreement)
toScanEns()                  -> main.js        (Float32 -> Int8/Uint8 repack)
scanField.setEnsemble(); update flagged
dataBodies.rebuild()         -> databodies.js  -> cluster() blur, then per strategy:
   surfaces/wire: surfaceNets() ×2 (fast+slow isosurface)
   volume:        ~80k instance-matrix compose
   points:        subsampled instance build
```

Grid is fixed and **small**: `ndep=32 × nlat=72 × nlon=144 = 331,776 cells`, 14 models.

## Benchmark numbers (Node 22 / V8, real data)

### Per-interaction kernels, as currently written
| Kernel | Cost | Frequency |
|---|---|---|
| `engine.combined()` (14 models) | **38–40 ms** | per interaction (debounced 130 ms) |
| `toScanEns()` repack | 5.7 ms | per interaction |
| `DataTexture` rebuild (1024×512, real path) | **30 ms** | per interaction **+ throttled per-frame while diving** |
| `cluster()` blur, smooth=1 | **71–91 ms** | per rebuild |
| `cluster()` blur, smooth=2 | 143–181 ms | per rebuild |
| Surface Nets ×2 (fast+slow) → 142k tris | **128–139 ms** | per rebuild (surfaces/wire) |
| volume instance-matrix build → 81k mats | 65 ms | per rebuild (volume) |
| **Total stall, surfaces strategy** | **~250–300 ms** | per model-toggle |

### The decisive experiment — *why* are they slow? (flat JS rewrite, no WASM)
| Kernel | Original shape | Flat-typed JS rewrite | Speedup |
|---|---|---|---|
| cluster blur, smooth=1 | 71.3 ms | **2.1 ms** | **33×** |
| cluster blur, smooth=2 | 143.2 ms | **4.2 ms** | **34×** |
| Surface Nets ×2 | 127.6 ms | **56.2 ms** (pre-sampled sign field) | **2.3×** |
| ensemble combine | 40.5 ms | 33.5 ms (int thresholds) / 35.6 ms (cell-major) | ~1.2× |
| combine — raw 14×N Int8 sum (bandwidth floor) | — | 4.3 ms | (memory floor) |

**Interpretation.** The cluster blur's 33× is *entirely* JS overhead: a per-cell closure (`at(di,j,i)`), a fresh `nb=[[...],[...]]` array-of-arrays allocated **per cell × per iteration** (≈332k allocations/pass), and `for…of` destructuring. Rewriting to hoisted strides + branch-based wrap + ping-pong buffers (still plain JS) makes V8's JIT trivially fast. Surface Nets' 2.3× comes from removing the `field()` closure that gets re-evaluated **4×** in the quad pass and swapping growable `pos.push()/indices.push()` for pre-sized typed arrays. **None of this needs WASM.** The combine, by contrast, is already flat/typed and sits near its memory-bandwidth floor (14 separate Int8 arrays, 4 scatter-accumulators → cache-bound); plain-JS tuning only shaves ~15%.

---

## Option (a): WebAssembly + Rust — **NO**

- **Which kernels would benefit?** Only the ensemble combine is genuinely numeric/bandwidth-bound. The blur and Surface Nets are *JS-shape*-bound — once rewritten flat (above), the blur is 2.1 ms and there is nothing left for WASM to win. So WASM's entire realistic target is the combine.
- **Realistic speedup on the combine:** JS numeric loops on typed arrays are already within ~1.5–4× of native; the combine is cache-bound (14 arrays × 4 scatter writes), so even Rust+SIMD likely lands ~2–4× → **~10–18 ms**. Saving ~20 ms on a path that's debounced 130 ms and off the render loop is **imperceptible**.
- **Marshalling tax:** the combine reads 14 Int8 volumes (4.6 MB) and writes two Float32 fields (2.6 MB). To use WASM you copy these into/out of WASM linear memory each call (or keep all 14 models resident in WASM memory and stream only outputs) — overhead that eats much of the theoretical win for a once-per-interaction call.
- **Workflow cost (the dealbreaker):** the app has **no build step** — `index.html` → `<script type="importmap">` → vendored `vendor/three.module.js`. Adding Rust means installing the Rust toolchain + `wasm-pack`/`wasm-bindgen`, introducing a compile step, shipping/streaming a `.wasm`, wiring `WebAssembly.instantiateStreaming`, and a worse debug story (no source-level stepping into the hot loop from DevTools). That trades the project's signature simplicity for a sub-perceptible win.
- **Verdict:** Not worth it. WASM/Rust does **not** give meaningful extra performance here, and the "powers" it offers (SIMD, threads) are better reached, for this codebase, via flat JS + a Worker + (optionally later) WebGPU.

## Option (b): TypeScript — **CONDITIONAL → yes, but only the zero-build flavour**

- A ~14-module vanilla-JS codebase with hand-written GLSL strings, terse one-line helpers, and shared cell-index conventions (`k=(di*nlat+j)*nlon+i` repeated across 4 files) **would** benefit from type-checking: catching grid-shape mismatches, the Int8/Float32/Uint8 conversions in `toScanEns`/`updateReal`, uniform-name typos, and the `field`/`params` object shapes passed between `dataengine` → `main` → `databodies`.
- **Keep the zero-build workflow.** Do **not** adopt `tsc`/esbuild/vite transpilation — that reintroduces exactly the build step WASM would. Instead:
  - add `// @ts-check` to the top of each module (opt-in, file by file),
  - annotate the load-bearing shapes with **JSDoc** (`@typedef` for `grid`, `field`, `clusterParams`),
  - run `tsc --checkJs --noEmit --allowJs` in CI/locally for types **without emitting** — you keep shipping the same hand-written `.js`, the import map and vendored three.js are untouched, and the browser runs the source verbatim.
- GLSL stays as template strings (no typing benefit, no cost). three.js types are available via `@types/three` for editor/check-time only (dev-dependency, never shipped).
- **Verdict:** Worth it for maintainability **if** you take the JSDoc + `@ts-check` + `--checkJs` path (effort S, risk low). A full TS build is **not** worth it (effort M/L, kills zero-build, no runtime payoff).

## Option (c): Other "powers"

- **Web Worker + transferable TypedArrays — YES (highest-value item).** The ~250 ms combine→cluster→Surface-Nets chain runs synchronously on the main thread, so a model toggle visibly freezes orbit/UI for a quarter-second. Move `engine.combined()` + `cluster()` + `surfaceNets()` into a Worker; post back the resulting `positions`/`aDepth`/`indices` as **transferable** ArrayBuffers (zero-copy). The main thread only builds `BufferGeometry` from the transferred buffers. Wall-clock work is similar, but the **jank disappears** and you can show a spinner. Workers are plain ES modules — no build step, fits the import-map setup. Effort M, big perceived-perf win. **Pair this with the flat-JS rewrite** so the Worker is also doing ~60 ms instead of ~250 ms.
- **OffscreenCanvas — not needed.** The render loop isn't CPU-bound; rendering on a Worker via OffscreenCanvas adds complexity (three.js r160 supports it, but it complicates picking/DOM-overlay markers) for no measured gain. Skip.
- **WebGPU compute shaders — NO, not now.** A GPU marching-cubes / GPU ensemble-combine is the "real" power play, but three.js r160's stable path is **WebGL2** (`WebGLRenderer`); WebGPU in r160 is experimental (`WebGPURenderer` + TSL) and would mean re-authoring all the GLSL strings and the whole pipeline. The data is tiny (332k cells) and the work is per-interaction, not per-frame — there is no per-frame GPU compute pressure to justify it. Revisit only if the grid grows ~10×.
- **GPU instancing — already in use** (`InstancedMesh` in `databodies` points/volume, `InstancedBufferGeometry` in `structures`). Good. The *build* of instance matrices is on the CPU (65 ms for 80k mats) — that's a candidate for the Worker too, or for writing matrices straight into a pre-sized `Float32Array` instead of `dummy.matrix.clone()` per instance.

---

## Prioritized recommendation

| Option | Worth it? | Payoff | Effort | Risk |
|---|---|---|---|---|
| **1. Flat-JS rewrite of `cluster()` blur** | **YES** | 71 ms → ~2 ms (**33×**) | **S** | very low |
| **2. Flat-JS rewrite of `surfaceNets()`** | **YES** | 128 ms → ~56 ms (**2.3×**) | S–M | low |
| **3. Move rebuild into a Web Worker (transferables)** | **YES** | ~250 ms stall → no main-thread jank | M | medium |
| **4. `@ts-check` + JSDoc + `tsc --checkJs --noEmit`** | **YES (light path only)** | refactor safety, fewer shape bugs | S | low |
| 5. Micro-opt combine (int thresholds / cell-major) | maybe | 40 → 33 ms (~1.2×) | S | low |
| 6. WebGPU compute isosurface | no (revisit at 10× scale) | large in theory | L | high |
| 7. OffscreenCanvas render-on-worker | no | none measured | M | medium |
| **WASM + Rust (any kernel)** | **NO** | combine ~40→~12 ms, off-loop, sub-perceptible | M–L | high (kills zero-build) |
| Full TypeScript build (tsc/vite) | **NO** | none at runtime | M–L | high (kills zero-build) |

### Concrete migration path
1. **Rewrite `cluster()` (databodies.js)** to flat typed arrays: hoist `planeStride=nlat*nlon`, replace the `at()` closure and per-cell `nb` array with branch-based wrap + direct index arithmetic, ping-pong two reused `Float32Array`s. (Measured 33×; biggest win for least effort.)
2. **Rewrite `surfaceNets()`**: pre-sample the signed/agreement-gated field once into a flat `Int8Array` sign map (eliminates the 4× `field()` re-eval in the quad pass), and emit into pre-sized typed arrays instead of `pos.push()/indices.push()`. (Measured 2.3×.)
3. **Worker-ize the rebuild**: a `dataengine.worker.js` (plain ES module) owns the 14 resident model volumes; main posts `{enabled, normalize, clusterParams}`, worker posts back transferable `{positions, aDepth, indices, ...}`; main wraps them in `BufferGeometry`. Show a brief "recomputing…" state. No build step.
4. **Adopt `@ts-check`** incrementally, starting with `dataengine.js`, `databodies.js`, `tomography.js` (the index-math-heavy trio); add `@typedef`s for `grid`/`field`/`clusterParams`; add a `tsc --checkJs --noEmit` script. Keep shipping the same `.js`.
5. (Optional) the combine int-threshold/cell-major tweak — nice-to-have once it's in the Worker.

**Bottom line for the user's question:** WASM/Rust would **not** give you more usable performance or any "power" you actually need at this scale, and it would cost you the zero-build workflow. The performance you're missing is sitting in JS-shaped code and is recoverable in plain JS (proven: 33× on the blur). TypeScript **is** worth it for maintainability — but only as type-checking-without-transpiling. The one real "power" upgrade is a Web Worker to de-jank the rebuild. Do those; skip WASM.
