# TERRASCAN — *looking inward*

An interactive globe that turns the planet inside-out. Instead of borders and
terrain, it renders a **third kind of map**: what we actually *know* about the
Earth's interior, layered on top of what theory *predicts*, slice by slice with
depth — from the crust to the inner core.

![the interior as 3D anatomy](media/structures.png)

| 660 km — cold slabs ring the Pacific | core–mantle boundary — the African LLSVP |
|---|---|
| ![slabs](media/slabs-660.png) | ![llsvp](media/llsvp-cmb.png) |
| the measured data as a filled 3-D volume | the theoretical model alone — a blurry estimate |
| ![3-D data volume](media/model-volume.png) | ![model](media/model-only.png) |

Two layers are composited in 3-D, sharing one camera:

| layer | what it is | how it looks |
|---|---|---|
| **The scan** | A classified slice of seismic tomography at the chosen depth — fast (cold, sinking) vs slow (hot, rising) shear-velocity anomalies. | **Crisp.** Colour encodes the anomaly (or the feature class); **opacity encodes how well the region is resolved.** Where coverage is thin, the scan fades and the model behind shows through. |
| **The model** | The smooth, radially-symmetric theoretical reference Earth (PREM). | **Blurry** — rendered to an offscreen buffer and Gaussian-blurred: an *estimation*, not an observation. Where the scan goes blind (the deep core), the estimate brightens to take over. |
| **3D bodies** | Each feature (slab, plume, hot pile, cratonic keel, ULVZ) interpolated into a translucent, fuzzy-outlined body spanning its real depth range. | Slabs as dipping sheets, plumes as conduits, the two LLSVPs as basal piles. The body at your current depth brightens. **Hover** any body for what it is + its data sources; **click** to isolate it (the orbit pivot flies to its centre, the rest fade, a faint Earth stays for context) — Esc/back to return. |
| **Relief surface** | A translucent blue-marble Earth with hill-shaded topography (+ optional country borders). | Geographic orientation you can see *through* to the interior — toggle it or fade it with the opacity slider. |
| **Karst & caves** | The planet's soluble-rock skin: global karst belts (carbonate/evaporite outcrop) plus real, surveyed long / deep / flooded cave systems. | Belts glow faintly by regime (coastal-flooded · alpine · continental) — they stand for the *unmapped frontier*. Dots are the *mapped* systems: **teal** = water-filled (cenotes, blue holes, sumps, springs), **amber** = dry passage, **violet** = depth records — sized by length or depth. Hover for stats & source; click to look one up. A few dots carry a **ring** — click to fly into the cave's **real surveyed passages in 3-D** (lofted from the actual LRUD cross-sections), pinned and oriented at its entrance, blown up to a visible size. |
| **Theory in gaps** | Where seismic coverage is too thin to resolve, the *expected* field is shown faintly under a diagonal **hatch**. | Makes "no data here — this is the model's guess" explicit, instead of just fading to nothing. |

Each depth also reports its **temperature** (K and °C, flagged as a modelled estimate with a ± and "not measured"), pressure, density, the resolved-coverage %, and a plain "what we know here" note.

**Reading the colour:** it is *seismic-wave speed* = the rock's temperature & stiffness, **not** motion. Blue = fast = cold/stiff (usually sinking); red = slow = hot/soft (usually rising); neutral = ordinary average mantle (measured, nothing unusual); hatched/faint = no readings, theory's guess only.

A **Feature glossary** button defines every type (craton, ridge, slab, plume, LLSVP, ULVZ); the **Footprints** toggle projects each body's outline radially onto the surface so you can see where it sits on the map; and hovering or extracting a body links straight to the public datasets & papers behind it.

A built-in **"How we know"** panel lists the public datasets & methods behind all of this (tomography models, normal modes, gravity, geoneutrinos, the core field, …) with links.

It is deliberately **not** binary "scanned / not-scanned." The classification is
normalised to a diverging colour scale with transparency, so the map reads as a
continuous field of confidence and feature type.

## Run it locally

ES modules + `fetch` need to be served over HTTP (not opened as `file://`):

```bash
python3 -m http.server 8123
# then open http://127.0.0.1:8123/
```

Everything is **self-contained** — three.js is vendored under `vendor/`, the
geographic data under `data/`. No network calls at runtime.

## Controls

- **drag** orbit · **scroll** zoom
- **depth slider / ticks** dive to any depth or jump to a boundary (Moho, 410, 660, D″, CMB, ICB…)
- **▶ dive** auto-descend to the core · **↑/↓** nudge depth · **space** dive
- **Colour by** ΔVs (velocity) or feature class
- toggles for the scan layer, the theoretical model, coastlines, feature tags, auto-rotate
- sliders for scan opacity, model haze (blur), and ΔVs gain

## An honest note on the data

The **radial profile** — velocities, density, pressure, layer boundaries — is the
real [PREM](https://ds.iris.edu/spud/earthmodel) reference model (Dziewonski &
Anderson, 1981). The **lateral anomalies** are a hand-built, geographically-faithful
*synthesis* of well-established features from published global tomography
(the African & Pacific LLSVPs, subducted slabs, plume conduits, cratonic roots —
cf. S40RTS, SEMUCB-WM1, GyPSuM), not a pixel-exact re-render of any single dataset.
Treat it as an illustrative map of *what we know is down there*, not a measurement.

The **karst & caves** layer is the one place the app shows *direct* observation rather
than seismic inference — places humans have physically surveyed. The belts follow the
[World Karst Aquifer Map](https://www.whymap.org/whymap/EN/Maps_Data/Wokam/wokam_node_en.html)
(WOKAM; Goldscheider et al. 2020); the cave dots come from the UIS / Bob Gulden long- &
deep-cave lists and the underwater-cave literature, current to 2025–26. The belts are
deliberately a coarse wash — a reminder that only a sliver of that rock has ever been mapped.

The clickable **3-D cave surveys** are real Survex `.3d` centreline+LRUD data from the
Cambridge University Caving Club's long-running Loser-plateau expedition
([expo.survex.com](https://expo.survex.com)) — parsed, georeferenced from UTM33N, and
baked to compact JSON by `build-caves.mjs`. They're shown by courtesy of CUCC; the survey
effort is theirs.

## Deploy to GitHub Pages

The site is plain static files at the repo root and uses only **relative** paths,
so it works under a project subpath (`user.github.io/repo/`):

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, pick
   `main` / `/ (root)`.
3. Open the published URL. (`.nojekyll` is included so all files are served verbatim.)

## Deployed

Public: **https://terrascan.bowd.io/** — served as a static site from GitHub Pages
(no build step; three.js is vendored, everything loads over relative paths).

## How it's built

```
index.html            markup + import map
css/style.css         the HUD
js/earthModel.js      PREM radial model, layers, depth↔radius helpers
js/tomography.js      feature dataset → per-depth ΔVs + coverage DataTexture
js/geo.js             coastlines, land-mask rasteriser, lat/lon → 3D
js/shells.js          theoretical onion shells + the scan-slice shaders
js/postfx.js          render-to-target, separable blur, starfield, composite
js/ui.js              all DOM controls & readouts
js/main.js            scene, OrbitControls, depth logic, the render loop
vendor/               three.js + OrbitControls (pinned r160)
data/                 Natural Earth coastlines & land (preprocessed by build-geo.mjs)
```

Dev helpers (not needed at runtime): `build-geo.mjs` regenerates the compact geo
JSON; `shoot.mjs` renders verification screenshots with Playwright.

## Credits

- Coastlines & land polygons: **Natural Earth** (public domain).
- Reference model: **PREM** / IRIS.
- Rendering: **three.js**.
