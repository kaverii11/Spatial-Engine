// Network-distance engine. Runs entirely in the browser (inside a Web Worker).
// Same maths as server.py: multi-source Dijkstra over the OSM walk graph,
// 1 km walking threshold, Gini coefficient over walking distances.

export interface Graph {
  n: number;
  e: number;
  coords: Float32Array; // lon,lat interleaved
  off: Uint32Array;
  tgt: Uint32Array;
  len: Float32Array;
}

export function parseGraph(buf: ArrayBuffer): Graph {
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== 'SEG1') throw new Error('bad graph file');
  const head = new Uint32Array(buf, 4, 2);
  const n = head[0], e = head[1];
  let o = 12;
  const coords = new Float32Array(buf, o, 2 * n); o += 8 * n;
  const off = new Uint32Array(buf, o, n + 1); o += 4 * (n + 1);
  const tgt = new Uint32Array(buf, o, e); o += 4 * e;
  const len = new Float32Array(buf, o, e);
  return { n, e, coords, off, tgt, len };
}

// Binary min-heap keyed on float64 distance, values are node ids. Lazy deletion.
class Heap {
  k = new Float64Array(1 << 16);
  v = new Uint32Array(1 << 16);
  size = 0;
  push(key: number, val: number) {
    if (this.size === this.k.length) {
      const k2 = new Float64Array(this.size * 2); k2.set(this.k); this.k = k2;
      const v2 = new Uint32Array(this.size * 2); v2.set(this.v); this.v = v2;
    }
    let i = this.size++;
    const { k, v } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const { k, v } = this;
    const top = v[0];
    const lastK = k[--this.size], lastV = v[this.size];
    let i = 0;
    const half = this.size >> 1;
    while (i < half) {
      let c = 2 * i + 1;
      if (c + 1 < this.size && k[c + 1] < k[c]) c++;
      if (k[c] >= lastK) break;
      k[i] = k[c]; v[i] = v[c]; i = c;
    }
    k[i] = lastK; v[i] = lastV;
    return top;
  }
  topKey() { return this.k[0]; }
}

/** Shortest walking distance (m) from the nearest source to every node. Infinity = unreachable. */
export function multiSourceDijkstra(g: Graph, sources: Iterable<number>, reuse?: Float64Array): Float64Array {
  const dist: Float64Array = reuse ?? new Float64Array(g.n);
  dist.fill(Infinity);
  const h = new Heap();
  for (const s of sources) { if (dist[s] !== 0) { dist[s] = 0; h.push(0, s); } }
  const { off, tgt, len } = g;
  while (h.size) {
    const d = h.topKey();
    const u = h.pop();
    if (d > dist[u]) continue;
    for (let j = off[u], end = off[u + 1]; j < end; j++) {
      const v = tgt[j];
      const nd = d + len[j];
      if (nd < dist[v]) { dist[v] = nd; h.push(nd, v); }
    }
  }
  return dist;
}

/** Dijkstra from one source, stopping at `limit` metres. Returns visited nodes and their distances. */
export function boundedDijkstra(g: Graph, src: number, limit: number, scratch: Float64Array, touched: number[]): void {
  for (const t of touched) scratch[t] = Infinity;
  touched.length = 0;
  const h = new Heap();
  scratch[src] = 0; touched.push(src); h.push(0, src);
  const { off, tgt, len } = g;
  while (h.size) {
    const d = h.topKey();
    const u = h.pop();
    if (d > scratch[u]) continue;
    for (let j = off[u], end = off[u + 1]; j < end; j++) {
      const nd = d + len[j];
      if (nd > limit) continue;
      const v = tgt[j];
      if (nd < scratch[v]) {
        if (scratch[v] === Infinity) touched.push(v);
        scratch[v] = nd; h.push(nd, v);
      }
    }
  }
}

export function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const a = [...values].sort((x, y) => x - y);
  let num = 0, sum = 0;
  for (let i = 0; i < n; i++) { num += (2 * (i + 1) - n - 1) * a[i]; sum += a[i]; }
  return sum > 0 ? Math.round((num / (n * sum)) * 1000) / 1000 : 0;
}

export const THRESHOLD_M = 1000;

export interface GroupStats {
  reachable: number;
  unreachable: number;
  avgKm: number;
  medianKm: number;
  compliancePct: number;
  gini: number;
  histogram: number[]; // counts per HIST_EDGES bucket
}

export const HIST_EDGES_KM = [0.5, 1, 1.5, 2, 3, Infinity];

