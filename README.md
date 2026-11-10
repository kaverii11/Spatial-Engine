# City OS Spatial Engine

How far do people in Bengaluru's informal settlements walk to a government school, a hospital or a fire station? And where would new facilities help most?

The engine computes **real walking distances along the street network**, not straight lines. It uses OpenStreetMap's Bengaluru walk graph (184,909 intersections) and runs multi-source Dijkstra from every facility to every settlement point. The interactive map lets you click to propose a new site, or ask for the best N sites, and recomputes everything live in the browser.

## What the app does

- **Three facility layers:** 257 government schools, 1,076 hospitals and 20 fire stations from OSM.
- **Settlement points:** 358 informal and 642 planned-area sample points. They come from a Random Forest classifier on Sentinel-2 imagery (bands B4/B8/B11 + NDVI + NDBI, Jan–Feb 2024), trained on 509 mapped slum polygons.
- **Metrics:** share of points within a 1 km walk (the RTE norm for primary schools), average and median walk, and the Gini coefficient of walking distances. Informal and planned areas are shown side by side.
- **Click to propose a site:** it snaps to the nearest street node, and every distance is recomputed (about 50–250 ms for the full graph in the browser).
- **Suggest best N:** greedy max-coverage. Each step picks the settlement location that brings the most still-uncovered settlement points within 1 km.

### Baseline results (informal vs planned points within 1 km walk)

| Facility | Informal | Planned | Avg walk (informal) |
| :-- | --: | --: | --: |
| Govt schools | 39.7% | 32.1% | 1.43 km |
| Hospitals | 61.7% | 53.4% | 0.96 km |
| Fire stations | 3.9% | 3.4% | 4.03 km |

On this sample, informal points are *not* farther from facilities on average than planned-area points. Fire coverage is low partly because OSM lists only 20 fire stations in the city.

## Architecture

```
Data/ (OSM graph, GeoJSON)  ──►  scripts/export_web_data.py  ──►  frontend/public/data/
                                   snaps points with OSMnx           graph.bin  (6 MB CSR adjacency)
                                   writes NetworkX reference         points.json
                                                                     reference.json
frontend/
  src/engine.ts    Dijkstra (binary heap over typed arrays), bounded Dijkstra, Gini,
                   grid nearest-node index, greedy max-coverage
  src/worker.ts    runs the engine in a Web Worker so the map never freezes
  src/App.tsx      React + Leaflet UI
server.py          original FastAPI + NetworkX backend (same maths, not needed by the frontend)
```

The frontend is fully static, so it can deploy anywhere (Vercel, GitHub Pages) with no backend.

**Correctness check:** `npm run verify` runs the browser engine in Node and compares it with NetworkX on all three layers, for informal points, planned points, and with extra facilities added. Results match the reported precision. Nearest-node snapping matches OSMnx except for 4 of 615 points, which are sub-metre ties.

## Running it

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run verify       # JS engine vs NetworkX reference
npm run build        # static site in frontend/dist
```

Regenerate the web data (needs `osmnx geopandas networkx scikit-learn`):

```bash
python3 scripts/export_web_data.py
```

Original backend (optional):

```bash
pip install -r requirements.txt
python server.py     # POST /simulate on :8000
```

## Limitations

- Settlement points are land-type samples, not population counts.
- OSM facility data is incomplete, and "hospital" includes private hospitals.
- Proposed sites are candidate street nodes. The engine does not model land availability, capacity or cost.
- The analysis covers Bengaluru only, the one city with a downloaded street graph.

`Spatial_Apartheid_Phase1 (1).ipynb` holds the original data pipeline: OSM download, Sentinel-2 classification in Earth Engine, and the first routing run.
