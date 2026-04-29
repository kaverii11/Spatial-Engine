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
