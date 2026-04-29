export const WARDS = [
  { name: "Shivajinagar",  center: [12.9860, 77.5990] as [number,number], bounds: [[12.978,77.590],[13.000,77.612]] as [[number,number],[number,number]], baseCompliance: 28 },
  { name: "BTM Layout",    center: [12.9166, 77.6101] as [number,number], bounds: [[12.908,77.600],[12.930,77.622]] as [[number,number],[number,number]], baseCompliance: 22 },
  { name: "Koramangala",   center: [12.9352, 77.6245] as [number,number], bounds: [[12.928,77.614],[12.948,77.636]] as [[number,number],[number,number]], baseCompliance: 45 },
  { name: "Indiranagar",   center: [12.9784, 77.6408] as [number,number], bounds: [[12.970,77.630],[12.990,77.652]] as [[number,number],[number,number]], baseCompliance: 52 },
  { name: "Whitefield",    center: [12.9698, 77.7500] as [number,number], bounds: [[12.955,77.738],[12.985,77.762]] as [[number,number],[number,number]], baseCompliance: 18 },
  { name: "Malleshwaram",  center: [13.0035, 77.5710] as [number,number], bounds: [[12.996,77.562],[13.012,77.582]] as [[number,number],[number,number]], baseCompliance: 60 },
  { name: "Jayanagar",     center: [12.9308, 77.5831] as [number,number], bounds: [[12.922,77.574],[12.942,77.594]] as [[number,number],[number,number]], baseCompliance: 35 },
  { name: "Hebbal",        center: [13.0350, 77.5970] as [number,number], bounds: [[13.026,77.588],[13.046,77.608]] as [[number,number],[number,number]], baseCompliance: 14 },
  { name: "Yelahanka",     center: [13.1005, 77.5940] as [number,number], bounds: [[13.086,77.580],[13.116,77.608]] as [[number,number],[number,number]], baseCompliance: 10 },
];

/** Returns a hex color on a red→yellow→green gradient for 0–100 compliance */
export function complianceColor(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped < 50) {
    // red → yellow
    const t = clamped / 50;
    const r = 220;
    const g = Math.round(60 + t * 160);
    return `rgb(${r},${g},40)`;
  } else {
    // yellow → green
    const t = (clamped - 50) / 50;
    const r = Math.round(220 - t * 180);
    const g = Math.round(220 + t * 20);
    return `rgb(${r},${g},40)`;
  }
}
