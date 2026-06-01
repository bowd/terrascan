// AUTO-GENERATED from the verified public-sources research sweep.
// 96 public datasets/methods that image the Earth's interior.
// Regenerate: node build-sources.mjs <workflow-output.json>
export const DATA_GROUPS = [
 {
  "cat": "1-D reference models — the baseline",
  "items": [
   {
    "name": "PREM",
    "m": "1-D radial profiles of Vp, Vs (Vpv/Vph/Vsv/Vsh in the anisotropic upper mantle, plus eta), density rho, and attenuation…",
    "d": "Whole Earth (crust, mantle, outer core, inner core)",
    "u": "https://ds.iris.edu/ds/products/emc-prem/",
    "one": "Dziewonski & Anderson (1981) the canonical 1-D reference Earth model against which most 3-D mantle models report perturbations."
   },
   {
    "name": "AK135",
    "m": "1-D radial Vp and Vs (isotropic) optimized to seismic-phase traveltimes; the AK135-F variant adds density and Q from Mo…",
    "d": "Whole Earth (crust to inner core)",
    "u": "http://ds.iris.edu/ds/products/emc-ak135-f/",
    "one": "Kennett, Engdahl & Buland (1995) traveltime-optimized 1-D model; the standard reference for body-wave/relocation work and many P models."
   },
   {
    "name": "IASP91",
    "m": "1-D radial Vp and Vs (isotropic) parameterized as a summary of the main seismic-phase traveltimes; no density and no Q",
    "d": "Whole Earth (crust to inner core)",
    "u": "http://ds.iris.edu/ds/products/emc-iasp91/",
    "one": "Kennett & Engdahl (1991, IASPEI 1991 Seismological Tables) traveltime reference model widely used for phase identification and location."
   },
   {
    "name": "STW105",
    "m": "1-D transversely isotropic radial reference model: Vpv, Vph, Vsv, Vsh, eta, density rho, and Q; a smoothed/updated alte…",
    "d": "Whole Earth (crust to inner core)",
    "u": "https://ds.iris.edu/ds/products/emc-stw105/",
    "one": "Kustowski, Ekstrom & Dziewonski (2008) anisotropic 1-D reference model; the baseline for S362ANI(+M) and GLAD-M25."
   },
   {
    "name": "IRIS / EarthScope Earth Model Collaboration",
    "m": "Community repository of 70+ contributed 3D Earth models plus 9 standard 1D reference models (e.g. PREM, AK135, IASP91)…",
    "d": "whole (crust, mantle, transition zone, lower mantle, D″, core depending on model)",
    "u": "https://ds.iris.edu/ds/products/emc/",
    "one": "The go-to download hub for ready-to-use seismic tomography and reference Earth models in a standardized format you can plug into your own tools."
   }
  ]
 },
 {
  "cat": "Global mantle tomography — the “scan”",
  "items": [
   {
    "name": "S40RTS",
    "m": "Isotropic shear-wave velocity perturbations (dVs) relative to PREM; spherical harmonics to degree 40, 21 vertical splin…",
    "d": "Whole mantle (surface to CMB, ~0-2891 km)",
    "u": "http://ds.iris.edu/ds/products/emc-s40rts/",
    "one": "The workhorse long-to-intermediate-wavelength whole-mantle Vs model (Ritsema, Deuss, van Heijst & Woodhouse 2011); shows slabs and the two LLVPs clearly; isotropic only."
   },
   {
    "name": "S362ANI",
    "m": "Radially (transversely) anisotropic shear velocity: Vsv, Vsh (xi = Vsh^2/Vsv^2), plus Vp parameters and density via sca…",
    "d": "Whole mantle; radial anisotropy in upper ~250-410 km",
    "u": "https://ds.iris.edu/ds/products/emc-s362ani/",
    "one": "Kustowski, Ekstrom & Dziewonski (2008) global radially anisotropic Vs model; the reference 3-D model paired with STW105."
   },
   {
    "name": "S362ANI+M",
    "m": "Radially anisotropic Vs (Vsv, Vsh, xi) updated with normal-mode splitting sensitivity; isotropic Vs in mantle plus radi…",
    "d": "Whole mantle; radial anisotropy upper ~300 km",
    "u": "http://ds.iris.edu/ds/products/emc-s362anim/",
    "one": "Moulik & Ekstrom (2014) update to S362ANI/S362WMANI jointly using normal modes, body waves, surface waves and long-period waveforms; uses mode splitting to constrain mantle radial anisotropy."
   },
   {
    "name": "SEMUCB-WM1",
    "m": "Radially anisotropic whole-mantle shear velocity: isotropic Voigt Vs and anisotropic parameter xi = Vsh^2/Vsv^2 (gives…",
    "d": "Whole mantle (surface to CMB)",
    "u": "http://ds.iris.edu/ds/products/emc-semucb-wm1/",
    "one": "French & Romanowicz (2014) first whole-mantle SEM full-waveform model; famous for imaging broad lower-mantle plume conduits."
   },
   {
    "name": "GyPSuM",
    "m": "Joint Vs, Vp, AND density (rho-Vs-Vp coupling) from P and S body-wave traveltimes plus geodynamic data (free-air gravit…",
    "d": "Whole mantle (surface to CMB)",
    "u": "http://ds.iris.edu/ds/products/emc-gypsum/",
    "one": "Simmons, Forte, Boschi & Grand (2010) joint seismic-geodynamic model; one of the few public global models that includes a 3-D density field."
   },
   {
    "name": "SP12RTS",
    "m": "Isotropic Vs and Vp (and Vs/Vp ratio R) determined independently without scaling relationships; spherical harmonics to…",
    "d": "Whole mantle (surface to CMB)",
    "u": "https://ds.iris.edu/ds/products/emc-sp12rts/",
    "one": "Koelemeijer, Ritsema, Deuss & van Heijst (2016) long-wavelength companion to S40RTS that adds an independent Vp field; good for LLVP/post-perovskite studies."
   },
   {
    "name": "SEISGLOB2",
    "m": "Isotropic shear velocity (predominantly an SV model, anisotropy neglected); spherical harmonics to degree 40, 21 radial…",
    "d": "Whole mantle (surface to CMB)",
    "u": "https://ds.iris.edu/ds/products/emc-seisglob2/",
    "one": "Durand, Debayle, Ricard, Zaroli & Lambotte (2017) whole-mantle Vs model; confirmed the change in shear-velocity heterogeneity pattern around ~1000 km depth."
   },
   {
    "name": "SAVANI",
    "m": "Radially anisotropic shear velocity: Voigt-average Vs plus radial anisotropy xi = (Vsh/Vsv)^2 (provides Vsv, Vsh); data…",
    "d": "Whole mantle (surface to CMB)",
    "u": "https://github.com/rwporritt/savani",
    "one": "Auer, Boschi, Becker, Nissen-Meyer & Giardini (2014) variable-resolution radially anisotropic whole-mantle Vs model."
   },
   {
    "name": "TX2019slab",
    "m": "Isotropic P-wave and S-wave velocity perturbations (joint Vp + Vs inversion; dVs vs averaged TNA/SNA, dVp vs AK135-F) u…",
    "d": "Whole mantle (0-2890 km)",
    "u": "http://ds.iris.edu/ds/products/emc-tx2019slab/",
    "one": "Lu, Grand, Lai & Garnero (2019) joint P/S whole-mantle model emphasizing well-resolved subducted slabs."
   },
   {
    "name": "TX2011",
    "m": "Isotropic shear-wave velocity perturbation (dVs) relative to TX2011_ref; 2x2 degree grid; classic body-wave (S/SS) trav…",
    "d": "Whole mantle (0-2890 km)",
    "u": "https://ds.iris.edu/ds/products/emc-tx2011/",
    "one": "Grand & Simmons shear-wave model (lineage of Grand 2002 'fate of subducted slabs'); long-standing reference for slab and LLVP geometry."
   },
   {
    "name": "GLAD-M25",
    "m": "Transversely isotropic (radially anisotropic) model: Vsv, Vsh, Vpv, Vph and eta, with radial anisotropy confined to the…",
    "d": "Whole mantle as distributed on EMC: 25-2890 km (does not extend to the free surface)",
    "u": "http://ds.iris.edu/ds/products/emc-glad-m25/",
    "one": "Lei, Ruan, Bozdag, Tromp et al. (2020) Princeton global adjoint full-waveform model (successor to GLAD-M15); state-of-the-art waveform-based whole-mantle imaging."
   },
   {
    "name": "DETOX-P",
    "m": "Isotropic P-wave velocity from multifrequency (finite-frequency) traveltime tomography of teleseismic P, PP and P-diffr…",
    "d": "Whole mantle (surface to CMB)",
    "u": "https://zenodo.org/records/3993276",
    "one": "Hosseini, Sigloch et al. (2020, GJI 220, 96-141) multifrequency P-wave whole-mantle models (P1/P2/P3 variants); the DETOX series powers many SubMachine plume/slab images."
   },
   {
    "name": "LLNL-G3Dv3",
    "m": "Isotropic P-wave velocity on a spherical tessellation (~1 deg node spacing in upper mantle, ~2 deg in lower mantle) wit…",
    "d": "Whole mantle (crust to CMB)",
    "u": "https://ds.iris.edu/ds/products/emc-llnl-g3dv3/",
    "one": "Simmons, Myers, Johannesson & Matzel (2012) LLNL global P model designed for accurate seismic event location and traveltime prediction."
   },
   {
    "name": "MITP08",
    "m": "Isotropic P-wave velocity perturbation (dVp) relative to AK135; whole-mantle finite-frequency P-wave traveltime tomogra…",
    "d": "Whole mantle (surface to CMB)",
    "u": "https://ds.iris.edu/ds/products/emc-earthmodels/",
    "one": "Li, van der Hilst et al. (2008) finite-frequency global P model; widely used baseline for slab imaging."
   },
   {
    "name": "UU-P07",
    "m": "Isotropic P-wave velocity perturbation (dVp) relative to AK135; global P traveltime tomography with 3-D reference model…",
    "d": "Whole mantle (surface to CMB)",
    "u": "https://www.atlas-of-the-underworld.org/uu-p07-model/",
    "one": "Utrecht (Amaru/Spakman) global P model; the tomography behind the Atlas of the Underworld slab catalog."
   },
   {
    "name": "SubMachine",
    "m": "Interactive web-based visualization, comparison and statistics for 30+ global/regional seismic tomography models plus c…",
    "d": "mantle / TZ / lower mantle / D″ (deep interior)",
    "u": "https://users.earth.ox.ac.uk/~smachine/cgi/index.php",
    "one": "Browser tool to slice, overlay and statistically compare many deep-mantle tomography models side-by-side without downloading or coding anything."
   }
  ]
 },
 {
  "cat": "Seismic methods beyond tomography",
  "items": [
   {
    "name": "PKP / PKIKP differential traveltimes",
    "m": "BC-DF (and AB-DF) differential times of core phases; reveals cylindrical (polar-axis) anisotropy and aspherical structu…",
    "d": "outer core / inner core",
    "u": "",
    "one": "Compares P waves that graze the outer core vs. those that pierce the solid inner core; polar paths arrive ~1.5-3.5 s early, exposing inner-core anisotropy aligned with the spin axis. Underlying waveforms"
   },
   {
    "name": "ScS reverberations / ScSn mantle layering",
    "m": "Common-reflection-point reflectivity profiles from multiple ScS bounces; precise depths and impedance contrasts of the…",
    "d": "mantle / TZ / lower mantle / D''",
    "u": "",
    "one": "Uses S waves that bounce repeatedly off the core and internal layers to build a vertical 'mantle layering' profile along the path. Waveforms public via FDSN/IRIS-EarthScope DMC (Revenaugh & Jordan 1991, J. Geo…"
   },
   {
    "name": "SKS / SKKS shear-wave splitting",
    "m": "Fast-polarization direction and delay time of split shear waves; constrains anisotropy (mantle deformation/flow fabric)…",
    "d": "upper mantle / D''",
    "u": "https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/2014GC005278",
    "one": "An anisotropic mantle splits a single shear wave into fast and slow components; the splitting records the direction of mantle 'grain'/flow. Public uniformly-processed global dataset of ~50,000 SKS measurements…"
   },
   {
    "name": "Ambient-noise cross-correlation & surface-wave dispersion",
    "m": "Rayleigh/Love group and phase velocity dispersion from station-station noise correlations; constrains crustal and upper…",
    "d": "crust / upper mantle",
    "u": "",
    "one": "Cross-correlating continuous background noise between station pairs reconstructs the surface-wave Green's function, whose speed-vs-period gives shallow shear structure. Continuous waveforms public via FDSN/IRI…"
   },
   {
    "name": "CRUST1.0",
    "m": "Global 1-degree crustal model: boundary depths, Vp, Vs and density for 8 layers (water, ice, 3 sediment, upper/middle/l…",
    "d": "crust (and Moho)",
    "u": "https://igppweb.ucsd.edu/~gabi/crust1.html",
    "one": "A worldwide layer-cake of the crust on a 1x1 degree grid built from active-source and receiver-function data; the standard crustal correction for deeper studies. Public at UCSD IGPP (https://igppweb.ucsd.edu/~…"
   },
   {
    "name": "LITHO1.0",
    "m": "Global 1-degree (tessellated) model extending CRUST1.0 into the uppermost mantle: 11 layers giving layer thickness, Vp…",
    "d": "crust / lithosphere / uppermost mantle (about -5 to 320 km)",
    "u": "https://ds.iris.edu/ds/products/emc-litho10/",
    "one": "Extends the crustal model down through the lithospheric lid and into the asthenosphere, giving a crust-plus-lithosphere starting model. Public via IRIS/EarthScope EMC (https://ds.iris.edu/ds/products/emc-litho…"
   },
   {
    "name": "GEOFON",
    "m": "Real-time and archived global seismic waveform data (GE network plus 100+ federated networks), rapid global earthquake…",
    "d": "whole (seismic waveforms constraining the full interior)",
    "u": "https://geofon.gfz.de/",
    "one": "Europe's major real-time/archive seismic data hub and earthquake-monitoring system, federated with FDSN for global waveform access."
   },
   {
    "name": "ObsPy",
    "m": "Open-source Python framework for reading/writing seismological data formats and accessing FDSN web services; signal pro…",
    "d": "whole (analysis tool for seismic data of any depth target)",
    "u": "https://www.obspy.org/",
    "one": "The standard Python toolkit for pulling data from FDSN data centers and processing seismograms — the practical bridge between portals and your own interior analysis."
   },
   {
    "name": "EarthScope USArray",
    "m": "Dense continental-scale seismic data from the Transportable Array, Reference/Backbone Network, Flexible Array, and Magn…",
    "d": "crust / upper mantle / TZ (high-resolution North American structure; MT array images conductivity)",
    "u": "https://ds.iris.edu/ds/nodes/dmc/earthscope/usarray/",
    "one": "The archival access point for the rolling dense US seismic+MT array that produced high-resolution images of crust and mantle beneath North America."
   }
  ]
 },
 {
  "cat": "Discontinuities & the crust",
  "items": [
   {
    "name": "PKiKP / PKP precursors",
    "m": "Short- and long-period precursors and reflections that map fine-scale heterogeneity at the core-mantle boundary (D'' sc…",
    "d": "lower mantle / D'' / outer core",
    "u": "",
    "one": "Energy scattered before the main core arrival pinpoints rough patches and ultra-low-velocity layers right at the base of the mantle. Waveforms"
   },
   {
    "name": "Ps and Sp receiver functions",
    "m": "Depth and sharpness of converted-phase discontinuities beneath stations: crust-mantle Moho, mid-lithospheric discontinu…",
    "d": "crust / upper mantle (lithosphere)",
    "u": "",
    "one": "Deconvolved teleseismic waveforms isolate P-to-S (and S-to-P) conversions at layer boundaries below a station, imaging crustal and lithospheric layering. Waveforms"
   },
   {
    "name": "SS and PP precursors",
    "m": "Reflection times and amplitudes from underside mantle reflections; global topography, sharpness and reflectivity of the…",
    "d": "mantle transition zone (and shallower/deeper mantle reflectors)",
    "u": "",
    "one": "Faint arrivals that precede the SS/PP surface bounce are reflections off mantle discontinuities at the bounce point, giving near-global coverage including under oceans. Waveforms public via FDSN/IRIS-EarthScop…"
   },
   {
    "name": "ULVZ studies",
    "m": "Thin (tens of km), small (hundreds of km wide) patches at the core-mantle boundary with up to ~45% lower Vs (and up to…",
    "d": "lowermost mantle / D'' / CMB",
    "u": "",
    "one": "Localized melt-rich or chemically-distinct patches sitting on the core-mantle boundary, detected as extreme velocity drops in ScS/PcP/SPdKS waveforms. Waveforms public via FDSN/IRIS-EarthScope DMC (e.g., North…"
   },
   {
    "name": "LLSVP / LLVP studies",
    "m": "Two continent-sized regions of reduced shear velocity (beneath Africa and the Pacific) in the lowermost mantle; their l…",
    "d": "lower mantle / D''",
    "u": "",
    "one": "The two giant 'blobs' at the base of the mantle that organize deep flow and host most ULVZs; mapped by traveltimes, waveform modeling and tomography. Underlying waveforms"
   },
   {
    "name": "Inner-core-boundary density jump from PKiKP/PcP & normal modes",
    "m": "PKiKP/PcP reflection-amplitude ratios and free-oscillation eigenfrequencies constrain the density and shear-velocity co…",
    "d": "Inner-core boundary and base of outer core (F-layer)",
    "u": "",
    "one": "Reflections off the inner-core surface plus whole-Earth ringing pin down how much denser the solid inner core is than the liquid above it, a key geodynamo energy constraint."
   }
  ]
 },
 {
  "cat": "Free oscillations / normal modes",
  "items": [
   {
    "name": "Free oscillations / normal modes",
    "m": "Spheroidal and toroidal mode periods and Q; uniquely sensitive to density and bulk 1-D elastic/anelastic structure beca…",
    "d": "whole",
    "u": "",
    "one": "Think of the entire Earth ringing like a bell for hours after great quakes; the tones constrain density and average 1-D structure that body waves alone cannot. Underlying broadband/long-period waveforms are"
   },
   {
    "name": "Earth normal-mode / free-oscillation eigenfrequency datasets",
    "m": "Frequencies and splitting of low-order spheroidal/toroidal modes that integrate over deep structure; constrain outer-co…",
    "d": "Whole Earth, with strong leverage on outer-core density and the inner/outer core",
    "u": "https://igppweb.ucsd.edu/~gabi/rem.html",
    "one": "The planet's deepest bell tones; their pitches fix the density of the outer core in a way body waves alone cannot."
   }
  ]
 },
 {
  "cat": "The core & the magnetic field",
  "items": [
   {
    "name": "IGRF-14",
    "m": "Spherical-harmonic model of Earth's main (core-generated) magnetic field and its secular variation; constrains geodynam…",
    "d": "Outer core / core-mantle boundary (main field source)",
    "u": "https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field",
    "one": "The community-standard model of the magnetic field made by Earth's churning liquid-iron core, and how it drifts, our main window onto core motions"
   },
   {
    "name": "CHAOS-7 geomagnetic field model",
    "m": "Time-dependent internal field to degree ~20 with high temporal resolution; secular variation and secular acceleration…",
    "d": "Outer core (resolves rapid core-field changes, jerks, secular acceleration) down to the core-mantle boundary",
    "u": "http://www.spacecenter.dk/files/magnetic-models/CHAOS-7/",
    "one": "The high-resolution satellite-era field model: the best window onto fast outer-core flow changes, jerks, and the evolving South Atlantic Anomaly."
   },
   {
    "name": "gufm1 historical field model",
    "m": "Time-dependent field to degree/order 14, 1590-1990, from historical (largely maritime declination) observations; B-spli…",
    "d": "Outer core / core-mantle boundary (four centuries of large-scale field and secular variation)",
    "u": "https://geomag.colorado.edu/gufm1",
    "one": "Four centuries of pre-satellite field history: lets you watch westward drift and outer-core flow over timescales no satellite can cover."
   },
   {
    "name": "COV-OBS.x2 ensemble field model",
    "m": "Time-dependent field 1840-2020 with realistic temporal cross-covariances (AR-2 stochastic priors) and an ensemble (up t…",
    "d": "Outer core / core-mantle boundary; covariances designed for core-flow and geodynamo data assimilation",
    "u": "https://spacecenter.dk/files/magnetic-models/COV-OBSx2/",
    "one": "A field model that comes with honest error bars and time-correlation statistics, built specifically so you can invert it for outer-core flow."
   },
   {
    "name": "World Data Centre for Geomagnetism, Edinburgh",
    "m": "Archived global observatory time series (hourly/annual means, 1-min from 1979, 1-sec from 2000 for UK) and geomagnetic…",
    "d": "Outer core (secular-variation time series) with external-field index context",
    "u": "https://wdc.bgs.ac.uk/",
    "one": "Long-term observatory and index archive used to separate internal (core) field from external disturbances."
   },
   {
    "name": "ESA Swarm satellite magnetic mission",
    "m": "High-precision core, lithospheric, ionospheric and tidal-ocean magnetic field measurements; yields core-field models (C…",
    "d": "Outer core (main field) + crust/lithosphere (lithospheric field) + mantle (EM induction)",
    "u": "https://earth.esa.int/eogateway/missions/swarm",
    "one": "A three-satellite constellation separating Earth's magnetic field into its core, crust, and induced parts, probing both the dynamo below and mantle conductivity in between"
   },
   {
    "name": "INTERMAGNET observatory network",
    "m": "Continuous ground-based vector geomagnetic field at ~150 observatories; 1-minute and 1-second definitive/quasi-definiti…",
    "d": "Outer core (long, stable time series anchoring secular variation and detecting geomagnetic jerks)",
    "u": "https://intermagnet.org/",
    "one": "The ground truth time series of the field; its secular variation is the long-baseline signal of outer-core flow and the source of jerk detections."
   },
   {
    "name": "NOAA NCEI Geomagnetism / World Data Center archive",
    "m": "Archive of geomagnetic observatory, survey and satellite data plus field models; distributes IGRF, WMM, WMMHR, EMM and…",
    "d": "Outer core main field and lithosphere (host/clearinghouse for the data and models that constrain the core field)",
    "u": "https://www.ncei.noaa.gov/products/geomagnetic-data",
    "one": "The U.S. clearinghouse: where you actually download the field models and the observatory/satellite data behind them."
   },
   {
    "name": "Geodynamo / outer-core convection simulation codes",
    "m": "Open-source 3-D rotating-MHD codes solving thermo-compositional convection and dynamo action in a spherical shell; vali…",
    "d": "Outer core (mechanism of field generation; produces simulated flow, field, and reversal behavior)",
    "u": "https://nschaeff.bitbucket.io/xshells/",
    "one": "The numerical labs that generate Earth-like fields from outer-core convection; how we test what flow patterns can produce the observed field."
   }
  ]
 },
 {
  "cat": "Gravity & geodesy",
  "items": [
   {
    "name": "IERS Earth Orientation Parameters: length-of-day",
    "m": "Daily UT1-UTC, polar motion and length-of-day (LOD); decadal/intradecadal LOD variations record axial angular-momentum…",
    "d": "Outer core (core-mantle coupling; torsional oscillations and electromagnetic/topographic coupling)",
    "u": "https://hpiers.obspm.fr/iers/eop/eopc04/",
    "one": "Tiny changes in the day's length over decades are the mantle feeling the outer core's flow tug on it; a direct, independent core-flow constraint."
   },
   {
    "name": "GRACE / GRACE-FO time-variable gravity",
    "m": "Month-to-month changes in Earth's gravity field from mass redistribution; for the solid Earth this captures glacial iso…",
    "d": "Whole Earth surface mass; informs mantle viscosity (upper/lower mantle) via GIA and outer core via tiny secular signals",
    "u": "https://grace.jpl.nasa.gov",
    "one": "Two satellites flying in formation 'weigh' Earth each month; the slow leftover trends after removing water tell you how the mantle is springing back from ice ages and how viscous it is at depth"
   },
   {
    "name": "GOCE",
    "m": "High-resolution static gravity gradients and geoid; constrains density structure of the lithosphere and upper mantle, c…",
    "d": "Crust and lithosphere / uppermost mantle",
    "u": "https://earth.esa.int/eogateway/missions/goce",
    "one": "A gradiometer satellite that mapped fine bumps in gravity, so geophysicists can infer where the crust is thick or thin and where dense mantle sits beneath"
   },
   {
    "name": "ICGEM Global Gravity Field Models archive",
    "m": "Curated archive of 160+ static and 20+ temporal spherical-harmonic gravity field models with online calculation/visuali…",
    "d": "Crust, lithosphere, upper mantle density structure (whole-Earth long-wavelength field links to deep mantle dynamic topography/geoid)",
    "u": "http://icgem.gfz-potsdam.de",
    "one": "The one-stop public library of every standard gravity-field model plus a calculator to turn coefficients into maps of the geoid and anomalies"
   },
   {
    "name": "EGM2008",
    "m": "High-degree (to spherical-harmonic degree/order 2190) static global gravity field and geoid; reference field for crusta…",
    "d": "Crust and lithosphere (long wavelengths link to mantle/deep density)",
    "u": "https://earth-info.nga.mil",
    "one": "The long-standing high-resolution reference map of Earth's gravity, used as the baseline against which interior density anomalies are measured"
   }
  ]
 },
 {
  "cat": "Geoneutrinos",
  "items": [
   {
    "name": "KamLAND geoneutrino measurements",
    "m": "Flux of electron antineutrinos from U-238 and Th-232 decay chains; constrains total radiogenic heat production and the…",
    "d": "Whole Earth (bulk Earth U/Th, mantle abundance after subtracting modeled crust)",
    "u": "https://www.awa.tohoku.ac.jp/kamland/",
    "one": "A giant underground detector counts ghostly particles from radioactive decay deep inside Earth, telling us how much of Earth's heat is nuclear and how much uranium/thorium the mantle holds"
   },
   {
    "name": "Borexino geoneutrino measurements",
    "m": "Geoneutrino flux constraining radiogenic heat and mantle U/Th; thinner-crust site gives a direct mantle signal (~21 TNU…",
    "d": "Whole Earth; better mantle leverage than KamLAND due to thin local crust",
    "u": "https://borex.lngs.infn.it",
    "one": "Italy's ultra-pure liquid-scintillator detector measures Earth's radioactive antineutrinos with little crustal contamination, giving the clearest peek at heat coming from the mantle itself"
   }
  ]
 },
 {
  "cat": "Heat flow",
  "items": [
   {
    "name": "IHFC Global Heat Flow Database / heatflow.world",
    "m": "Global compilation of ~91,000+ continental and oceanic heat-flow measurements with quality scoring and rich metadata; n…",
    "d": "crust / lithosphere (surface heat flow constraining thermal/lithospheric structure)",
    "u": "https://www.heatflow.world/",
    "one": "The authoritative open database of Earth's surface heat flow measurements — the thermal-budget data that constrains lithospheric and deeper thermal structure."
   }
  ]
 },
 {
  "cat": "Electrical conductivity",
  "items": [
   {
    "name": "USArray / USMTArray magnetotelluric transfer functions & 3-D conductivity models",
    "m": "3-D electrical conductivity of crust and upper mantle from natural EM induction; sensitive to temperature, partial melt…",
    "d": "Crust through upper mantle / asthenosphere (to ~few hundred km)",
    "u": "https://ds.iris.edu/spud/emtf",
    "one": "Natural magnetic storms act as a free signal; measuring how Earth's currents respond reveals where the mantle is hot, melty, or water-rich, things seismic waves alone cannot tell apart"
   },
   {
    "name": "Global mantle electrical conductivity models",
    "m": "1-D and 3-D bulk-mantle conductivity from geomagnetic-depth-sounding using satellite (Swarm, CHAMP) and ground observat…",
    "d": "Upper mantle, transition zone, into lower mantle",
    "u": "",
    "one": "Long-period geomagnetic variations probe far deeper than ground MT, mapping conductivity (hence water and temperature) all the way through the transition zone"
   }
  ]
 },
 {
  "cat": "Mineral physics",
  "items": [
   {
    "name": "Mineral-physics constraints on core composition",
    "m": "High-P/T experimental and ab-initio equations of state, sound velocities and density of Fe and Fe-alloys; quantify the…",
    "d": "Outer core and inner core (composition and thermal state)",
    "u": "",
    "one": "Squeezing iron alloys to core pressures to find which light elements explain why the core is less dense than pure iron, calibrated against PREM."
   },
   {
    "name": "Stixrude & Lithgow-Bertelloni thermodynamic database",
    "m": "Self-consistent thermoelastic and phase-equilibria parameters for mantle minerals; lets you predict density, seismic ve…",
    "d": "Whole mantle (upper mantle, transition zone, lower mantle)",
    "u": "",
    "one": "The standard recipe book of how mantle minerals behave under crushing pressure and heat, used to translate lab measurements into the seismic and density structure we observe"
   },
   {
    "name": "BurnMan",
    "m": "Python library computing thermodynamic/thermoelastic properties and seismic velocities of mineral assemblages, solid so…",
    "d": "Whole mantle and planetary interiors",
    "u": "https://github.com/geodynamics/burnman",
    "one": "Free code that takes lab mineral data and builds a synthetic Earth profile, so you can test whether a given composition matches observed seismic velocity and density"
   },
   {
    "name": "Perple_X",
    "m": "Computes stable mineral phase assemblages and resulting physical properties (density, velocities) across P-T-compositio…",
    "d": "Crust through lower mantle",
    "u": "https://www.perplex.ethz.ch",
    "one": "A widely used free program that figures out which minerals are stable at any depth and what bulk properties they produce, linking petrology to geophysics"
   }
  ]
 },
 {
  "cat": "Geochemistry",
  "items": [
   {
    "name": "GEOROC",
    "m": "Compiled major/trace element and radiogenic/stable isotope data for volcanic & plutonic rocks and mantle xenoliths (OIB…",
    "d": "Upper mantle source regions (and deep plume sources via OIB)",
    "u": "https://georoc.eu",
    "one": "A vast public catalog of the chemistry of erupted rocks and mantle fragments, the ground-truth for what the mantle is actually made of and how it varies"
   },
   {
    "name": "PetDB / EarthChem",
    "m": "Chemical, isotopic, mineralogical data for ocean-floor igneous rocks, MORB, abyssal peridotites, and mantle/lower-crust…",
    "d": "Upper mantle (MORB source, peridotite residues, xenolith-sampled lithosphere)",
    "u": "https://search.earthchem.org",
    "one": "The go-to public database for mid-ocean-ridge basalt and peridotite chemistry, defining the composition of the convecting upper mantle that feeds ridges"
   }
  ]
 },
 {
  "cat": "Slabs & plate reconstructions",
  "items": [
   {
    "name": "Slab2",
    "m": "3-D geometry (depth, dip, thickness) of all major subducting slabs from trench into the upper mantle, built from seismi…",
    "d": "Upper mantle (subducting lithosphere, to ~several hundred km)",
    "u": "https://doi.org/10.5066/F7PV6JNV",
    "one": "A global 3-D map of where every subducting plate currently sits underground, the present-day input for slab-driven mantle flow and the link to tomography"
   },
   {
    "name": "Atlas of the Underworld",
    "m": "Catalog of 94 positive seismic-velocity anomalies interpreted as subducted slab remnants, each tied to a geological sub…",
    "d": "Whole mantle (upper mantle to ~2500+ km, including slabs meeting LLSVPs)",
    "u": "https://www.atlas-of-the-underworld.org",
    "one": "An identified-and-named graveyard of ancient slabs in the deep mantle, connecting blobs in tomography to past plate motions and constraining lower-mantle sinking rates/viscosity"
   },
   {
    "name": "GPlates and the GPlates Portal",
    "m": "Desktop software (GPlates) and cloud portal for plate-tectonic reconstructions, paleogeography, dynamic topography, ver…",
    "d": "crust / lithosphere / upper mantle (plate kinematics, subduction history, surface expression of mantle flow)",
    "u": "https://www.gplates.org/",
    "one": "Interactive and programmatic plate-reconstruction tools that supply the moving-plate and subduction-history context interior models need."
   }
  ]
 },
 {
  "cat": "Portals & repositories",
  "items": [
   {
    "name": "shuleyu/seismic-tomography-models",
    "m": "Aggregated NetCDF conversions of ~52 whole-mantle models (e.g. S20/S40RTS, S362ANI(+M), SEMUCB-WM1, GyPSuM, SP12RTS, SE…",
    "d": "Whole mantle",
    "u": "https://github.com/shuleyu/seismic-tomography-models",
    "one": "Convenient single-format (NetCDF) public mirror for scripting; note it lacks a few models (e.g. TX2019slab, UU-P07)."
   },
   {
    "name": "FDSN – International Federation of Digital Seismograph Networks",
    "m": "Coordinates global seismic network standards: network/station code registry, data formats (miniSEED, StationXML), and t…",
    "d": "whole (standards layer over global seismic data)",
    "u": "https://www.fdsn.org/",
    "one": "The standards body whose network codes and web-service APIs make seismic data interoperable across every major data center."
   },
   {
    "name": "GFZ Data Services",
    "m": "Curated, DOI-assigning geosciences research-data repository spanning seismology, geodesy, geomagnetism, gravity and mor…",
    "d": "whole",
    "u": "https://dataservices.gfz-potsdam.de/web/",
    "one": "Germany's domain repository that publishes and DOI-stamps geoscience datasets — a stable, citable source for many interior-relevant data products."
   }
  ]
 }
];

export function dataSourcesHTML(groups){
  return groups.map(g=>`<div class="data-cat">${g.cat}</div>`+
    g.items.map(it=>`<div class="data-item"><b>${it.name}</b>`+
      `<div class="di-meta">${it.m} · ${it.d}</div>`+
      `<div class="di-one">${it.one}</div>`+
      (it.u?`<a href="${it.u}" target="_blank" rel="noopener">${it.u.replace(/^https?:\/\//,'').split('/')[0]} ↗</a>`:'')+
    `</div>`).join('')
  ).join('');
}
