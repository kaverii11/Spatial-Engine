/// <reference lib="webworker" />
import { parseGraph, multiSourceDijkstra, groupStats, NodeIndex, greedySites, type Graph } from './engine';
import type { PointsFile, Mode, WorkerRequest, WorkerResponse, ComputeResult } from './types';

let g: Graph;
let idx: NodeIndex;
let pts: PointsFile;
const dist: { cur: Float64Array } = { cur: new Float64Array(0) };
const baseCache = new Map<Mode, Float64Array>();

const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);

function baseDist(mode: Mode) {
  let d = baseCache.get(mode);
  if (!d) {
    d = multiSourceDijkstra(g, pts.facilities[mode].map(p => p.node));
    baseCache.set(mode, d);
  }
  return d;
}

function compute(mode: Mode, proposed: number[]): ComputeResult {
  const inf = pts.informal.map(p => p.node), frm = pts.formal.map(p => p.node);
  const t0 = performance.now();
  const sources = [...pts.facilities[mode].map(p => p.node), ...proposed];
  dist.cur = multiSourceDijkstra(g, sources, dist.cur.length ? dist.cur : undefined);
  const ms = performance.now() - t0;
  const b = baseDist(mode);
  const bi = groupStats(b, inf), bf = groupStats(b, frm);
  const ci = groupStats(dist.cur, inf), cf = groupStats(dist.cur, frm);
  return {
    ms,
    sources: sources.length,
    baseline: { informal: bi.stats, formal: bf.stats },
    current: { informal: ci.stats, formal: cf.stats },
    informalDist: ci.perPoint,
    informalBaseDist: bi.perPoint,
    formalDist: cf.perPoint,
  };
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const [gb, pj] = await Promise.all([
        fetch(m.base + 'data/graph.bin').then(r => { if (!r.ok) throw new Error('graph ' + r.status); return r.arrayBuffer(); }),
        fetch(m.base + 'data/points.json').then(r => { if (!r.ok) throw new Error('points ' + r.status); return r.json(); }),
      ]);
      g = parseGraph(gb);
      idx = new NodeIndex(g);
      pts = pj;
      post({ type: 'ready', id: m.id, nodes: g.n, edges: g.e, points: pts });
    } else if (m.type === 'compute') {
      post({ type: 'computed', id: m.id, result: compute(m.mode, m.proposed) });
    } else if (m.type === 'snap') {
      const r = idx.nearest(m.lat, m.lng);
      post({ type: 'snapped', id: m.id, node: r.node, metres: r.metres, lat: g.coords[2 * r.node + 1], lng: g.coords[2 * r.node] });
    } else if (m.type === 'suggest') {
      const t0 = performance.now();
      const d = multiSourceDijkstra(g, [...pts.facilities[m.mode].map(p => p.node), ...m.proposed]);
      const picks = greedySites(g, d, pts.informal.map(p => p.node), m.k);
      post({
        type: 'suggested', id: m.id, ms: performance.now() - t0,
        picks: picks.map(p => ({ ...p, lat: g.coords[2 * p.node + 1], lng: g.coords[2 * p.node] })),
      });
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: String(err) });
  }
};
