// experiments.js — OTHER ways we probe the Earth, pinned at their real locations.
// Deliberately NOT 3-D fields: muography is shallow/local (a volcano or building);
// neutrino/geoneutrino are deep/bulk scalars. Tooltips state the depth reach so we
// never imply they image the interior the way seismic tomography does.
export const EXP_KIND = {
  muography:  {label:'muography (cosmic-ray muons)', color:0xffcf5a,
    note:'density radiograph — SHALLOW / local only (an edifice, not the deep Earth)'},
  neutrino:   {label:'neutrino tomography', color:0x9a86ff,
    note:'high-energy neutrino absorption → the DEEP Earth: bulk & core density'},
  geoneutrino:{label:'geoneutrino detector', color:0x5fe0c0,
    note:'antineutrinos from U/Th decay → radiogenic-heat budget (bulk, crust-dominated)'},
};

export const EXPERIMENTS = [
  // --- muography: shallow, local ---
  {name:'Sakurajima', kind:'muography', lat:31.59, lon:130.66, year:'2010s',
    reveals:'density inside an active volcano', reach:'shallow · the edifice (~km)',
    src:'https://www.muographix.utokyo.ac.jp/'},
  {name:'Vesuvius (MURAVES)', kind:'muography', lat:40.82, lon:14.43, year:'2020s',
    reveals:'internal density of the cone', reach:'shallow · ~km',
    src:'https://www.muographix.utokyo.ac.jp/'},
  {name:'Mt Etna', kind:'muography', lat:37.75, lon:14.99, year:'2010s',
    reveals:'shallow conduit & summit density', reach:'shallow · ~km',
    src:'https://www.muographix.utokyo.ac.jp/'},
  {name:'Khufu Pyramid (ScanPyramids)', kind:'muography', lat:29.979, lon:31.134, year:'2017 & 2023',
    reveals:"the 'Big Void' above the Grand Gallery", reach:'structure-scale (~100 m)',
    src:'https://doi.org/10.1038/nature24647'},
  {name:'Fukushima Daiichi', kind:'muography', lat:37.42, lon:141.03, year:'2015+',
    reveals:'fuel/debris inside the reactor cores', reach:'building-scale',
    src:'https://www.muographix.utokyo.ac.jp/'},
  // --- neutrino tomography: deep, bulk ---
  {name:'IceCube (South Pole)', kind:'neutrino', lat:-89.5, lon:0, year:'2019 · 2025',
    reveals:"Earth's bulk & CORE density via neutrino absorption", reach:'DEEP · core + lower mantle (bulk, ~25%)',
    src:'https://doi.org/10.1038/s41567-018-0319-1'},
  // --- geoneutrinos: whole-Earth radiogenic heat ---
  {name:'KamLAND', kind:'geoneutrino', lat:36.43, lon:137.31, year:'2005+',
    reveals:'radiogenic heat (U/Th)', reach:'whole-Earth (crust-dominated)',
    src:'https://kamland.stanford.edu/'},
  {name:'Borexino (Gran Sasso)', kind:'geoneutrino', lat:42.45, lon:13.57, year:'2010+',
    reveals:'radiogenic heat — thin-crust site (cleaner mantle term)', reach:'whole-Earth',
    src:'https://borex.lngs.infn.it/'},
  {name:'SNO+ (Sudbury)', kind:'geoneutrino', lat:46.47, lon:-81.19, year:'2025',
    reveals:'radiogenic heat — first Western-Hemisphere result', reach:'whole-Earth',
    src:'https://snoplus.phy.queensu.ca/'},
  {name:'JUNO (Jiangmen)', kind:'geoneutrino', lat:22.12, lon:112.52, year:'2025+',
    reveals:'radiogenic heat — high-statistics (upcoming)', reach:'whole-Earth',
    src:'https://juno.ihep.cas.cn/'},
];
