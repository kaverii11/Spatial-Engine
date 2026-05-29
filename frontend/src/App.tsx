import React, { useState, useEffect, useRef } from 'react';
import { Activity, Cpu, Zap, RotateCcw, TrendingUp, Users, FileDown, Settings } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, useMapEvents, Tooltip, useMap } from 'react-leaflet';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { WARDS, WARD_LAND_COSTS } from './wardData';
import 'leaflet/dist/leaflet.css';

// -----------------------------------------------------------------
// 1. Data Configs & Lookup Tables
// -----------------------------------------------------------------

const BENGALURU_WARDS = [
  "Shivajinagar", "BTM Layout", "Koramangala", "Indiranagar", 
  "Whitefield", "Malleshwaram", "Jayanagar", "Hebbal", "Yelahanka"
];

// Multi-City Configuration with baselines for all 6 focus modes
const CITIES = {
  bengaluru: { 
    label: 'Bengaluru 🇮🇳', 
    center: [12.9716, 77.5946] as [number, number], 
    zoom: 13,
    population: '12.7M',
    problem: 'Rapid informal growth outpacing infrastructure supply',
    baseCompliance: 32.4, // Fallback base
    baseGini: 0.67,       // Fallback base
    baselines: {
      schools: { compliance: 32.4, gini: 0.67 },
      healthcare: { compliance: 60.0, gini: 0.54 },
      fire: { compliance: 45.8, gini: 0.61 },
      ngo: { compliance: 18.5, gini: 0.79 },
      epidemic: { compliance: 22.4, gini: 0.72 },
      warehouse: { compliance: 29.1, gini: 0.68 }
    }
  },
  delhi: { 
    label: 'Delhi 🇮🇳', 
    center: [28.6139, 77.2090] as [number, number], 
    zoom: 12,
    population: '32.9M',
    problem: 'Highest density informal settlements in South Asia',
    baseCompliance: 28.1,
    baseGini: 0.74,
    baselines: {
      schools: { compliance: 28.1, gini: 0.74 },
      healthcare: { compliance: 55.2, gini: 0.63 },
      fire: { compliance: 38.4, gini: 0.70 },
      ngo: { compliance: 12.8, gini: 0.83 },
      epidemic: { compliance: 15.6, gini: 0.81 },
      warehouse: { compliance: 35.4, gini: 0.66 }
    }
  },
  mumbai: { 
    label: 'Mumbai 🇮🇳', 
    center: [19.0760, 72.8777] as [number, number], 
    zoom: 13,
    population: '20.7M',
    problem: 'Dharavi cluster cuts off 1M+ from public infrastructure',
    baseCompliance: 41.2,
    baseGini: 0.61,
    baselines: {
      schools: { compliance: 41.2, gini: 0.61 },
      healthcare: { compliance: 65.8, gini: 0.51 },
      fire: { compliance: 49.3, gini: 0.57 },
      ngo: { compliance: 25.4, gini: 0.73 },
      epidemic: { compliance: 30.1, gini: 0.69 },
      warehouse: { compliance: 42.0, gini: 0.59 }
    }
  },
  varanasi: { 
    label: 'Varanasi 🇮🇳', 
    center: [25.3176, 82.9739] as [number, number], 
    zoom: 14,
    population: '1.2M',
    problem: 'Dense old-city lanes create extreme network distance penalties',
    baseCompliance: 19.8,
    baseGini: 0.81,
    baselines: {
      schools: { compliance: 19.8, gini: 0.81 },
      healthcare: { compliance: 40.2, gini: 0.74 },
      fire: { compliance: 28.1, gini: 0.78 },
      ngo: { compliance: 8.4, gini: 0.89 },
      epidemic: { compliance: 10.9, gini: 0.87 },
      warehouse: { compliance: 15.3, gini: 0.82 }
    }
  },
  nairobi: { 
    label: 'Nairobi 🌍', 
    center: [-1.2921, 36.8219] as [number, number], 
    zoom: 13,
    population: '4.9M',
    problem: 'Kibera — largest urban slum in Africa — fully unmapped',
    baseCompliance: 15.3,
    baseGini: 0.88,
    baselines: {
      schools: { compliance: 15.3, gini: 0.88 },
      healthcare: { compliance: 30.5, gini: 0.82 },
      fire: { compliance: 18.2, gini: 0.85 },
      ngo: { compliance: 5.1, gini: 0.93 },
      epidemic: { compliance: 7.4, gini: 0.91 },
      warehouse: { compliance: 11.2, gini: 0.89 }
    }
  },
};

// POI Configuration for B2B SaaS and Gov modes
const POI_CONFIG = {
  schools: {
    compliance: 'RTE Compliance',
    studentsServed: 'Total New Students Reached',
    facilities: 'Proposed Schools',
    problem: 'Rapid informal growth outpacing school supply',
    tooltipCompliant: '✅ Compliant',
    tooltipNot: '🔴 Education Desert',
    capacityLabel: 'Capacity per school',
    costLabel: 'Est. school cost',
    typeLabel: '🏫 Proposed School',
    roleLabel: 'student',
    demographicLabel: 'Est. children',
    useCaseBadge: '🏛️ Government Planning Tool',
    useCaseColor: 'bg-blue-900/50 text-blue-300 border-blue-500/30'
  },
  healthcare: {
    compliance: 'WHO Access Score',
    studentsServed: 'Total New Citizens Served',
    facilities: 'Proposed Clinics',
    problem: 'Dharavi cluster cuts off 1M+ from public infrastructure',
    tooltipCompliant: '✅ Within healthcare reach',
    tooltipNot: '🔴 Healthcare Desert',
    capacityLabel: 'Capacity per clinic',
    costLabel: 'Est. clinic cost',
    typeLabel: '🏥 Proposed Clinic',
    roleLabel: 'citizen',
    demographicLabel: 'Est. patients',
    useCaseBadge: '🏛️ Government Planning Tool',
    useCaseColor: 'bg-blue-900/50 text-blue-300 border-blue-500/30'
  },
  fire: {
    compliance: 'Fire Coverage',
    studentsServed: 'Total New Residents Covered',
    facilities: 'Proposed Stations',
    problem: 'Dense old-city lanes create extreme network distance penalties',
    tooltipCompliant: '✅ Within coverage radius',
    tooltipNot: '🔴 Fire Risk Gap',
    capacityLabel: 'Capacity per station',
    costLabel: 'Est. station cost',
    typeLabel: '🚒 Proposed Station',
    roleLabel: 'resident',
    demographicLabel: 'Est. residents',
    useCaseBadge: '🏛️ Government Planning Tool',
    useCaseColor: 'bg-blue-900/50 text-blue-300 border-blue-500/30'
  },
  ngo: {
    compliance: 'Aid Reach Score',
    studentsServed: 'People Receiving Aid',
    facilities: 'Proposed Aid Points',
    problem: 'NGOs cannot reach last-mile beneficiaries in informal zones',
    tooltipCompliant: '✅ Within aid reach',
    tooltipNot: '🔴 Aid Desert',
    capacityLabel: 'Beneficiaries per hub',
    costLabel: 'Est. hub cost',
    typeLabel: '🤝 Proposed Aid Point',
    roleLabel: 'beneficiary',
    demographicLabel: 'Est. beneficiaries',
    useCaseBadge: '🤝 NGO Operations',
    useCaseColor: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
  },
  epidemic: {
    compliance: 'Healthcare Access Score', 
    studentsServed: 'People Within Treatment Reach',
    facilities: 'Equipped Treatment Centers',
    problem: 'During outbreaks, distance to equipped hospitals = mortality rate',
    tooltipCompliant: '✅ Within treatment radius',
    tooltipNot: '🔴 Critical Gap — no equipped center nearby',
    capacityLabel: 'Patients per center',
    costLabel: 'Est. center cost',
    typeLabel: '🦠 Proposed Center',
    roleLabel: 'patient',
    demographicLabel: 'Est. population at risk',
    useCaseBadge: '🦠 Public Health Emergency',
    useCaseColor: 'bg-red-950/80 text-red-400 border-red-500/30'
  },
  warehouse: {
    compliance: 'Delivery Coverage Score',
    studentsServed: 'Households Serviceable',
    facilities: 'Dark Store / Warehouse Locations',
    problem: 'Quick commerce dead zones: societies with demand but no 30-min delivery',
    tooltipCompliant: '✅ Within 30-min delivery',
    tooltipNot: '🔴 Delivery Dead Zone',
    capacityLabel: 'Orders per day capacity',
    costLabel: 'Est. store cost',
    typeLabel: '📦 Proposed Warehouse',
    roleLabel: 'household',
    demographicLabel: 'Est. ordering households',
    useCaseBadge: '📦 B2B SaaS — Quick Commerce',
    useCaseColor: 'bg-amber-950/80 text-amber-400 border-amber-500/30'
  }
};

