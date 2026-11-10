"""
Export the Bengaluru walk graph + point datasets into compact files the
browser can load, so the frontend can run the same multi-source Dijkstra
as server.py without a backend.

Outputs (frontend/public/data/):
  graph.bin      CSR adjacency of the directed walk graph
                 header: magic 'SEG1', uint32 N, uint32 E
                 float32[2N] lon,lat   uint32[N+1] offsets
                 uint32[E] targets     float32[E] lengths (metres)
  points.json    informal / formal samples, schools, hospitals, fire stations,
                 each with its snapped graph-node index
  reference.json Python (NetworkX) results used to check the JS engine

Run from repo root:  python3 scripts/export_web_data.py
"""
import gzip, json, os, shutil, struct, sys, time

import geopandas as gpd
import networkx as nx
import numpy as np
import osmnx as ox

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "Data")
OUT = os.path.join(ROOT, "frontend", "public", "data")
os.makedirs(OUT, exist_ok=True)

GRAPH = os.path.join(DATA, "bengaluru_walk.graphml.xml")
if not os.path.exists(GRAPH):
    with gzip.open(GRAPH + ".gz", "rb") as fi, open(GRAPH, "wb") as fo:
        shutil.copyfileobj(fi, fo)

print("loading graph...")
G = ox.load_graphml(GRAPH)
nodes = list(G.nodes)
idx = {n: i for i, n in enumerate(nodes)}
N = len(nodes)

# Collapse parallel edges to the shortest one, exactly as Dijkstra would see them
best = {}
for u, v, d in G.edges(data=True):
    k = (idx[u], idx[v])
    L = float(d["length"])
    if k not in best or L < best[k]:
        best[k] = L
pairs = sorted(best.items())
E = len(pairs)
offsets = np.zeros(N + 1, dtype=np.uint32)
for (u, _), _ in pairs:
    offsets[u + 1] += 1
offsets = np.cumsum(offsets, dtype=np.uint32)
targets = np.array([v for (_, v), _ in pairs], dtype=np.uint32)
lengths = np.array([L for _, L in pairs], dtype=np.float32)
coords = np.array([[G.nodes[n]["x"], G.nodes[n]["y"]] for n in nodes], dtype=np.float32).ravel()

with open(os.path.join(OUT, "graph.bin"), "wb") as f:
    f.write(b"SEG1")
    f.write(struct.pack("<II", N, E))
    f.write(coords.tobytes())
    f.write(offsets.tobytes())
    f.write(targets.tobytes())
    f.write(lengths.tobytes())
print(f"graph.bin: {N} nodes, {E} directed edges")


def centroids(gdf):
    gdf = gdf.to_crs(epsg=4326) if gdf.crs is not None else gdf.set_crs(epsg=4326)
    return gdf.to_crs(epsg=32643).geometry.centroid.to_crs(epsg=4326)


def snap(c):
    return [idx[n] for n in ox.distance.nearest_nodes(G, X=c.x.values, Y=c.y.values)]


def pack(c, names=None):
    snapped = snap(c)
    out = []
    for i, (x, y) in enumerate(zip(c.x.values, c.y.values)):
        row = {"lat": round(float(y), 6), "lng": round(float(x), 6), "node": snapped[i]}
        if names is not None and isinstance(names[i], str):
            row["name"] = names[i]
        out.append(row)
    return out


informal = gpd.read_file(os.path.join(DATA, "informal_samples.geojson"))
formal = gpd.read_file(os.path.join(DATA, "formal_samples.geojson"))
schools = gpd.read_file(os.path.join(DATA, "bengaluru_schools_corrected.geojson"))

# Hospitals / fire stations: same OSM query server.py runs at startup.
# Cached to Data/ so the export is reproducible offline after the first run.
def osm_layer(tag, fname):
    path = os.path.join(DATA, fname)
    if not os.path.exists(path):
        print(f"fetching {tag} from OSM...")
        g = ox.features_from_place("Bengaluru, India", tags={"amenity": tag})
        g = g[["name", "geometry"]].reset_index(drop=True) if "name" in g else g[["geometry"]].reset_index(drop=True)
        g.to_file(path, driver="GeoJSON")
    return gpd.read_file(path)

hospitals = osm_layer("hospital", "bengaluru_hospitals_osm.geojson")
fire = osm_layer("fire_station", "bengaluru_fire_stations_osm.geojson")

def names_of(g):
    return list(g["name"]) if "name" in g.columns else None

points = {
    "informal": pack(centroids(informal)),
    "formal": pack(centroids(formal)),
    "facilities": {
        "schools": pack(centroids(schools), names_of(schools)),
        "healthcare": pack(centroids(hospitals), names_of(hospitals)),
        "fire": pack(centroids(fire), names_of(fire)),
    },
    "bounds": [float(coords[1::2].min()), float(coords[0::2].min()),
               float(coords[1::2].max()), float(coords[0::2].max())],
}
with open(os.path.join(OUT, "points.json"), "w") as f:
    json.dump(points, f, separators=(",", ":"))
print({k: len(v) for k, v in points["facilities"].items()},
      "informal", len(points["informal"]), "formal", len(points["formal"]))


# ---- reference numbers (same formulas as server.py) ----
def gini(a):
    n = len(a)
    if n == 0:
        return 0.0
    a = sorted(a)
    s = sum(a)
    return round(sum((2 * i - n - 1) * d for i, d in enumerate(a, 1)) / (n * s), 3) if s > 0 else 0.0


def metrics(src_idx, pts):
    dm = nx.multi_source_dijkstra_path_length(G, {nodes[i] for i in src_idx}, weight="length")
    d = [dm[nodes[p["node"]]] for p in pts if nodes[p["node"]] in dm]
    return {
        "reachable": len(d),
        "avg_km": round(float(np.mean(d)) / 1000, 4) if d else 0.0,
        "compliance_pct": round(sum(1 for x in d if x <= 1000) / len(d) * 100, 4) if d else 0.0,
        "gini": gini(d),
    }


rng = np.random.default_rng(7)
extra = [int(x) for x in rng.choice(N, 5, replace=False)]
ref = {}
for mode, fac in points["facilities"].items():
    base = [p["node"] for p in fac]
    t = time.time()
    ref[mode] = {
        "informal": metrics(base, points["informal"]),
        "formal": metrics(base, points["formal"]),
        "with_extra": metrics(base + extra, points["informal"]),
        "py_seconds": round(time.time() - t, 2),
    }
ref["extra_nodes"] = extra
with open(os.path.join(OUT, "reference.json"), "w") as f:
    json.dump(ref, f, indent=1)
print(json.dumps(ref, indent=1))
