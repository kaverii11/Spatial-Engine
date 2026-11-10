// Checks the browser engine against NetworkX reference numbers from export_web_data.py
import { readFileSync } from 'node:fs';
import { parseGraph, multiSourceDijkstra, groupStats, NodeIndex, greedySites, haversine } from '../src/engine';

const buf = readFileSync('public/data/graph.bin');
const g = parseGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const pts = JSON.parse(readFileSync('public/data/points.json', 'utf8'));
const ref = JSON.parse(readFileSync('public/data/reference.json', 'utf8'));
const inf = pts.informal.map((p: any) => p.node), frm = pts.formal.map((p: any) => p.node);
let fails = 0;
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
function check(label: string, s: any, r: any) {
  const ok = s.reachable === r.reachable && close(s.avgKm, r.avg_km, 0.0006) &&
    close(s.compliancePct, r.compliance_pct, 0.0001) && close(s.gini, r.gini, 0.0011);
  if (!ok) fails++;
  console.log(ok ? 'OK  ' : 'FAIL', label.padEnd(22), `js ${s.compliancePct.toFixed(2)}% ${s.avgKm.toFixed(4)}km g=${s.gini}`, `| py ${r.compliance_pct.toFixed(2)}% ${r.avg_km}km g=${r.gini}`);
}
for (const mode of ['schools', 'healthcare', 'fire']) {
  const base = pts.facilities[mode].map((p: any) => p.node);
  let t = performance.now();
  const d = multiSourceDijkstra(g, base);
  const ms = performance.now() - t;
  check(`${mode}/informal (${ms.toFixed(0)}ms)`, groupStats(d, inf).stats, ref[mode].informal);
  check(`${mode}/formal`, groupStats(d, frm).stats, ref[mode].formal);
  check(`${mode}/with_extra`, groupStats(multiSourceDijkstra(g, [...base, ...ref.extra_nodes]), inf).stats, ref[mode].with_extra);
}
// nearest-node lookup must agree with osmnx snapping on the stored points
const idx = new NodeIndex(g);
let snapMismatch = 0;
let ties = 0;
for (const p of [...pts.informal, ...pts.facilities.schools]) {
  const r = idx.nearest(p.lat, p.lng);
  if (r.node === p.node) continue;
  // different node is fine only if it is a near-tie (float32 coords vs osmnx BallTree)
  const osmnxM = haversine(p.lat, p.lng, g.coords[2 * p.node + 1], g.coords[2 * p.node]);
  if (r.metres <= osmnxM && osmnxM - r.metres < 1) ties++; else snapMismatch++;
}
console.log(`snap vs osmnx: ${snapMismatch} real mismatches, ${ties} near-ties (<1 m) / ${pts.informal.length + pts.facilities.schools.length}`);
const base = pts.facilities.schools.map((p: any) => p.node);
const d0 = multiSourceDijkstra(g, base);
let t = performance.now();
const picks = greedySites(g, d0, inf, 10);
console.log(`greedy 10 sites in ${(performance.now() - t).toFixed(0)}ms, gains`, picks.map(p => p.gain).join(','));
const after = groupStats(multiSourceDijkstra(g, [...base, ...picks.map(p => p.node)]), inf).stats;
const covered0 = groupStats(d0, inf).stats;
console.log(`compliance ${covered0.compliancePct.toFixed(1)}% -> ${after.compliancePct.toFixed(1)}%; expected +${picks.reduce((a, p) => a + p.gain, 0)} pts = ${((covered0.compliancePct / 100 * inf.length + picks.reduce((a, p) => a + p.gain, 0)) / inf.length * 100).toFixed(1)}%`);
process.exit(fails || snapMismatch ? 1 : 0);
