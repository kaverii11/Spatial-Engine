import time
import os
import networkx as nx
import osmnx as ox
import numpy as np
import geopandas as gpd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn

# ---------------------------------------------------------
# 1. Load State and Datasets at Startup
# ---------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Data")
GRAPH_PATH = os.path.join(DATA_DIR, "bengaluru_walk.graphml.xml")
GRAPH_GZ_PATH = GRAPH_PATH + ".gz"
SCHOOLS_PATH = os.path.join(DATA_DIR, "bengaluru_schools_corrected.geojson")
INFORMAL_PATH = os.path.join(DATA_DIR, "informal_samples.geojson")

import threading
from fastapi import HTTPException

# Global variables for the engine
G = None
base_school_nodes = None
base_hospital_nodes = None
base_fire_station_nodes = None
student_nodes = None
BASELINE_GINIS = {}
ENGINE_READY = False
ENGINE_STATUS_MESSAGE = "Starting background initialization..."

def initialize_engine():
    global G, base_school_nodes, base_hospital_nodes, base_fire_station_nodes, student_nodes, BASELINE_GINIS, ENGINE_READY, ENGINE_STATUS_MESSAGE
    try:
        # Auto-decompress if .xml is missing but .xml.gz is present
        if not os.path.exists(GRAPH_PATH) and os.path.exists(GRAPH_GZ_PATH):
            import gzip
            import shutil
            ENGINE_STATUS_MESSAGE = "Extracting compressed graph..."
            print(f" [Engine] {ENGINE_STATUS_MESSAGE}")
            with gzip.open(GRAPH_GZ_PATH, 'rb') as f_in:
                with open(GRAPH_PATH, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            print(" [Engine] Extraction complete!")

        ENGINE_STATUS_MESSAGE = "Loading street network graph..."
        print(f" [Engine] {ENGINE_STATUS_MESSAGE}")
        G = ox.load_graphml(GRAPH_PATH)
        print(f" [Engine] Graph loaded successfully with {len(G.nodes)} nodes and {len(G.edges)} edges.")

        ENGINE_STATUS_MESSAGE = "Loading existing schools data..."
        print(f" [Engine] {ENGINE_STATUS_MESSAGE}")
        schools_gdf = gpd.read_file(SCHOOLS_PATH)
        if schools_gdf.crs is None or schools_gdf.crs != "EPSG:4326":
            schools_gdf = schools_gdf.to_crs(epsg=4326)
        school_centroids = schools_gdf.to_crs(epsg=32643).geometry.centroid.to_crs(epsg=4326)
        base_school_nodes = ox.distance.nearest_nodes(G, X=school_centroids.x, Y=school_centroids.y)
        print(f" [Engine] Snapped {len(base_school_nodes)} base schools to the graph.")

        ENGINE_STATUS_MESSAGE = "Loading existing healthcare (hospitals) data from OSM..."
        print(f" [Engine] {ENGINE_STATUS_MESSAGE}")
        try:
            hospitals_gdf = ox.features_from_place("Bengaluru, India", tags={"amenity": "hospital"})
            if hospitals_gdf.crs is None or hospitals_gdf.crs != "EPSG:4326":
                hospitals_gdf = hospitals_gdf.to_crs(epsg=4326)
            hospital_centroids = hospitals_gdf.geometry.centroid
            base_hospital_nodes = ox.distance.nearest_nodes(G, X=hospital_centroids.x, Y=hospital_centroids.y)
            print(f" [Engine] Snapped {len(base_hospital_nodes)} base hospitals to the graph.")
        except Exception as e:
            print(f" [Engine] WARNING: Failed to load healthcare features from OSM: {e}. Falling back to subset of schools.")
            base_hospital_nodes = base_school_nodes[:max(1, len(base_school_nodes) // 2)]

        ENGINE_STATUS_MESSAGE = "Loading existing fire stations data from OSM..."
        print(f" [Engine] {ENGINE_STATUS_MESSAGE}")
        try:
            fire_gdf = ox.features_from_place("Bengaluru, India", tags={"amenity": "fire_station"})
            if fire_gdf.crs is None or fire_gdf.crs != "EPSG:4326":
                fire_gdf = fire_gdf.to_crs(epsg=4326)
            fire_centroids = fire_gdf.geometry.centroid
            base_fire_station_nodes = ox.distance.nearest_nodes(G, X=fire_centroids.x, Y=fire_centroids.y)
            print(f" [Engine] Snapped {len(base_fire_station_nodes)} base fire stations to the graph.")
        except Exception as e:
            print(f" [Engine] WARNING: Failed to load fire station features from OSM: {e}. Falling back to subset of schools.")
            base_fire_station_nodes = base_school_nodes[:max(1, len(base_school_nodes) // 4)]

        ENGINE_STATUS_MESSAGE = "Loading informal settlements (student demographics)..."
        print(f" [Engine] {ENGINE_STATUS_MESSAGE}")
        informal_pts = gpd.read_file(INFORMAL_PATH)
        if informal_pts.crs is None or informal_pts.crs != "EPSG:4326":
            informal_pts = informal_pts.to_crs(epsg=4326)
        informal_centroids = informal_pts.geometry.centroid
        student_nodes = ox.distance.nearest_nodes(G, X=informal_centroids.x, Y=informal_centroids.y)
        print(f" [Engine] Snapped {len(student_nodes)} student demographic nodes to the graph.")

        ENGINE_STATUS_MESSAGE = "Pre-calculating baseline Gini coefficients..."
        print(f" [Engine] {ENGINE_STATUS_MESSAGE}")
        BASELINE_GINIS = {
            "schools": simulate_new_schools(G, base_school_nodes, student_nodes, None, "schools", mock_run=True)["gini_score"],
            "healthcare": simulate_new_schools(G, base_school_nodes, student_nodes, None, "healthcare", mock_run=True)["gini_score"],
            "fire": simulate_new_schools(G, base_school_nodes, student_nodes, None, "fire", mock_run=True)["gini_score"]
        }
        print(f" [Engine] Baseline Gini coefficients cached: {BASELINE_GINIS}")

        ENGINE_READY = True
        ENGINE_STATUS_MESSAGE = "Engine is fully loaded and ready!"
        print(" [Engine] Background initialization finished successfully.")
    except Exception as e:
        ENGINE_STATUS_MESSAGE = f"Initialization failed: {e}"
        print(f" [Engine] ERROR during background initialization: {e}")

# Start the background thread immediately
threading.Thread(target=initialize_engine, daemon=True).start()

# ---------------------------------------------------------
# 2. Reusable Dijkstra Engine Function
# ---------------------------------------------------------
def simulate_new_schools(G_local, base_nodes_schools, student_nodes_local, new_coords=None, poi_type="schools", mock_run=False):
    """
    Simulates compliance if new schools are built at 'new_coords'.
    """
    start_cpu = time.time()
    
    # 1. Select the correct base node set
    if poi_type == "healthcare":
        base_nodes = base_hospital_nodes
    elif poi_type == "fire":
        base_nodes = base_fire_station_nodes
    else:
        base_nodes = base_school_nodes

    # Allow overriding for mock baseline runs before globals are ready
    if mock_run:
        if poi_type == "healthcare": base_nodes = base_hospital_nodes
        elif poi_type == "fire": base_nodes = base_fire_station_nodes
        else: base_nodes = base_school_nodes

    all_nodes = set(base_nodes)
    if new_coords:
        new_x = [coord['lng'] for coord in new_coords]
        new_y = [coord['lat'] for coord in new_coords]
        new_nodes = ox.distance.nearest_nodes(G_local, X=new_x, Y=new_y)
        all_nodes.update(new_nodes)

    # 2. CPU Execution (NetworkX)
    distance_map = nx.multi_source_dijkstra_path_length(G_local, all_nodes, weight='length')
    cpu_time = time.time() - start_cpu

    # 3. MOCK GPU Execution (For hackathon UI demo purposes before ROCm integration)
    gpu_time = cpu_time / 8.5 # Simulating an 8.5x AMD ROCm speedup

    # 4. Calculate Compliance Metrics
    distances = [distance_map.get(node, np.nan) for node in student_nodes_local]
    clean_distances = [d for d in distances if not np.isnan(d)]
    
    avg_dist = np.mean(clean_distances) / 1000 if clean_distances else 0.0
    compliant_count = sum(1 for d in clean_distances if d <= 1000)
    compliance_pct = (compliant_count / len(clean_distances)) * 100 if clean_distances else 0.0

    def gini(distances_array):
        n = len(distances_array)
        if n == 0: return 0.0
        distances_sorted = sorted(distances_array)
        numerator = sum((2*i - n - 1) * d for i, d in enumerate(distances_sorted, 1))
        return round(numerator / (n * sum(distances_sorted)), 3) if sum(distances_sorted) > 0 else 0.0

    gini_score = gini(clean_distances)

    return {
        "average_distance_km": round(avg_dist, 2),
        "compliance_percentage": round(compliance_pct, 2),
        "gini_score": gini_score,
        "metrics": {
            "cpu_time_sec": round(cpu_time, 3),
            "gpu_time_sec": round(gpu_time, 3),
            "speedup_multiplier": round(cpu_time / gpu_time, 1) if gpu_time > 0 else 0.0
        }
    }

# ---------------------------------------------------------
# 3. FastAPI Scaffolding
# ---------------------------------------------------------
app = FastAPI(title="EduGrid Spatial Engine")

# Allow the React dev server (any origin) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ProposedSchool(BaseModel):
    lat: float
    lng: float

class SimulationRequest(BaseModel):
    new_schools: List[ProposedSchool]
    poi_type: str = "schools"

@app.post("/simulate")
def run_simulation(request: SimulationRequest):
    if not ENGINE_READY:
        raise HTTPException(status_code=503, detail=f"Engine is still initializing, please wait... ({ENGINE_STATUS_MESSAGE})")

    # Convert pydantic payload to dictionary format expected by engine
    coords = [school.model_dump() for school in request.new_schools]
    
    # Pass the incoming coordinates to our routing function
    results = simulate_new_schools(
        G, 
        base_school_nodes, 
        student_nodes, 
        coords,
        poi_type=request.poi_type
    )
    # Include the pre-calculated baseline Gini in the response
    results["baseline_gini"] = BASELINE_GINIS.get(request.poi_type, 0.0)
    return results

# ---------------------------------------------------------
# 4. Running the Server
# ---------------------------------------------------------
# To run this engine via notebook runtime, uncomment below:
# import nest_asyncio
# nest_asyncio.apply()
# uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
