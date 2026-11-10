import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents, ZoomControl } from 'react-leaflet';
import { Footprints, School, Hospital, Flame, Sparkles, Undo2, Trash2, X, Info, Loader2, MousePointerClick } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { call } from './engineClient';
import { HIST_EDGES_KM, THRESHOLD_M, type GroupStats } from './engine';
import type { ComputeResult, Mode, PointsFile } from './types';

const MODES: Record<Mode, { label: string; noun: string; icon: typeof School; source: string }> = {
  schools: { label: 'Govt schools', noun: 'school', icon: School, source: 'OSM, filtered to government schools' },
  healthcare: { label: 'Hospitals', noun: 'hospital', icon: Hospital, source: 'OSM amenity=hospital (public + private)' },
  fire: { label: 'Fire stations', noun: 'fire station', icon: Flame, source: 'OSM amenity=fire_station' },
};

const HIST_LABELS = ['≤0.5', '0.5–1', '1–1.5', '1.5–2', '2–3', '>3'];
const MAX_SNAP_M = 300;

interface Site { node: number; lat: number; lng: number; snapM?: number; gain: number; via: 'click' | 'suggest' }

const fmtKm = (m: number) => (Number.isFinite(m) ? `${(m / 1000).toFixed(2)} km` : 'not connected');
const distColor = (m: number) => (!Number.isFinite(m) ? '#94a3b8' : m <= THRESHOLD_M ? '#059669' : m <= 2000 ? '#d97706' : '#dc2626');
const compliantCount = (s: GroupStats) => Math.round((s.compliancePct / 100) * s.reachable);

