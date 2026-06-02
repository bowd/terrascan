// markerlod.js — level-of-detail for on-globe markers & labels.
//   • lodScale: scale a marker by camera distance so it stays ~constant on screen
//     (fixed-world markers otherwise balloon when you zoom in, vanish when you zoom out).
//   • labelShown: progressively reveal labels as you zoom in — important things label
//     from far out, minor things only once you're close. Declutters the globe.
const REF = 2.6;                      // distance at which scale == base
export function lodScale(distToMarker){
  return Math.min(2.4, Math.max(0.42, distToMarker / REF));
}
// priority 1 (headline) → labelled almost always; 5 (minor) → only when zoomed right in.
// `zoom` is the camera's distance from the globe centre (~3.1 default, ~1.3 close, ~7 far).
const LABEL_T = { 1: 99, 2: 3.4, 3: 2.45, 4: 1.95, 5: 1.6 };
export function labelShown(priority, zoom){
  return zoom < (LABEL_T[priority] || 2.0);
}
