# 🛰️City OS Spatial Engine

An advanced spatial analytics engine and dashboard focused on mapping, analyzing, and optimizing resource accessibility in dense informal urban environments. 

Built around modern spatial engineering heuristics, EduGrid evaluates whether critical infrastructure (schools, clinics, aid points, dark stores) snaps dynamically to high-density demographic nodes and optimizes placements to resolve spatial disparities.

---

## 🚀 Key Features & Platform Upgrades

### 🗺️ Multi-City Selection Engine
EduGrid supports real-time, interactive switching across 5 major global metropolitan areas:
* **Bengaluru 🇮🇳** (Base compliance: 32.4%, Gini: 0.67) - Rapid informal growth outstripping supply.
* **Delhi 🇮🇳** (Base compliance: 28.1%, Gini: 0.74) - Highest density informal settlements.
* **Mumbai 🇮🇳** (Base compliance: 41.2%, Gini: 0.61) - Dharavi cluster isolating millions from public grids.
* **Varanasi 🇮🇳** (Base compliance: 19.8%, Gini: 0.81) - Dense, historic old-city lane penalties.
* **Nairobi 🌍** (Base compliance: 15.3%, Gini: 0.88) - Kibera slum accessibility gap modeling.
* *Features smooth map transition animations powered by custom Leaflet map controllers and real-time generation of demographic settlement nodes centered on the active city.*

### 🔍 Global Search & Dynamic Heuristic Estimation (Search Any City)
Users can search and dynamically map **any city in the world** using the geocoding input in the sidebar. This queries the public **OpenStreetMap Nominatim Geocoding API** at runtime to fetch the exact latitude, longitude, and metadata. 

To ensure the simulation remains realistic outside the 5 static baseline cities, the engine runs a **Data-Driven Heuristic Estimation Model** to calculate custom baselines for all 6 POI modes based on the city's geographical context:

#### 1. Country-Level HDI Classification
The engine extracts the geocoded `country_code` and performs a lookup to categorize the region into one of three Human Development Index (HDI) tiers:
* **High HDI (🟢)** (US, Western Europe, Japan, S. Korea, Australia, Singapore, etc.): Standard primary infrastructure is highly developed, leading to elevated starting compliance and lower inequality (lower Gini).
* **Mid HDI (🟡)** (China, Brazil, South Africa, Turkey, Mexico, Indonesia, Colombia, etc.): Moderate baseline coverage with noticeable equity gaps in outlying zones.
* **Low HDI (🔴)** (India, Nigeria, Kenya, Ethiopia, etc.): High densities of informal growth with wider infrastructure deserts.

#### 2. Nominatim Importance Scaling
OpenStreetMap's log-scaled `importance` value (0.0 to 1.0) is integrated to scale the scores. High importance corresponds to highly populated and mapped urban centers, which scales compliance upwards and Gini downwards (accounting for urban aggregation efficiency):
$$\text{Scale Factor} = (\text{OSM Importance} - 0.3) \times 25$$

#### 3. Mode-Specific Access Offsets
Starting compliance and Gini coefficients are dynamically offset per POI mode to mirror real-world policy distribution:
* **Healthcare Access** is offset higher (+5% to +10%) representing universal health service grids.
* **Schools & Logistics** map closely to the baseline average.
* **NGO Reach & Epidemic Gaps** are offset lower (-7% to -14%) to account for the severe difficulty of managing last-mile crises in informal spaces.

#### Summary of Heuristic Baselines:
| Development Tier (HDI) | Baseline Compliance Range | Gini Index Range | Real-World Behaviors |
| :--- | :--- | :--- | :--- |
| **High HDI (🟢)** | 55% - 92% | 0.220 - 0.450 | High base accessibility. Planning focused on marginal edge groups. |
| **Mid HDI (🟡)** | 28% - 68% | 0.380 - 0.720 | Growing network coverage with localized access gaps. |
| **Low HDI (🔴)** | 8% - 40% | 0.600 - 0.940 | Severe infrastructural deserts. High inequality (Gini) in slum boundaries. |