export default function App() {
  const [info, setInfo] = useState<{ nodes: number; edges: number; points: PointsFile } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('schools');
  const [sites, setSites] = useState<Site[]>([]);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [busy, setBusy] = useState<string | null>('Loading street network…');
  const [notice, setNotice] = useState<string | null>(null);
  const [k, setK] = useState(5);
  const [showFormal, setShowFormal] = useState(false);
  const [showFacilities, setShowFacilities] = useState(true);
  const [lastSuggestMs, setLastSuggestMs] = useState<number | null>(null);
  const busyRef = useRef(false);

  const recompute = useCallback(async (m: Mode, s: Site[]) => {
    const r = await call<'computed'>({ type: 'compute', mode: m, proposed: s.map(x => x.node) });
    setResult(r.result);
    return r.result;
  }, []);

  useEffect(() => {
    call<'ready'>({ type: 'init', base: import.meta.env.BASE_URL })
      .then(r => { setInfo({ nodes: r.nodes, edges: r.edges, points: r.points }); setBusy('Running Dijkstra…'); return recompute('schools', []); })
      .then(() => setBusy(null))
      .catch(e => { setLoadError(String(e)); setBusy(null); });
  }, [recompute]);

  const switchMode = (m: Mode) => {
    if (m === mode || !info) return;
    run('Running Dijkstra…', async () => {
      await recompute(m, []);
      setMode(m); setSites([]); setLastSuggestMs(null);
    });
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setNotice(null);
    try { await fn(); } catch (e) { setNotice(String(e)); } finally { busyRef.current = false; setBusy(null); }
  };

  const addSiteAt = (lat: number, lng: number) => run('Snapping to street network…', async () => {
    const snap = await call<'snapped'>({ type: 'snap', lat, lng });
    if (snap.metres > MAX_SNAP_M) { setNotice(`No walkable street within ${MAX_SNAP_M} m of that point — the graph covers Bengaluru only.`); return; }
    if (sites.some(s => s.node === snap.node)) { setNotice('A proposed site already sits on that street node.'); return; }
    setBusy('Running Dijkstra…');
    const before = result ? compliantCount(result.current.informal) : 0;
    const draft: Site = { node: snap.node, lat: snap.lat, lng: snap.lng, snapM: snap.metres, gain: 0, via: 'click' };
    const next = [...sites, draft];
    const r = await recompute(mode, next);
    draft.gain = compliantCount(r.current.informal) - before;
    setSites(next);
  });

  const suggest = () => run('Searching for best sites…', async () => {
    const r = await call<'suggested'>({ type: 'suggest', mode, proposed: sites.map(s => s.node), k });
    setLastSuggestMs(r.ms);
    if (!r.picks.length) { setNotice('Every informal settlement point is already within 1 km.'); return; }
    const next = [...sites, ...r.picks.map(p => ({ node: p.node, lat: p.lat, lng: p.lng, gain: p.gain, via: 'suggest' as const }))];
    setBusy('Running Dijkstra…');
    await recompute(mode, next);
    setSites(next);
  });

  const setAndRecompute = (next: Site[]) => run('Running Dijkstra…', async () => { await recompute(mode, next); setSites(next); });

  return (
    <div className="flex flex-col-reverse md:flex-row h-dvh w-full bg-slate-100 text-slate-900">
      <aside className="md:w-[400px] md:h-full h-[55dvh] shrink-0 overflow-y-auto bg-white border-r border-slate-200 flex flex-col">
        <Sidebar
          info={info} loadError={loadError} mode={mode} setMode={switchMode}
          result={result} sites={sites} busy={busy} notice={notice} setNotice={setNotice}
          k={k} setK={setK} suggest={suggest} lastSuggestMs={lastSuggestMs}
          undo={() => setAndRecompute(sites.slice(0, -1))}
          clear={() => setAndRecompute([])}
          remove={i => setAndRecompute(sites.filter((_, j) => j !== i))}
        />
      </aside>
      <main className="relative flex-1 min-h-0">
        <MapView
          info={info} mode={mode} result={result} sites={sites}
          showFormal={showFormal} showFacilities={showFacilities} onClick={addSiteAt}
        />
        <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow border border-slate-200 px-3 py-2 text-xs space-y-1">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showFacilities} onChange={e => setShowFacilities(e.target.checked)} /> Existing {MODES[mode].label.toLowerCase()}</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showFormal} onChange={e => setShowFormal(e.target.checked)} /> Planned-area points</label>
        </div>
        <Legend mode={mode} />
        {busy && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900 text-white text-xs font-medium rounded-full px-3 py-1.5 shadow flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> {busy}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- sidebar

function Sidebar(p: {
  info: { nodes: number; edges: number; points: PointsFile } | null; loadError: string | null;
  mode: Mode; setMode: (m: Mode) => void; result: ComputeResult | null; sites: Site[];
  busy: string | null; notice: string | null; setNotice: (s: string | null) => void;
  k: number; setK: (k: number) => void; suggest: () => void; lastSuggestMs: number | null;
  undo: () => void; clear: () => void; remove: (i: number) => void;
}) {
  const { info, result, mode, sites } = p;
  const M = MODES[mode];
  const cur = result?.current.informal, base = result?.baseline.informal;
  const delta = cur && base ? cur.compliancePct - base.compliancePct : 0;

  return (
    <div className="p-5 space-y-5">
      <header>
        <div className="flex items-center gap-2 text-slate-900">
          <Footprints size={20} className="text-emerald-600" />
          <h1 className="text-lg font-semibold tracking-tight">Spatial Engine</h1>
          <span className="ml-auto text-[11px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Bengaluru</span>
        </div>
        <p className="text-sm text-slate-600 mt-1 leading-snug">
          How far do people in informal settlements walk to public services, and where should new facilities go?
        </p>
        <p className="text-[11px] text-slate-500 mt-2">
          {p.loadError ? <span className="text-red-600">Failed to load data: {p.loadError}</span>
            : info ? <>OSM walk graph · {info.nodes.toLocaleString()} nodes · {info.edges.toLocaleString()} edges · routing runs in your browser</>
            : 'Loading 6 MB street graph…'}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
        {(Object.keys(MODES) as Mode[]).map(m => {
          const Icon = MODES[m].icon;
          return (
            <button key={m} onClick={() => p.setMode(m)}
              className={`flex flex-col items-center gap-0.5 rounded-md py-2 text-xs font-medium transition cursor-pointer ${m === mode ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
              <Icon size={16} />
              {MODES[m].label}
              <span className="text-[10px] font-normal text-slate-400">{info ? info.points.facilities[m].length.toLocaleString() : '–'}</span>
            </button>
          );
        })}
      </div>

      <section>
        <p className="text-xs font-medium text-slate-500">Informal-settlement points within 1 km walk of a {M.noun}</p>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-4xl font-semibold tabular-nums">{cur ? cur.compliancePct.toFixed(1) : '–'}%</span>
          {sites.length > 0 && base && (
            <span className={`text-sm font-medium tabular-nums ${delta > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)} pts from {base.compliancePct.toFixed(1)}%
            </span>
          )}
        </div>
        {cur && <p className="text-xs text-slate-500 mt-0.5">{compliantCount(cur)} of {cur.reachable} sample points{cur.unreachable ? ` · ${cur.unreachable} not connected to the graph` : ''}</p>}
      </section>

      {result && <Comparison result={result} hasSites={sites.length > 0} />}
      {result && <Histogram cur={result.current.informal} base={result.baseline.informal} hasSites={sites.length > 0} />}

      <section className="border-t border-slate-200 pt-4 space-y-3">
        <h2 className="text-sm font-semibold">Propose new {M.noun}s</h2>
        <p className="text-xs text-slate-600 flex gap-2"><MousePointerClick size={14} className="shrink-0 mt-0.5 text-slate-400" />Click the map to add a site. It snaps to the nearest street node and every distance is recomputed.</p>
        <div className="flex items-center gap-2">
          <button onClick={p.suggest} disabled={!!p.busy || !result}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg py-2 cursor-pointer">
            <Sparkles size={15} /> Suggest best {p.k}
          </button>
          <select value={p.k} onChange={e => p.setK(Number(e.target.value))} className="border border-slate-300 rounded-lg text-sm px-2 py-2 bg-white">
            {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-slate-500 leading-snug">
          Greedy max-coverage: each step picks the settlement location that brings the most still-uncovered settlement points within 1 km walk.
          {p.lastSuggestMs !== null && <> Last search: {p.lastSuggestMs.toFixed(0)} ms.</>}
        </p>
        {p.notice && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2 flex gap-2">
            <span className="flex-1">{p.notice}</span><button onClick={() => p.setNotice(null)} className="cursor-pointer"><X size={14} /></button>
          </div>
        )}
        {sites.length > 0 && (
          <div className="space-y-1">
            <ol className="text-xs divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
              {sites.map((s, i) => (
                <li key={s.node} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-semibold grid place-items-center shrink-0">{i + 1}</span>
                  <span className="tabular-nums text-slate-500">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</span>
                  <span className="ml-auto text-emerald-700 font-medium tabular-nums">+{s.gain}</span>
                  <span className="text-slate-400">{s.via === 'suggest' ? 'auto' : 'click'}</span>
                  <button onClick={() => p.remove(i)} className="text-slate-400 hover:text-red-600 cursor-pointer" title="Remove"><X size={13} /></button>
                </li>
              ))}
            </ol>
            <p className="text-[10px] text-slate-400">+N = settlement points newly brought within 1 km when the site was added.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={p.undo} disabled={!!p.busy} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-300 rounded-lg py-1.5 hover:bg-slate-50 cursor-pointer"><Undo2 size={13} /> Undo</button>
              <button onClick={p.clear} disabled={!!p.busy} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-300 rounded-lg py-1.5 hover:bg-slate-50 cursor-pointer"><Trash2 size={13} /> Clear all</button>
            </div>
          </div>
        )}
        {result && (
          <p className="text-[11px] text-slate-500 tabular-nums">
            Last run: multi-source Dijkstra from {result.sources.toLocaleString()} sources over the full graph in {result.ms.toFixed(0)} ms.
          </p>
        )}
      </section>

      <Method info={info} mode={mode} />
    </div>
  );
}

function Comparison({ result, hasSites }: { result: ComputeResult; hasSites: boolean }) {
  const rows: [string, GroupStats, GroupStats, string][] = [
    ['Informal', result.current.informal, result.baseline.informal, 'bg-red-500'],
    ['Planned', result.current.formal, result.baseline.formal, 'bg-slate-400'],
  ];
  return (
    <section>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-slate-500 text-left">
            <th className="font-medium pb-1.5">Area type</th>
            <th className="font-medium pb-1.5 text-right">≤ 1 km</th>
            <th className="font-medium pb-1.5 text-right">Avg walk</th>
            <th className="font-medium pb-1.5 text-right">Median</th>
            <th className="font-medium pb-1.5 text-right" title="Gini coefficient of walking distances: 0 = everyone walks the same distance">Gini</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(([label, c, b, dot]) => (
            <tr key={label}>
              <td className="py-1.5"><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${dot}`} />{label} <span className="text-slate-400">({c.reachable})</span></td>
              <td className="text-right">{c.compliancePct.toFixed(1)}%</td>
              <td className="text-right">{c.avgKm.toFixed(2)} km</td>
              <td className="text-right">{c.medianKm.toFixed(2)} km</td>
              <td className="text-right">{c.gini.toFixed(3)}{hasSites && c.gini !== b.gini && <span className="text-slate-400"> ({b.gini.toFixed(3)})</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">Gini measures relative spread of walking distances. It can rise after adding sites: points near a new site drop to almost 0 km while far ones stay far.</p>
    </section>
  );
}

function Histogram({ cur, base, hasSites }: { cur: GroupStats; base: GroupStats; hasSites: boolean }) {
  const max = Math.max(...cur.histogram, ...base.histogram, 1);
  const colors = ['#059669', '#059669', '#d97706', '#d97706', '#dc2626', '#dc2626'];
  return (
    <section>
      <p className="text-xs font-medium text-slate-500 mb-2">Walking distance, informal points (km){hasSites && <span className="font-normal"> · outline = before</span>}</p>
      <div className="flex items-end gap-1.5 h-24">
        {cur.histogram.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-[10px] text-slate-600 tabular-nums">{v}</span>
            <div className="w-full relative" style={{ height: `${(Math.max(v, base.histogram[i]) / max) * 70}%` }}>
              {hasSites && <div className="absolute bottom-0 w-full border border-dashed border-slate-400 rounded-sm" style={{ height: `${max ? (base.histogram[i] / Math.max(v, base.histogram[i], 1)) * 100 : 0}%` }} />}
              <div className="absolute bottom-0 w-full rounded-sm opacity-85 transition-all duration-300" style={{ background: colors[i], height: `${(v / Math.max(v, base.histogram[i], 1)) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {HIST_LABELS.map((l, i) => <span key={i} className="flex-1 text-center text-[10px] text-slate-500">{l}</span>)}
      </div>
      <span className="sr-only">Buckets: {HIST_EDGES_KM.join(', ')}</span>
    </section>
  );
}

function Method({ info, mode }: { info: { nodes: number; edges: number; points: PointsFile } | null; mode: Mode }) {
  const n = (x: number | undefined) => (x === undefined ? '–' : x.toLocaleString());
  const f = info?.points.facilities;
  return (
    <details className="border-t border-slate-200 pt-4 group">
      <summary className="text-sm font-semibold cursor-pointer flex items-center gap-2 list-none">
        <Info size={15} className="text-slate-400" /> Method & data
        <span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">show</span>
      </summary>
      <div className="text-xs text-slate-600 space-y-2.5 mt-3 leading-relaxed">
        <p><b className="text-slate-800">Street network.</b> OpenStreetMap walking network for Bengaluru, pulled with OSMnx ({n(info?.nodes)} intersections, {n(info?.edges)} directed street segments with lengths in metres).</p>
        <p><b className="text-slate-800">Settlement points.</b> {n(info?.points.informal.length)} informal and {n(info?.points.formal.length)} planned-area sample points, drawn from a Random Forest classifier (Sentinel-2 bands B4/B8/B11 + NDVI + NDBI, Jan–Feb 2024) trained on 509 mapped slum polygons, within 15 km of the city centre. They are samples of land type, not population counts.</p>
        <p><b className="text-slate-800">Facilities.</b> {n(f?.schools.length)} government schools, {n(f?.healthcare.length)} hospitals and {n(f?.fire.length)} fire stations from OSM. Current layer: {MODES[mode].source}. OSM is incomplete. Fire coverage looks low partly because only {n(f?.fire.length)} stations are mapped.</p>
        <p><b className="text-slate-800">Metric.</b> Every point and facility is snapped to its nearest street node. One multi-source Dijkstra gives each point's shortest walk to the nearest facility. "Within 1 km" uses the RTE walking-distance norm for primary schools. The Gini coefficient is computed over those walking distances.</p>
        <p><b className="text-slate-800">Engine.</b> The graph ships as a 6 MB binary (CSR adjacency) and Dijkstra runs in a Web Worker. Results match the NetworkX backend (<code>server.py</code>) to the reported precision. Run <code>npm run verify</code> to check.</p>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- map

function ClickCatcher({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function MapView({ info, mode, result, sites, showFormal, showFacilities, onClick }: {
  info: { points: PointsFile } | null; mode: Mode; result: ComputeResult | null; sites: Site[];
  showFormal: boolean; showFacilities: boolean; onClick: (lat: number, lng: number) => void;
}) {
  const bounds = info?.points.bounds;
  const facilities = info?.points.facilities[mode] ?? [];
  const noun = MODES[mode].noun;
  const maxBounds = useMemo(() => bounds ? [[bounds[0] - 0.05, bounds[1] - 0.05], [bounds[2] + 0.05, bounds[3] + 0.05]] as [[number, number], [number, number]] : undefined, [bounds]);

  return (
    <MapContainer center={[12.9716, 77.5946]} zoom={12} minZoom={10} maxBounds={maxBounds} preferCanvas zoomControl={false} className="h-full w-full">
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={16}
        attribution='Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors · Street graph &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      <ZoomControl position="bottomright" />
      <ClickCatcher onClick={onClick} />

      {showFacilities && facilities.map((f, i) => (
        <CircleMarker key={`f-${mode}-${i}`} center={[f.lat, f.lng]} radius={3} bubblingMouseEvents
          pathOptions={{ color: '#1d4ed8', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.9 }}>
          <Tooltip>{f.name || `Unnamed ${noun}`}</Tooltip>
        </CircleMarker>
      ))}

      {showFormal && result && info?.points.formal.map((p, i) => (
        <CircleMarker key={`p-${i}`} center={[p.lat, p.lng]} radius={3}
          pathOptions={{ color: '#64748b', weight: 1, fillColor: '#fff', fillOpacity: 1 }}>
          <Tooltip><b>Planned-area point</b><br />{fmtKm(result.formalDist[i])} walk to nearest {noun}</Tooltip>
        </CircleMarker>
      ))}

      {result && info?.points.informal.map((p, i) => {
        const d = result.informalDist[i], b = result.informalBaseDist[i];
        return (
          <CircleMarker key={`i-${i}`} center={[p.lat, p.lng]} radius={5}
            pathOptions={{ color: '#fff', weight: 1, fillColor: distColor(d), fillOpacity: 0.95 }}>
            <Tooltip>
              <b>Informal settlement point</b><br />
              {fmtKm(d)} walk to nearest {noun}
              {sites.length > 0 && d < b && <><br /><span style={{ color: '#059669' }}>was {fmtKm(b)}</span></>}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {sites.map((s, i) => (
        <CircleMarker key={`s-${s.node}`} center={[s.lat, s.lng]} radius={8}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#7c3aed', fillOpacity: 1 }}>
          <Tooltip><b>Proposed {noun} #{i + 1}</b><br />+{s.gain} settlement points within 1 km{s.snapM !== undefined && <><br />snapped {s.snapM.toFixed(0)} m to street</>}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

function Legend({ mode }: { mode: Mode }) {
  const item = (c: string, l: string, ring = false) => (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full inline-block" style={ring ? { border: '1.5px solid #64748b', background: '#fff' } : { background: c }} />{l}
    </div>
  );
  return (
    <div className="hidden md:block absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow border border-slate-200 px-3 py-2 text-[11px] text-slate-700 space-y-1">
      <p className="font-semibold text-slate-900">Walk to nearest {MODES[mode].noun}</p>
      {item('#059669', '≤ 1 km')}
      {item('#d97706', '1–2 km')}
      {item('#dc2626', '> 2 km')}
      <div className="border-t border-slate-200 my-1" />
      {item('#3b82f6', `Existing ${MODES[mode].noun}`)}
      {item('#7c3aed', 'Proposed site')}
      {item('', 'Planned-area point', true)}
    </div>
  );
}
