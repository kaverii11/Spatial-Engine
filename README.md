# 🛰️ EduGrid Spatial Engine

An advanced spatial analytics engine focused on tackling **Spatial Apartheid** by mapping, analyzing, and improving educational resource accessibility in dense urban environments. 

Built around modern spatial engineering heuristics, EduGrid evaluates whether public primary schools adhere to standard Right to Education (RTE) accessibility benchmarks (e.g., establishing school presence within 1km of impoverished demographic nodes).

---

## 🚀 Core Project Phases

### Phase 1: Environment Setup & Data Ingestion
- **Target RoI**: Bengaluru metropolitan area.
- **Data Pipelines**: Scaffolds core spatial frameworks (GeoPandas, OSMnx) capturing real-world OpenStreetMap (OSM) nodes representing regional road networks combined with public/government primary infrastructure listings.

### Phase 2: AI-Powered Satellite Classification
- Pulls multispectral surface reflectance imagery from **Sentinel-2 satellites**.
- Performs automated multi-feature engineering algorithms:
  - **NDVI** (Normalized Difference Vegetation Index): Resolves spatial green coverage.
  - **NDBI** (Normalized Difference Built-up Index): Correlates infrastructural densities against settlement layers.

### Phase 3: Spatial Analytics & Dijkstra Network Routing
- Builds directed spatial path vectors mapping localized pedestrian boundaries.
- Measures standard multi-source computational traversals snapping populations seamlessly to available resources.

### Phase 4: Live Performance Optimization
- Evaluates performance gains leveraging robust asynchronous queries.
- Outlines clear computational workflows utilizing advanced underlying GPU kernels.

---

## ⚡ City OS Engine & Backend Architecture

The EduGrid platform has evolved from a school-only prototype into a full **City OS Multi-Mode Spatial Engine**, introducing robust backend integrations and high-fidelity heuristic calculations:

### 🔄 Modernized Backend Integration (Happy Path & Fallback)
* **Real Dijkstra Routing Queries**: Replaced the frontend's mock `setTimeout` simulation with a live HTTP pipeline. Placing any new marker on the map triggers a `POST` request to `http://localhost:8000/simulate` transmitting coordinates and the active `poi_type`.
* **FastAPI Middleware**: Implemented `CORSMiddleware` in `server.py` allowing cross-origin requests (`*`) to facilitate unblocked development and production execution.
* **Resilient Graceful Fallback**: Implemented a defensive try/catch routing block in `App.tsx` that attempts high-fidelity live backend calculations first. If the server is offline or unreachable, the engine gracefully catches the error and activates a regional mock simulator, preserving UX continuity.

### 🏫 🏥 🚒 Segmented "City OS" toggle
The entire interface can now toggle between three critical civic infrastructure modes:
1. **Schools Mode**: Maps **RTE Compliance** benchmarks (1km walking distance metrics targeting students reached).
2. **Healthcare Mode**: Maps **WHO Access Score** benchmarks (citizens served per regional clinics snapped to nodes).
3. **Fire Stations Mode**: Maps **Fire Coverage** limits (total urban residents covered by stations snaps).

### 📊 Mode-Specific Heuristics & Adaptive Layout
* **Unique Baselines**: Instead of a hardcoded RTE school baseline, the engine utilizes dynamic starting coverage levels tailored to existing snapped infrastructure (`schools`: 32.4%, `healthcare`: 60.0%, `fire`: 4.8%).
* **Accurate ROI Scaling**: Return-on-Investment metrics dynamically adapt label copy (e.g. `Students / School` vs `Citizens / Clinic` vs `Residents / Station`) and apply non-negative relative delta formulas:
  $$\Delta = \max(0, \text{new\_compliance} - \text{baseline}) \times 450$$
* **Dynamic Choropleth**: Heatmap layers automatically scale their opacity and thresholds relative to active mode baselines.
* **Adaptive Flexbox Layout**: Embedded explicit `shrink-0` layout controls across all KPI panels to ensure large values (e.g. `61.5%`) are never cropped or vertically clipped when the dynamic leaderboard populates.

---

## 🗂️ Repository Structure
```
├── Data/                         # Processed demographic nodes and regional bounds
│   ├── informal_samples.geojson
│   └── bengaluru_schools_corrected.geojson
├── frontend/                     # Modern interface visualizing spatial equity 
│   ├── src/
│   │   ├── App.tsx               # High-performance interactive metrics
│   │   └── wardData.ts           # Mapped administrative bounds
├── server.py                     # FastAPI implementation processing core queries
└── Spatial_Apartheid_Phase1.ipynb # Step-by-step deployment notebook
```

## 🛠️ Installation Guide

### 1. Backend APIs
```bash
pip install fastapi uvicorn networkx osmnx geopandas
python server.py
```

### 2. Client Layer
```bash
cd frontend
npm install
npm run dev
```

---
*Formulated for modern urban sustainability deployments.*
