// Preprocess Natural Earth GeoJSON into compact runtime arrays.
// coastlines.json : [ [ [lon,lat], ... ], ... ]   (array of polylines)
// land.json       : [ [ [ [lon,lat],... ] , ...rings ], ... ] (array of polygons -> rings)
import { readFileSync, writeFileSync } from 'node:fs';

const r = (v) => Math.round(v * 100) / 100; // 2 dp ~ 1km at equator

function loadCoast() {
  const gj = JSON.parse(readFileSync('data/coastline-110m.json', 'utf8'));
  const lines = [];
  for (const f of gj.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString') lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') for (const ls of g.coordinates) lines.push(ls);
  }
  return lines.map((ln) => ln.map(([lon, lat]) => [r(lon), r(lat)]));
}

function loadLand() {
  const gj = JSON.parse(readFileSync('data/land-110m.json', 'utf8'));
  const polys = [];
  for (const f of gj.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) polys.push(p);
  }
  return polys.map((rings) => rings.map((ring) => ring.map(([lon, lat]) => [r(lon), r(lat)])));
}

const coast = loadCoast();
const land = loadLand();
writeFileSync('data/coastlines.json', JSON.stringify(coast));
writeFileSync('data/land.json', JSON.stringify(land));
console.log('coastlines: %d lines, %d bytes', coast.length, JSON.stringify(coast).length);
console.log('land: %d polys, %d bytes', land.length, JSON.stringify(land).length);
