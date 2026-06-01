// Generate js/datasources.js from the verified public-sources research output.
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sources = raw.result.sources;

const ORDER = [
  ['reference-model',     '1-D reference models — the baseline'],
  ['mantle-tomography',   'Global mantle tomography — the “scan”'],
  ['seismic-method',      'Seismic methods beyond tomography'],
  ['seismic-discontinuity','Discontinuities & the crust'],
  ['normal-modes',        'Free oscillations / normal modes'],
  ['core-magnetic',       'The core & the magnetic field'],
  ['gravity-geodesy',     'Gravity & geodesy'],
  ['geoneutrino',         'Geoneutrinos'],
  ['heat-flow',           'Heat flow'],
  ['electromagnetic',     'Electrical conductivity'],
  ['mineral-physics',     'Mineral physics'],
  ['geochemistry',        'Geochemistry'],
  ['slab-plate',          'Slabs & plate reconstructions'],
  ['portal-repository',   'Portals & repositories'],
  ['other',               'Other'],
];
const firstUrl = (a)=>{ const m=(a||'').match(/https?:\/\/[^\s;)\]]+/); return m?m[0]:''; };
const trim = (s,n)=> (s&&s.length>n) ? s.slice(0,n-1).replace(/[ ,;:]+$/,'')+'…' : (s||'');
const cleanOne = (s)=> trim((s||'').replace(/\s*Public (via|at|through)\b[^.]*\.?\s*$/i,'').trim(), 210);
const orderIdx = Object.fromEntries(ORDER.map(([k],i)=>[k,i]));

// de-duplicate across domains by a normalised leading acronym/name token
const keyOf = (name)=>{ const m=(name||'').match(/^[A-Za-z0-9][A-Za-z0-9.+]*/); return (m?m[0]:name).toUpperCase().replace(/[.\-]/g,''); };
const score = (s)=> -(orderIdx[s.category]??99)*1000 + (firstUrl(s.access)?100:0) - (s.name||'').length;
const best = new Map();
for(const s of sources){ const k=keyOf(s.name); if(!best.has(k) || score(s)>score(best.get(k))) best.set(k,s); }
const uniq = [...best.values()];

const groups = ORDER.map(([key,label])=>({
  cat: label,
  items: uniq.filter(s=>s.category===key).map(s=>({
    name:s.name.replace(/\s*\(.*$/,'').trim()||s.name, m:trim(s.measures,120), d:s.depthRange, u:firstUrl(s.access), one:cleanOne(s.oneLine),
  })),
})).filter(g=>g.items.length);

const HELP = `export function dataSourcesHTML(groups){
  return groups.map(g=>\`<div class="data-cat">\${g.cat}</div>\`+
    g.items.map(it=>\`<div class="data-item"><b>\${it.name}</b>\`+
      \`<div class="di-meta">\${it.m} · \${it.d}</div>\`+
      \`<div class="di-one">\${it.one}</div>\`+
      (it.u?\`<a href="\${it.u}" target="_blank" rel="noopener">\${it.u.replace(/^https?:\\/\\//,'').split('/')[0]} ↗</a>\`:'')+
    \`</div>\`).join('')
  ).join('');
}`;

const out = `// AUTO-GENERATED from the verified public-sources research sweep.
// ${sources.length} public datasets/methods that image the Earth's interior.
// Regenerate: node build-sources.mjs <workflow-output.json>
export const DATA_GROUPS = ${JSON.stringify(groups, null, 1)};

${HELP}
`;
writeFileSync('js/datasources.js', out);
console.log('groups:', groups.map(g=>`${g.cat.split(' — ')[0]}(${g.items.length})`).join(', '));
console.log('total items:', groups.reduce((a,g)=>a+g.items.length,0));