export function groupStats(dist: Float64Array, nodes: number[]): { stats: GroupStats; perPoint: number[] } {
  const perPoint = nodes.map(n => dist[n]);
  const d = perPoint.filter(Number.isFinite);
  const hist = HIST_EDGES_KM.map(() => 0);
  for (const x of d) {
    const km = x / 1000;
    hist[HIST_EDGES_KM.findIndex(e => km <= e)]++;
  }
  const sorted = [...d].sort((a, b) => a - b);
  return {
    perPoint,
    stats: {
      reachable: d.length,
      unreachable: nodes.length - d.length,
      avgKm: d.length ? d.reduce((a, b) => a + b, 0) / d.length / 1000 : 0,
      medianKm: d.length ? sorted[Math.floor(d.length / 2)] / 1000 : 0,
      compliancePct: d.length ? (d.filter(x => x <= THRESHOLD_M).length / d.length) * 100 : 0,
      gini: gini(d),
      histogram: hist,
    },
  };
}

// ---- nearest node lookup (uniform grid over lon/lat) ----
export class NodeIndex {
  private cell = 0.005;
  private minX: number; private minY: number;
  private cols: number; private rows: number;
  private start: Uint32Array; private items: Uint32Array;
  private g: Graph;
  constructor(g: Graph) {
    this.g = g;
    const c = g.coords;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < g.n; i++) {
      const x = c[2 * i], y = c[2 * i + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    this.minX = minX; this.minY = minY;
    this.cols = Math.floor((maxX - minX) / this.cell) + 1;
    this.rows = Math.floor((maxY - minY) / this.cell) + 1;
    const cellOf = new Uint32Array(g.n);
    const counts = new Uint32Array(this.cols * this.rows + 1);
    for (let i = 0; i < g.n; i++) {
      const k = this.key(c[2 * i], c[2 * i + 1]);
      cellOf[i] = k; counts[k + 1]++;
    }
    for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1];
    this.start = counts.slice();
    this.items = new Uint32Array(g.n);
    const fill = counts.slice();
    for (let i = 0; i < g.n; i++) this.items[fill[cellOf[i]]++] = i;
  }
  private key(x: number, y: number) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.minY) / this.cell)));
    return cy * this.cols + cx;
  }
  /** Returns nearest node id and its distance in metres (haversine). */
  nearest(lat: number, lng: number): { node: number; metres: number } {
    const c = this.g.coords;
    const cx = Math.floor((lng - this.minX) / this.cell), cy = Math.floor((lat - this.minY) / this.cell);
    let best = -1, bestM = Infinity;
    const cellM = this.cell * 111_320 * Math.cos((lat * Math.PI) / 180);
    for (let r = 0; r < Math.max(this.cols, this.rows); r++) {
      if (best >= 0 && (r - 1) * cellM > bestM) break;
      for (let y = cy - r; y <= cy + r; y++) {
        if (y < 0 || y >= this.rows) continue;
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || x >= this.cols) continue;
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          const k = y * this.cols + x;
          for (let j = this.start[k]; j < this.start[k + 1]; j++) {
            const i = this.items[j];
            const m = haversine(lat, lng, c[2 * i + 1], c[2 * i]);
            if (m < bestM) { bestM = m; best = i; }
          }
        }
      }
    }
    return { node: best, metres: bestM };
  }
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371009, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Greedy maximum-coverage site selection.
 * Candidates are the graph nodes of the target points themselves. At each step pick
 * the candidate that brings the most currently-uncovered points within THRESHOLD_M.
 */
export function greedySites(g: Graph, baseDist: Float64Array, targetNodes: number[], k: number) {
  const covered = targetNodes.map(n => baseDist[n] <= THRESHOLD_M);
  const candidates = [...new Set(targetNodes)];
  const scratch = new Float64Array(g.n).fill(Infinity);
  const touched: number[] = [];
  // coverage set of each candidate: indices into targetNodes
  const nodeToTargets = new Map<number, number[]>();
  targetNodes.forEach((n, i) => {
    const a = nodeToTargets.get(n);
    if (a) a.push(i); else nodeToTargets.set(n, [i]);
  });
  const reach = candidates.map(c => {
    boundedDijkstra(g, c, THRESHOLD_M, scratch, touched);
    const hit: number[] = [];
    for (const t of touched) { const a = nodeToTargets.get(t); if (a) hit.push(...a); }
    return hit;
  });
  const picks: { node: number; gain: number }[] = [];
  const used = new Set<number>();
  for (let step = 0; step < k; step++) {
    let bestI = -1, bestGain = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;
      let gain = 0;
      for (const t of reach[i]) if (!covered[t]) gain++;
      if (gain > bestGain) { bestGain = gain; bestI = i; }
    }
    if (bestI < 0) break;
    used.add(bestI);
    for (const t of reach[bestI]) covered[t] = true;
    picks.push({ node: candidates[bestI], gain: bestGain });
  }
  return picks;
}