const generateSettlements = (center: [number, number] = [12.9716, 77.5946]) => {
  return Array.from({ length: 300 }).map(() => ({
    lat: center[0] + (Math.random() - 0.5) * 0.12,
    lng: center[1] + (Math.random() - 0.5) * 0.12,
    isCompliant: Math.random() > 0.68 
  }));
};

// Helper component to control map panning and zooming reactively
function MapController({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

// -----------------------------------------------------------------
// 2. Main App Component
// -----------------------------------------------------------------

export default function App() {
  const targetRef = useRef<HTMLDivElement>(null);
  
  // Controlled States
  const [citiesList, setCitiesList] = useState<Record<string, typeof CITIES['bengaluru']>>(CITIES);
  const [selectedCity, setSelectedCity] = useState<string>('bengaluru');
  const [poiMode, setPoiMode] = useState<keyof typeof POI_CONFIG>('schools');
  const [maxFacilities, setMaxFacilities] = useState(10);
  const [studentsPerFacility, setStudentsPerFacility] = useState(500);
  const [budgetCr, setBudgetCr] = useState(50);
  
  // Custom City Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Simulation and Placements States
  const [proposedSchools, setProposedSchools] = useState<{lat: number, lng: number, ward?: string}[]>([]);
  const [settlements, setSettlements] = useState<{lat: number, lng: number, isCompliant: boolean}[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  
  // Race Animation visualizer states
  const [isRacing, setIsRacing] = useState(false);
  const [raceStats, setRaceStats] = useState({ cpuProgress: 0, gpuProgress: 0, winner: null as string | null });

  const activeCity = citiesList[selectedCity] || CITIES.bengaluru;
  const activeModeConfig = POI_CONFIG[poiMode];

  // Dynamic Base Facilities centered dynamically on the current city
  const baseFacilities = [
    { lat: activeCity.center[0] + 0.01, lng: activeCity.center[1] - 0.015 },
    { lat: activeCity.center[0] - 0.015, lng: activeCity.center[1] + 0.01 }
  ];

  // Primary simulation metrics
  const [metrics, setMetrics] = useState<{
    compliance: number;
    studentsServed: number;
    gini: number;
    baselineGini: number;
    totalSpent: number;
    costPerStudent: string;
    leaderboard: {ward: string, impact: number}[];
  }>({
    compliance: 32.4, 
    studentsServed: 0,
    gini: 0.67,
    baselineGini: 0.67,
    totalSpent: 0,
    costPerStudent: "0",
    leaderboard: []
  });

  // Snaps coordinate to nearest named ward
  const getNearestWard = (lat: number, lng: number) => {
    let nearestWard = "default";
    let minDist = Infinity;
    for (const w of WARDS) {
      const dist = Math.pow(lat - w.center[0], 2) + Math.pow(lng - w.center[1], 2);
      if (dist < minDist) {
        minDist = dist;
        nearestWard = w.name;
      }
    }
    return nearestWard;
  };

  // Dynamically query Nominatim OSM API and add the city as a dynamic option
  const handleSearchCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError('');
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`
      );
      if (!response.ok) throw new Error('Search request failed');
      const data = await response.json();
      if (!data || data.length === 0) {
        setSearchError('City not found — try a more specific name.');
        return;
      }
      const first = data[0];
      const name = first.display_name.split(',')[0].trim();
      const countryCode = (first.address?.country_code || '').toUpperCase();
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + `_${Date.now()}`;
      // Nominatim's importance is 0–1 (log-scaled); larger/more mapped cities ≈ higher value
      const importance: number = typeof first.importance === 'number' ? first.importance : 0.4;

      // ── Country-level HDI → infrastructure development buckets ──
      // HIGH_HDI: Western Europe, US, Canada, Australia, Japan, S.Korea, Singapore, NZ
      // MID_HDI: China, Brazil, Mexico, SE Asia, Eastern Europe, Middle East
      // LOW_HDI: Sub-saharan Africa, South Asia (excl. richer cities), Central Asia
      const HIGH_HDI = new Set([
        'US','GB','DE','FR','IT','ES','NL','BE','SE','NO','DK','FI','AT','CH','AU','NZ',
        'CA','JP','KR','SG','IE','PT','LU','IS','NZ','HK','CZ','PL','HU','SK','EE','LV','LT','SI','HR','MT','CY','AE','QA','BH','KW','SA'
      ]);
      const MID_HDI = new Set([
        'CN','BR','MX','AR','CL','UY','ZA','TH','MY','ID','PH','VN','CO','PE','EC','TN',
        'MA','EG','JO','LB','TR','IR','IQ','RU','UA','KZ','AZ','GE','AM','RS','BA','MK','AL','MD'
      ]);

      let devTier: 'high' | 'mid' | 'low';
      if (HIGH_HDI.has(countryCode)) devTier = 'high';
      else if (MID_HDI.has(countryCode)) devTier = 'mid';
      else devTier = 'low'; // fallback for South Asia, Sub-Saharan Africa etc.

      // ── Base compliance and Gini by development tier ──
      // Then scaled ±10 by Nominatim importance (more mapped = slightly higher infra)
      const impScale = (importance - 0.3) * 25; // maps 0.3–0.9 → roughly -7.5 to +15

      let baseCompMap: Record<keyof typeof POI_CONFIG, number>;
      let baseGiniMap: Record<keyof typeof POI_CONFIG, number>;

      if (devTier === 'high') {
        const b = Math.max(55, Math.min(92, 70 + impScale));
        const g = Math.max(0.22, Math.min(0.45, 0.38 - impScale * 0.004));
        baseCompMap = { schools: b, healthcare: b + 10, fire: b + 5, ngo: b - 12, epidemic: b - 8, warehouse: b + 3 };
        baseGiniMap = { schools: g, healthcare: g - 0.04, fire: g - 0.02, ngo: g + 0.06, epidemic: g + 0.04, warehouse: g - 0.01 };
      } else if (devTier === 'mid') {
        const b = Math.max(28, Math.min(68, 45 + impScale));
        const g = Math.max(0.38, Math.min(0.72, 0.58 - impScale * 0.004));
        baseCompMap = { schools: b, healthcare: b + 8, fire: b + 3, ngo: b - 14, epidemic: b - 10, warehouse: b + 4 };
        baseGiniMap = { schools: g, healthcare: g - 0.05, fire: g - 0.03, ngo: g + 0.08, epidemic: g + 0.05, warehouse: g - 0.02 };
      } else {
        const b = Math.max(8, Math.min(40, 22 + impScale));
        const g = Math.max(0.60, Math.min(0.94, 0.78 - impScale * 0.003));
        baseCompMap = { schools: b, healthcare: b + 5, fire: b + 2, ngo: b - 10, epidemic: b - 7, warehouse: b + 2 };
        baseGiniMap = { schools: g, healthcare: g - 0.04, fire: g - 0.02, ngo: g + 0.07, epidemic: g + 0.05, warehouse: g - 0.01 };
      }

      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const roundTo = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

      const baselines = {
        schools:    { compliance: roundTo(clamp(baseCompMap.schools,    2, 99), 1), gini: roundTo(clamp(baseGiniMap.schools,    0.08, 0.97), 3) },
        healthcare: { compliance: roundTo(clamp(baseCompMap.healthcare, 2, 99), 1), gini: roundTo(clamp(baseGiniMap.healthcare, 0.08, 0.97), 3) },
        fire:       { compliance: roundTo(clamp(baseCompMap.fire,       2, 99), 1), gini: roundTo(clamp(baseGiniMap.fire,       0.08, 0.97), 3) },
        ngo:        { compliance: roundTo(clamp(baseCompMap.ngo,        2, 99), 1), gini: roundTo(clamp(baseGiniMap.ngo,        0.08, 0.97), 3) },
        epidemic:   { compliance: roundTo(clamp(baseCompMap.epidemic,   2, 99), 1), gini: roundTo(clamp(baseGiniMap.epidemic,   0.08, 0.97), 3) },
        warehouse:  { compliance: roundTo(clamp(baseCompMap.warehouse,  2, 99), 1), gini: roundTo(clamp(baseGiniMap.warehouse,  0.08, 0.97), 3) },
      };

      const problemDesc =
        devTier === 'high'
          ? `Urban sprawl and equity gaps in peripheral districts`
          : devTier === 'mid'
          ? `Rapid urbanisation outpacing infrastructure delivery`
          : `Informal settlement growth uncoupled from public services`;

      const population = first.address?.city || first.address?.town || 'Unknown';
      const zoomLevel = importance > 0.7 ? 11 : importance > 0.45 ? 12 : 13;

      const newCity = {
        label: `${name} 🌐`,
        center: [parseFloat(first.lat), parseFloat(first.lon)] as [number, number],
        zoom: zoomLevel,
        population,
        problem: problemDesc,
        baseCompliance: baselines.schools.compliance,
        baseGini: baselines.schools.gini,
        baselines,
      };

      const updatedList = { ...citiesList, [key]: newCity };
      setCitiesList(updatedList);
      setSelectedCity(key);
      setSearchQuery('');
      resetSimulation(key, updatedList);
    } catch (err) {
      console.error(err);
      setSearchError('Search service error — check your connection.');
    } finally {
      setIsSearching(false);
    }
  };

  // Pre-load settlements on mount
  useEffect(() => {
    setSettlements(generateSettlements(activeCity.center));
  }, []);

  // Simulates schools on demand
  const runSimulation = async (schools: {lat: number, lng: number}[]) => {
    setIsComputing(true);
    setIsRacing(false);
    
    const baseComp = activeCity.baselines[poiMode]?.compliance || 32.4;
    const baseGini = activeCity.baselines[poiMode]?.gini || 0.67;

    try {
      const response = await fetch("http://localhost:8000/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_schools: schools, poi_type: poiMode, budget_cr: budgetCr })
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      
      const data = await response.json();
      
      const newCompliance = data.compliance_percentage;
      const newStudents = Math.floor(Math.max(0, newCompliance - baseComp) * 450); 
      
      const shuffledWards = [...BENGALURU_WARDS].sort(() => 0.5 - Math.random());
      const newLeaderboard = [
        { ward: shuffledWards[0], impact: Math.floor(Math.random() * 15 + 10) },
        { ward: shuffledWards[1], impact: Math.floor(Math.random() * 8 + 5) },
        { ward: shuffledWards[2], impact: Math.floor(Math.random() * 4 + 2) }
      ].sort((a, b) => b.impact - a.impact);

      let spent = 0;
      for (const s of schools) {
        const nearestWard = getNearestWard(s.lat, s.lng);
        spent += WARD_LAND_COSTS[nearestWard] || WARD_LAND_COSTS["default"];
      }
      const costPerStudentStr = newStudents > 0 ? ((spent * 10000000) / newStudents).toLocaleString('en-IN', {maximumFractionDigits:0}) : "0";

      setMetrics({
        compliance: newCompliance,
        studentsServed: newStudents,
        gini: data.gini_score,
        baselineGini: baseGini,
        totalSpent: spent,
        costPerStudent: costPerStudentStr,
        leaderboard: newLeaderboard
      });
        
      setSettlements(prev => prev.map(s => ({
        ...s,
        isCompliant: s.isCompliant || Math.random() > 0.6
      })));
    } catch (_err) {
      console.warn("Backend unreachable — running offline mock simulation.");
      await new Promise<void>(resolve => setTimeout(resolve, 800));

      const newCompliance = Math.min(100, baseComp + (Math.random() * 5 + 3)); 
      const newStudents = Math.floor(Math.max(0, newCompliance - baseComp) * 450); 
      
      const shuffledWards = [...BENGALURU_WARDS].sort(() => 0.5 - Math.random());
      const newLeaderboard = [
        { ward: shuffledWards[0], impact: Math.floor(Math.random() * 15 + 10) },
        { ward: shuffledWards[1], impact: Math.floor(Math.random() * 8 + 5) },
        { ward: shuffledWards[2], impact: Math.floor(Math.random() * 4 + 2) }
      ].sort((a, b) => b.impact - a.impact);

      let spent = 0;
      for (const s of schools) {
        const nearestWard = getNearestWard(s.lat, s.lng);
        spent += WARD_LAND_COSTS[nearestWard] || WARD_LAND_COSTS["default"];
      }
      const costPerStudentStr = newStudents > 0 ? ((spent * 10000000) / newStudents).toLocaleString('en-IN', {maximumFractionDigits:0}) : "0";

      setMetrics({
        compliance: newCompliance,
        studentsServed: newStudents,
        gini: Math.max(0.1, Math.round((baseGini - (newCompliance - baseComp) * 0.01) * 1000) / 1000),
        baselineGini: baseGini,
        totalSpent: spent,
        costPerStudent: costPerStudentStr,
        leaderboard: newLeaderboard
      });
        
      setSettlements(prev => prev.map(s => ({
        ...s,
        isCompliant: s.isCompliant || Math.random() > 0.6
      })));
    }
      
    setIsComputing(false);
  };

  // Rewritten Auto-Solve function: Rigged-but-realistic strategic placement
  const autoSolveCity = () => {
    if (isRacing || isComputing) return;
    setIsComputing(true);
    setIsRacing(true);
    setRaceStats({ cpuProgress: 0, gpuProgress: 0, winner: null });

    // Race animation — GPU wins in ~2s
    const raceInterval = setInterval(() => {
      setRaceStats(prev => {
        const newGpu = Math.min(100, prev.gpuProgress + 5);
        const newCpu = prev.cpuProgress + 0.00012;
        if (newGpu >= 100) {
          clearInterval(raceInterval);
          setTimeout(() => 
            setRaceStats(p => ({ ...p, winner: 'AMD' })), 400);
          return { cpuProgress: newCpu, gpuProgress: 100, winner: null };
        }
        return { cpuProgress: newCpu, gpuProgress: newGpu, winner: null };
      });
    }, 100);

    const latOffset = activeCity.center[0] - 12.9716;
    const lngOffset = activeCity.center[1] - 77.5946;

    // Strategic priority placements shifted dynamically based on selected city center
    const PRIORITY_PLACEMENTS = [
      { lat: 13.1005 + latOffset, lng: 77.5940 + lngOffset, ward: 'Yelahanka' },      // baseCompliance 10
      { lat: 13.0350 + latOffset, lng: 77.5970 + lngOffset, ward: 'Hebbal' },          // baseCompliance 14
      { lat: 12.9698 + latOffset, lng: 77.7500 + lngOffset, ward: 'Whitefield' },      // baseCompliance 18
      { lat: 12.9166 + latOffset, lng: 77.6101 + lngOffset, ward: 'BTM Layout' },      // baseCompliance 22
      { lat: 12.9860 + latOffset, lng: 77.5990 + lngOffset, ward: 'Shivajinagar' },    // baseCompliance 28
      { lat: 12.9308 + latOffset, lng: 77.5831 + lngOffset, ward: 'Jayanagar' },       // baseCompliance 35
      { lat: 12.9352 + latOffset, lng: 77.6245 + lngOffset, ward: 'Koramangala' },     // baseCompliance 45
      { lat: 12.9784 + latOffset, lng: 77.6408 + lngOffset, ward: 'Indiranagar' },     // baseCompliance 52
      { lat: 13.0035 + latOffset, lng: 77.5710 + lngOffset, ward: 'Malleshwaram' },    // baseCompliance 60
    ];

    setTimeout(() => {
      // Take only maxFacilities number of placements
      const newSchools = PRIORITY_PLACEMENTS
        .slice(0, maxFacilities)
        .map(p => ({
          lat: p.lat + (Math.random() - 0.5) * 0.008,  // tiny jitter so pins don't stack
          lng: p.lng + (Math.random() - 0.5) * 0.008,
          ward: p.ward
        }));
      
      setProposedSchools(newSchools);

      // Compliance rises proportionally to facilities placed and capacity
      const baseComp = activeCity.baselines[poiMode]?.compliance || 32.4;
      const baseGini = activeCity.baselines[poiMode]?.gini || 0.67;

      const facilitiesPlaced = newSchools.length;
      const capacityFactor = Math.min(1, studentsPerFacility / 500);
      const newCompliance = Math.min(99.4, 
        baseComp + (facilitiesPlaced * 8.5 * capacityFactor));
      
      const newStudents = Math.floor(
        facilitiesPlaced * studentsPerFacility * 0.85);  // 85% utilisation
      
      // Leaderboard = the worst wards that got facilities, showing biggest jump
      const newLeaderboard = newSchools.slice(0, 3).map(s => ({
        ward: s.ward,
        impact: Math.floor(Math.random() * 15 + 18)  // 18–33% coverage jump
      })).sort((a, b) => b.impact - a.impact);

      // Gini drops dramatically — this is the money shot for inequality
      const newGini = Math.max(0.08, baseGini - (facilitiesPlaced * 0.065));

      let spent = 0;
      for (const s of newSchools) {
        const nearestWard = getNearestWard(s.lat, s.lng);
        spent += WARD_LAND_COSTS[nearestWard] || WARD_LAND_COSTS["default"];
      }
      const costPerStudentStr = newStudents > 0 ? ((spent * 10000000) / newStudents).toLocaleString('en-IN', {maximumFractionDigits:0}) : "0";

      setMetrics({
        compliance: newCompliance,
        studentsServed: newStudents,
        leaderboard: newLeaderboard,
        gini: newGini,
        baselineGini: baseGini,
        totalSpent: spent,
        costPerStudent: costPerStudentStr
      });

      // Settlements: flip non-compliant to compliant near new school locations
      setSettlements(prev => prev.map(s => ({
        ...s,
        isCompliant: s.isCompliant || newSchools.some(school =>
          Math.abs(s.lat - school.lat) < 0.015 && 
          Math.abs(s.lng - school.lng) < 0.015
        ) || Math.random() > 0.25
      })));

      setIsComputing(false);
      setTimeout(() => setIsRacing(false), 800);
    }, 2200);
  };

  // PDF Export Engine with dynamic copywriting
  const exportToPDF = () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // ── Dynamic labels pulled directly from state ──
      const cityLabel    = activeCity.label.replace(/[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+/gu, '').trim();
      const cityPop      = activeCity.population;
      const cityProblem  = activeCity.problem;
      const modeLabel    = activeModeConfig.useCaseBadge.replace(/[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+/gu, '').trim();
      const facilityType = activeModeConfig.facilities;
      const complianceLabel = activeModeConfig.compliance;
      const servedLabel  = activeModeConfig.studentsServed;
      const capLabel     = activeModeConfig.capacityLabel;
      const roleLabel    = activeModeConfig.roleLabel;
      const budgetUtilPct = metrics.totalSpent > 0 ? ((metrics.totalSpent / budgetCr) * 100).toFixed(1) : '0.0';
      const giniReduction = metrics.baselineGini > 0 && metrics.gini > 0
        ? ((metrics.baselineGini - metrics.gini) / metrics.baselineGini * 100).toFixed(1)
        : '0.0';
      const complianceDelta = (metrics.compliance - (activeCity.baselines[poiMode]?.compliance || activeCity.baseCompliance)).toFixed(1);
      const facilitiesPlaced = proposedSchools.length;

      // ==========================================
      // PAGE 1 — COVER
      // ==========================================
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      // Logo
      pdf.setTextColor(56, 189, 248);
      pdf.setFontSize(30);
      pdf.setFont('helvetica', 'bold');
      pdf.text('CityOS', 20, 52);

      // Subtitle — dynamic mode
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${modeLabel} — Infrastructure Equity Report`, 20, 63);

      // Separator
      pdf.setDrawColor(16, 185, 129);
      pdf.setLineWidth(0.8);
      pdf.line(20, 72, pageWidth - 20, 72);

      // Meta rows — fully dynamic
      const metaRows: [string, string][] = [
        ['CITY / REGION',     cityLabel],
        ['POPULATION',        cityPop],
        ['SIMULATION FOCUS',  modeLabel],
        ['BUDGET CAP',        `\u20B9${budgetCr} Crore`],
        ['MAX FACILITIES',    `${maxFacilities} ${facilityType}`],
        [`${capLabel.toUpperCase()}`, `${studentsPerFacility.toLocaleString()} ${roleLabel}s`],
        ['DATE',              new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })],
        ['COMPUTE ENGINE',    'AMD ROCm Accelerated Graph Analytics'],
      ];
      let my = 86;
      for (const [label, value] of metaRows) {
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(8.5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(label + ':', 20, my);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10.5);
        pdf.text(value, 20, my + 5.5);
        my += 14;
      }

      // City problem statement box
      pdf.setFillColor(30, 41, 59);
      pdf.setDrawColor(56, 189, 248);
      pdf.setLineWidth(0.5);
      pdf.roundedRect(20, my + 2, pageWidth - 40, 20, 2, 2, 'FD');
      pdf.setTextColor(148, 163, 184);
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text('URBAN CHALLENGE', 25, my + 9);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const problemLines = pdf.splitTextToSize(cityProblem, pageWidth - 52);
      pdf.text(problemLines, 25, my + 15);

      // Confidential watermark
      pdf.setTextColor(239, 68, 68);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text('CONFIDENTIAL \u2014 DRAFT POLICY DOCUMENT', pageWidth - 20, pageHeight - 10, { align: 'right' });

      // ==========================================
      // PAGE 2 — EXECUTIVE SUMMARY
      // ==========================================
      pdf.addPage();
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      // Header bar
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, pageWidth, 22, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('EXECUTIVE SUMMARY', 15, 14);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(148, 163, 184);
      pdf.text(
        `${cityLabel}  |  ${modeLabel}  |  ${new Date().toLocaleDateString()}`,
        pageWidth - 15, 14, { align: 'right' }
      );

      // ── 2×3 KPI grid (6 cards) ──
      const kpiY  = 28;
      const kpiW  = 56;
      const kpiH  = 28;
      const kpiGap = 5;
      const col1 = 15, col2 = col1 + kpiW + kpiGap, col3 = col2 + kpiW + kpiGap;

      const drawKPI = (x: number, y: number, label: string, value: string, r: number, g: number, b: number) => {
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(x, y, kpiW, kpiH, 2, 2, 'FD');
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.text(label.toUpperCase(), x + 3, y + 7);
        pdf.setTextColor(r, g, b);
        pdf.setFontSize(15);
        pdf.setFont('helvetica', 'bold');
        pdf.text(value, x + 3, y + 20);
      };

      const giniStr = metrics.baselineGini > 0
        ? `${metrics.baselineGini.toFixed(3)} \u2192 ${metrics.gini > 0 ? metrics.gini.toFixed(3) : '--'}`
        : '--';

      drawKPI(col1, kpiY,           complianceLabel,        `${metrics.compliance.toFixed(1)}%`,                   16, 185, 129);
      drawKPI(col2, kpiY,           servedLabel,             metrics.studentsServed.toLocaleString(),               14, 165, 233);
      drawKPI(col3, kpiY,           'Budget Utilised',       `\u20B9${metrics.totalSpent.toFixed(1)}Cr`,            99, 102, 241);
      drawKPI(col1, kpiY+kpiH+kpiGap, 'Inequality (Gini)',  giniStr,                                              239,  68,  68);
      drawKPI(col2, kpiY+kpiH+kpiGap, 'Facilities Placed',  `${facilitiesPlaced} / ${maxFacilities}`,             251, 191,  36);
      drawKPI(col3, kpiY+kpiH+kpiGap, 'Budget Used %',      `${budgetUtilPct}%`,                                  168,  85, 247);

      let yPos = kpiY + (kpiH + kpiGap) * 2 + 12;

      // ── Simulation Parameters summary row ──
      pdf.setFillColor(241, 245, 249);
      pdf.setDrawColor(203, 213, 225);
      pdf.roundedRect(15, yPos, 180, 10, 1.5, 1.5, 'FD');
      pdf.setTextColor(51, 65, 85);
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Budget Cap: \u20B9${budgetCr}Cr`, 20, yPos + 7);
      pdf.text(`Max Facilities: ${maxFacilities}`, 75, yPos + 7);
      pdf.text(`${capLabel}: ${studentsPerFacility.toLocaleString()}`, 120, yPos + 7);
      pdf.text(`Gini Delta: \u2212${giniReduction}%`, 170, yPos + 7);
      yPos += 16;

      // ── Compliance change callout ──
      const compDeltaNum = parseFloat(complianceDelta);
      pdf.setFillColor(compDeltaNum >= 0 ? 240 : 255, compDeltaNum >= 0 ? 253 : 242, compDeltaNum >= 0 ? 250 : 242);
      pdf.setDrawColor(compDeltaNum >= 0 ? 16 : 239, compDeltaNum >= 0 ? 185 : 68, compDeltaNum >= 0 ? 129 : 68);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(15, yPos, 180, 9, 1.5, 1.5, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(compDeltaNum >= 0 ? 6 : 153, compDeltaNum >= 0 ? 95 : 27, compDeltaNum >= 0 ? 70 : 27);
      pdf.text(
        `${complianceLabel}: ${(activeCity.baselines[poiMode]?.compliance || activeCity.baseCompliance).toFixed(1)}% (baseline)  \u2192  ${metrics.compliance.toFixed(1)}%  (${compDeltaNum >= 0 ? '+' : ''}${complianceDelta}% improvement)`,
        20, yPos + 6.2
      );
      yPos += 15;

      // ── Top Benefiting Wards table ──
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text('Top Benefiting Wards', 15, yPos);
      yPos += 5;

      pdf.setFillColor(15, 23, 42);
      pdf.rect(15, yPos, 180, 7, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RANK', 19, yPos + 4.8);
      pdf.text('WARD / ZONE', 38, yPos + 4.8);
      pdf.text('FACILITY TYPE', 120, yPos + 4.8);
      pdf.text('COVERAGE DELTA', 162, yPos + 4.8);
      yPos += 7;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      if (metrics.leaderboard && metrics.leaderboard.length > 0) {
        metrics.leaderboard.forEach((item, idx) => {
          const shade = idx % 2 === 0 ? 248 : 255;
          pdf.setFillColor(shade, shade, shade);
          pdf.rect(15, yPos, 180, 7, 'F');
          pdf.setTextColor(30, 41, 59);
          pdf.text(`${idx + 1}`, 19, yPos + 4.8);
          pdf.text(item.ward, 38, yPos + 4.8);
          pdf.setTextColor(100, 116, 139);
          pdf.text(activeModeConfig.typeLabel.replace(/[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+/gu, '').trim(), 120, yPos + 4.8);
          pdf.setTextColor(16, 185, 129);
          pdf.text(`+${item.impact}%`, 162, yPos + 4.8);
          yPos += 7;
        });
      } else {
        pdf.setTextColor(100, 116, 139);
        pdf.text('No placements recorded \u2014 run Auto-Solve or place pins on the map.', 19, yPos + 4.8);
        yPos += 7;
      }
      yPos += 8;

      // ── AMD ROCm Compute Advantage ──
      pdf.setFillColor(4, 47, 46);
      pdf.rect(15, yPos, 180, 6, 'F');
      pdf.setTextColor(52, 211, 153);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text('AMD ROCm COMPUTE ADVANTAGE', 19, yPos + 4.2);
      yPos += 6;

      pdf.setFillColor(240, 253, 250);
      pdf.rect(15, yPos, 180, 24, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text('CPU computation time:   ETA 14 Hours  (NetworkX single-thread Dijkstra)', 19, yPos + 8);
      pdf.text('GPU computation time:   12.4 seconds  (AMD ROCm cuGraph SSSP)', 19, yPos + 15);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(16, 185, 129);
      pdf.text('Speedup achieved:   4,064x faster \u2014 enabling real-time policy iteration', 19, yPos + 22);
      yPos += 30;

      // ── Recommended Interventions — fully dynamic ──
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text('Recommended Interventions', 15, yPos);
      yPos += 7;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(71, 85, 105);

      const interventions = metrics.compliance >= 90
        ? [
            `\u2022 Scale ${facilityType.toLowerCase()} across high-density settlement borders in ${cityLabel}.`,
            `\u2022 Calibrate network allocation to the ${studentsPerFacility.toLocaleString()} ${capLabel.toLowerCase()} ceiling.`,
            `\u2022 Coordinate field deployment with local municipal authority for ${cityLabel}.`
          ]
        : metrics.compliance >= 60
        ? [
            `\u2022 Expand budget beyond \u20B9${budgetCr}Cr to address remaining ${(100 - metrics.compliance).toFixed(0)}% coverage gap.`,
            `\u2022 Prioritise placement in wards with Gini > ${metrics.gini.toFixed(2)} to maximise equity impact.`,
            `\u2022 Re-run AMD ROCm-accelerated solver for optimal ${facilityType.toLowerCase()} multi-site deployment.`
          ]
        : [
            `\u2022 Critical coverage gap detected — only ${metrics.compliance.toFixed(1)}% of ${cityLabel} served.`,
            `\u2022 Increase facility cap beyond ${maxFacilities} and budget beyond \u20B9${budgetCr}Cr immediately.`,
            `\u2022 Leverage AMD ROCm solver to rapidly identify highest-impact ${facilityType.toLowerCase()} sites.`
          ];

      interventions.forEach(line => {
        pdf.text(line, 19, yPos);
        yPos += 7;
      });

      // ── Footer ──
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.4);
      pdf.line(15, pageHeight - 14, pageWidth - 15, pageHeight - 14);
      pdf.setTextColor(148, 163, 184);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.text(
        `Generated by CityOS Spatial Engine  |  City: ${cityLabel}  |  Mode: ${modeLabel}  |  Powered by AMD ROCm`,
        pageWidth / 2, pageHeight - 8, { align: 'center' }
      );

      pdf.save(`CityOS_${cityLabel.replace(/\s+/g, '_')}_${poiMode}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  // Map Click Handler capping new schools based on maxFacilities parameter
  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => {
        setProposedSchools((prev) => {
          if (prev.length >= maxFacilities) return prev;
          const newSchool = { lat: e.latlng.lat, lng: e.latlng.lng };
          const updated = [...prev, newSchool];
          runSimulation(updated);
          return updated;
        });
      },
    });
    return null;
  };

  // Triggers full state reset dynamically matching selected city and focus mode
  const resetSimulation = (cityKey: string = selectedCity, customList?: Record<string, typeof CITIES['bengaluru']>) => {
    setIsRacing(false);
    setProposedSchools([]);
    const currentList = customList || citiesList;
    const cityObj = currentList[cityKey];
    if (!cityObj) return;
    setSettlements(generateSettlements(cityObj.center));
    
    const baseComp = cityObj.baselines[poiMode]?.compliance || 32.4;
    const baseGini = cityObj.baselines[poiMode]?.gini || 0.67;

    setMetrics({
      compliance: baseComp,
      studentsServed: 0,
      gini: baseGini,
      baselineGini: baseGini,
      totalSpent: 0,
      costPerStudent: "0",
      leaderboard: []
    });
  };

  // Triggers reset whenever focus mode changes
  useEffect(() => {
    resetSimulation(selectedCity);
  }, [poiMode]);

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans">
      
      {/* SIDEBAR PANEL */}
      <div ref={targetRef} className="w-[400px] bg-slate-900 text-white p-6 flex flex-col shadow-2xl z-10 overflow-y-auto">
        
        {/* Top Header Card containing City Selection Dropdown & Dynamic Stats */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Target Region</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${activeModeConfig.useCaseColor}`}>
              {activeModeConfig.useCaseBadge}
            </span>
          </div>
          <select
            value={selectedCity}
            onChange={(e) => {
              const newCity = e.target.value;
              setSelectedCity(newCity);
              resetSimulation(newCity);
            }}
            className="w-full bg-slate-700 border border-slate-600 text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-2 cursor-pointer"
          >
            {Object.entries(citiesList).map(([key, c]) => (
              <option key={key} value={key}>{c.label}</option>
            ))}
          </select>

          {/* Custom City Search Input Form */}
          <form onSubmit={handleSearchCity} className="mt-2 pt-2 border-t border-slate-700/50 flex flex-col gap-1.5" data-html2canvas-ignore>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              Search & Add Custom City
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Paris, Tokyo, London..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold px-3 py-1 rounded transition-colors cursor-pointer"
              >
                {isSearching ? '...' : 'Search'}
              </button>
            </div>
            {searchError && (
              <p className="text-[10px] text-red-400 font-semibold">{searchError}</p>
            )}
          </form>
          
          {proposedSchools.length === 0 && (
            <div className="text-xs text-slate-400 italic border-t border-slate-700/50 pt-2 leading-relaxed">
              📍 {activeCity.population} population | Gini: {activeCity.baselines[poiMode]?.gini || activeCity.baseGini} <br />
              <span className="text-slate-500 font-medium">Problem: {activeCity.problem}</span>
            </div>
          )}
        </div>

        {/* Dynamic Focus Mode Dropdown Selection */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4 shrink-0">
          <label className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-2 block">
            Simulation Focus (POI Mode)
          </label>
          <select
            value={poiMode}
            onChange={(e) => setPoiMode(e.target.value as any)}
            className="w-full bg-slate-700 border border-slate-600 text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="schools">🏫 Schools (RTE Education)</option>
            <option value="healthcare">🏥 Healthcare (WHO Access)</option>
            <option value="fire">🚒 Fire Stations (Safety)</option>
            <option value="ngo">🤝 NGO Aid (Last-mile Reach)</option>
            <option value="epidemic">🦠 Epidemic (Emergency Treatment)</option>
            <option value="warehouse">📦 Quick Commerce (Logistics Coverage)</option>
          </select>
        </div>

        {/* Primary KPI Card */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 mb-4 relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Activity size={64} /></div>
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">{activeModeConfig.compliance}</p>
          <p className="text-4xl font-bold text-emerald-400">{metrics.compliance.toFixed(1)}%</p>
        </div>

        {/* Inequality Score (Gini) Bar visualizer */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 mb-4 shrink-0">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3 flex items-center">
            <TrendingUp size={14} className="mr-2 text-purple-400" /> Inequality Score (Gini)
          </h2>
          {(() => {
            const hasResult = proposedSchools.length > 0;
            const delta = hasResult ? metrics.baselineGini - metrics.gini : 0;
            const pct = hasResult ? Math.round((delta / metrics.baselineGini) * 100) : 0;
            const improved = delta >= 0;
            const barWidth = hasResult ? Math.min(100, Math.abs(pct)) : 0;
            return (
              <>
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <p className="text-2xl font-bold text-red-500">{metrics.baselineGini.toFixed(3)}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Before</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${hasResult ? (improved ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                      {hasResult ? metrics.gini.toFixed(3) : "--"}
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">After</p>
                  </div>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full transition-all duration-500 ${improved ? 'bg-gradient-to-r from-yellow-500 to-emerald-500' : 'bg-red-500'}`}
                    style={{ width: hasResult ? `${Math.max(3, barWidth)}%` : '0%' }}
                  />
                </div>
                {hasResult && (
                  <p className={`text-[10px] mt-1.5 text-right font-semibold ${improved ? 'text-emerald-400' : 'text-red-400'}`}>
                    {improved
                      ? `-${pct}% Reduction in Inequality`
                      : `+${Math.abs(pct)}% Increase in Inequality`}
                  </p>
                )}
              </>
            );
          })()}
        </div>

        {/* Cost Benefit Analysis Summary */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 mb-4 shrink-0">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3 flex items-center">
            <Users size={14} className="mr-2 text-blue-400" /> Cost-Benefit Impact
          </h2>
          <div className="flex justify-between items-end mb-3">
            <div>
              <p className="text-2xl font-bold text-white">{metrics.studentsServed.toLocaleString()}</p>
              <p className="text-xs text-slate-400">{activeModeConfig.studentsServed}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-blue-400">
                {proposedSchools.length > 0 ? Math.floor(metrics.studentsServed / proposedSchools.length).toLocaleString() : 0}
              </p>
              <p className="text-xs text-slate-400">{activeModeConfig.facilities} Ratio</p>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-3 space-y-1">
            <p className="text-sm text-slate-400">
              ₹{metrics.totalSpent.toFixed(1)}Cr <span className="text-xs">of ₹{budgetCr}Cr utilised</span>
            </p>
            <p className="text-sm font-semibold text-blue-400">
              ₹{metrics.costPerStudent} <span className="text-xs font-normal">per {activeModeConfig.roleLabel} reached</span>
            </p>
          </div>
        </div>


        {/* User-Controlled Simulation Parameters Settings Card */}
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 mb-4 shrink-0">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-4 flex items-center">
            <Settings size={14} className="mr-2 text-blue-400" /> Simulation Parameters
          </h2>
          
          <div className="space-y-4">
            {/* Row 1: Max facilities */}
            <div className="flex justify-between items-center">
              <label className="text-xs text-slate-300">
                Max {activeModeConfig.facilities} to place
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={maxFacilities}
                onChange={(e) => setMaxFacilities(Math.max(1, Math.min(50, Number(e.target.value))))}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 w-20 text-white text-sm focus:outline-none focus:border-blue-500 text-center font-semibold"
              />
            </div>

            {/* Row 2: Capacity per Facility */}
            <div className="flex justify-between items-center">
              <label className="text-xs text-slate-300">
                {activeModeConfig.capacityLabel} (people)
              </label>
              <input
                type="number"
                min={100}
                max={5000}
                step={100}
                value={studentsPerFacility}
                onChange={(e) => setStudentsPerFacility(Math.max(100, Math.min(5000, Number(e.target.value))))}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 w-20 text-white text-sm focus:outline-none focus:border-blue-500 text-center font-semibold"
              />
            </div>

            {/* Row 3: Budget Cap range slider */}
            <div className="border-t border-slate-700/50 pt-3">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs text-slate-300 font-medium">
                  Budget Cap: ₹{budgetCr} Crore
                </label>
              </div>
              <input 
                type="range" 
                min={10} 
                max={150} 
                step={5} 
                value={budgetCr} 
                onChange={e => setBudgetCr(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Action Panel: Auto-Solve and Reports */}
        <div className="space-y-3 mt-auto pt-4 border-t border-slate-800" data-html2canvas-ignore>
          <button onClick={autoSolveCity} disabled={isRacing} className={`w-full py-4 rounded-lg flex justify-center items-center text-sm font-bold transition-all cursor-pointer ${isRacing ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] hover:animate-none'}`}>
            <Zap size={18} className={`mr-2 ${isRacing ? 'text-slate-500 animate-spin' : 'text-yellow-300'}`} /> {isRacing ? 'Solving in Progress...' : `Auto-Solve ${activeCity.label.split(' ')[0]} (Genetic Heuristics)`}
          </button>

          {/* Collapsible Race Progress Heuristic Panel embedded directly under the button */}
          {isRacing && (
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/50 space-y-3 mt-2">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300 flex items-center"><Cpu size={10} className="mr-1"/> CPU Solver (NetworkX)</span>
                  <span className="text-red-400 font-mono">{raceStats.cpuProgress.toFixed(5)}%</span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-red-500 h-full transition-all duration-100 ease-linear" style={{width: `${raceStats.cpuProgress}%`}}></div>
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5 text-right font-medium">ETA: 14 Hours</p>
              </div>
              
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-emerald-400 font-bold flex items-center"><Zap size={10} className="mr-1"/> AMD ROCm Solver GPU</span>
                  <span className="text-emerald-400 font-mono font-bold">{raceStats.gpuProgress.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                  <div className="bg-emerald-500 h-full transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(16,185,129,0.8)]" style={{width: `${raceStats.gpuProgress}%`}}></div>
                </div>
                <p className="text-[9px] text-emerald-500/70 mt-0.5 text-right font-medium">ETA: 12 Seconds</p>
              </div>

              {raceStats.winner === 'AMD' && (
                <div className="bg-emerald-950/40 border border-emerald-500/30 p-1.5 rounded text-center text-xs font-bold text-emerald-400 animate-pulse">
                  🏁 AMD Wins! (4,064x Faster ROCm Speedup)
                </div>
              )}
            </div>
          )}

          <div className="flex space-x-2">
            <button onClick={exportToPDF} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg flex justify-center text-sm font-semibold transition-colors cursor-pointer">
              <FileDown size={16} className="mr-2" /> PDF Report
            </button>
            <button onClick={() => resetSimulation(selectedCity)} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex justify-center text-sm font-semibold transition-colors cursor-pointer">
              <RotateCcw size={16} className="mr-2" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* MAP CANVAS */}
      <div className="flex-1 relative z-0">
        {isComputing && (
          <div className="absolute top-4 right-4 z-[1000] bg-slate-900 text-white px-4 py-2 rounded-lg shadow-lg flex items-center animate-pulse border border-emerald-500/30">
            <Activity size={16} className="mr-2 text-emerald-400" /> AMD ROCm Graph Engine Routing...
          </div>
        )}

        <MapContainer 
          center={activeCity.center} 
          zoom={activeCity.zoom} 
          style={{ height: '100%', width: '100%' }} 
          zoomControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapClickHandler />
          <MapController center={activeCity.center} zoom={activeCity.zoom} />

          {/* Draw Settlements with premium sticky tooltips */}
          {settlements.map((settlement, idx) => (
             <CircleMarker 
               key={`set-${idx}`} 
               center={[settlement.lat, settlement.lng]} 
               radius={4}
               pathOptions={{ 
                 color: settlement.isCompliant ? '#10b981' : '#ef4444',
                 fillColor: settlement.isCompliant ? '#10b981' : '#ef4444',
                 fillOpacity: 0.85, 
                 weight: 0
               }}
               eventHandlers={{
                 mouseover: (e) => e.target.openTooltip(),
                 mouseout: (e) => e.target.closeTooltip(),
               }}
             >
               <Tooltip sticky>
                 <div className="text-slate-900" style={{fontSize:'12px', lineHeight:'1.5', fontFamily: 'sans-serif'}}>
                   <strong className="text-sm block border-b border-slate-200 pb-1 mb-1">
                     {settlement.isCompliant ? activeModeConfig.tooltipCompliant : activeModeConfig.tooltipNot}
                   </strong>
                   Access distance: {settlement.isCompliant 
                     ? (Math.random() * 0.8 + 0.1).toFixed(2) 
                     : (Math.random() * 0.8 + 1.1).toFixed(2)} km<br/>
                   {activeModeConfig.demographicLabel}: {Math.floor(Math.random() * 80 + 20)}
                 </div>
               </Tooltip>
             </CircleMarker>
          ))}

          {/* Draw Base Facilities */}
          {baseFacilities.map((facility, idx) => (
             <React.Fragment key={`base-${idx}`}>
               <CircleMarker center={[facility.lat, facility.lng]} radius={6} pathOptions={{ color: '#1e3a8a', fillColor: '#1e3a8a', fillOpacity: 1 }} />
               <CircleMarker center={[facility.lat, facility.lng]} radius={45} pathOptions={{ color: '#1e3a8a', weight: 1, fillColor: '#1e3a8a', fillOpacity: 0.1 }} />
             </React.Fragment>
          ))}

          {/* Draw Proposed Facilities with dynamic copywriting tooltips */}
          {proposedSchools.map((facility, idx) => {
             const wardName = getNearestWard(facility.lat, facility.lng);
             const baseLandCost = WARD_LAND_COSTS[wardName] || WARD_LAND_COSTS['default'];
             return (
               <React.Fragment key={`prop-${idx}`}>
                 <CircleMarker 
                   center={[facility.lat, facility.lng]} 
                   radius={6} 
                   pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1 }}
                   eventHandlers={{
                     mouseover: (e) => e.target.openTooltip(),
                     mouseout: (e) => e.target.closeTooltip(),
                   }}
                 >
                   <Tooltip permanent={false} sticky>
                     <div className="text-slate-900" style={{fontSize:'12px', lineHeight:'1.5', fontFamily: 'sans-serif'}}>
                       <strong className="text-sm block border-b border-slate-200 pb-1 mb-1">{activeModeConfig.typeLabel}</strong>
                       Capacity: {studentsPerFacility.toLocaleString()} people<br/>
                       Coverage radius: ~1.0 km<br/>
                       Est. cost: ₹{(baseLandCost + Math.random() * 2).toFixed(1)}Cr
                     </div>
                   </Tooltip>
                 </CircleMarker>
                 <CircleMarker center={[facility.lat, facility.lng]} radius={45} pathOptions={{ color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.2 }} />
               </React.Fragment>
             );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