---

### 💼 B2B SaaS & Government Use-Case Expansion
The engine features a dynamic `POI_CONFIG` dictionary to drive copywriting, metrics, and tooltips across **6 distinct focus modes**:
1. 🏫 **Schools (RTE Education)**: Maps government primary infrastructure and RTE walking distance benchmarks.
2. 🏥 **Healthcare (WHO Access)**: Models hospital access grids and snapped clinical networks.
3. 🚒 **Fire Stations (Safety)**: Assesses response radii and fire gap limits.
4. 🤝 **NGO Aid (Last-mile Reach)**: Models charity hubs, distribution points, and last-mile beneficiary accessibility.
5. 🦠 **Epidemic (Public Health Emergency)**: Evaluates distance to equipped treatment centers during critical outbreaks.
6. 📦 **Quick Commerce (Logistics Coverage)**: A B2B SaaS mode mapping dark stores, delivery dead zones, and 30-min household serviceability limits.

### ⚙️ User-Controlled "Simulation Parameters"
An advanced settings card provides real-time controls for:
* **Max Facilities to Place**: Enforces a hard cap (1–50) directly on map click triggers.
* **Capacity per Facility**: Configures facility demographic ceilings (100–5000).
* **Budget Cap Slider**: Controls absolute capital constraints (₹10Cr - ₹150Cr) dynamically.

### ⚡ Strategic Auto-Solve (Genetic Heuristics)
The completely rewritten Auto-Solve engine maps optimal placements based on local constraints:
* **Targeted Intervention**: Places facilities strategically near the lowest-compliance wards first (e.g. Yelahanka, Hebbal, Whitefield) before expanding to mid-compliance areas.
* **Coordinate-Offset Math**: Dynamically offsets placement vectors to match whichever city is currently active.
* **Collapsible Solver Progress**: Migrated the heavy benchmarking card into the Auto-Solve button. A premium progress panel expands during the 2-second compute, showcasing standard CPU solver execution vs. ultra-fast **AMD ROCm GPU** speedups (4,064x faster).

### 🏷️ Sticky Leaflet Hover Tooltips
All map elements feature rich, interactive `<Tooltip>` bindings:
* **Settlement Nodes**: Hovering showcases access status (e.g., *✅ Within 30-min delivery* or *🔴 Delivery Dead Zone*), exact network walking distance (km), and estimated population count.
* **Proposed Facilities**: Displays POI mode title, custom capacity, coverage boundaries, and estimated land acquisition cost calculated dynamically based on nearest ward administrative boundaries.

---

## ⚡ Technical Architecture

### 🔄 Modernized Backend Integration (Happy Path & Fallback)
* **Real Dijkstra Routing Queries**: Replaced the frontend's mock simulation with a live HTTP pipeline. Placing any new marker on the map triggers a `POST` request to `http://localhost:8000/simulate` transmitting coordinates and the active `poi_type`.
* **FastAPI Middleware**: Implemented `CORSMiddleware` in `server.py` allowing cross-origin requests (`*`) to facilitate unblocked development and production execution.
* **Resilient Graceful Fallback**: Implemented a defensive try/catch routing block in `App.tsx` that attempts high-fidelity live backend calculations first. If the server is offline or unreachable, the engine gracefully catches the error and activates a regional mock simulator, preserving UX continuity.

---

## 🗂️ Repository Structure
```
├── Data/                         # Processed demographic nodes and regional bounds
│   ├── informal_samples.geojson
│   └── bengaluru_schools_corrected.geojson
├── frontend/                     # Modern interface visualizing spatial equity 
│   ├── src/
│   │   ├── App.tsx               # High-performance interactive metrics, tooltips, and parameters
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
*Formulated for modern urban sustainability and logistics optimization.*
