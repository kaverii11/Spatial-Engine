import type { GroupStats } from './engine';

export type Mode = 'schools' | 'healthcare' | 'fire';

export interface Pt { lat: number; lng: number; node: number; name?: string }

export interface PointsFile {
  informal: Pt[];
  formal: Pt[];
  facilities: Record<Mode, Pt[]>;
  bounds: [number, number, number, number];
}

export interface ComputeResult {
  ms: number;
  sources: number;
  baseline: { informal: GroupStats; formal: GroupStats };
  current: { informal: GroupStats; formal: GroupStats };
  informalDist: number[];
  informalBaseDist: number[];
  formalDist: number[];
}

export interface Pick { node: number; gain: number; lat: number; lng: number }

export type WorkerRequest =
  | { type: 'init'; id: number; base: string }
  | { type: 'compute'; id: number; mode: Mode; proposed: number[] }
  | { type: 'snap'; id: number; lat: number; lng: number }
  | { type: 'suggest'; id: number; mode: Mode; proposed: number[]; k: number };

export type WorkerResponse =
  | { type: 'ready'; id: number; nodes: number; edges: number; points: PointsFile }
  | { type: 'computed'; id: number; result: ComputeResult }
  | { type: 'snapped'; id: number; node: number; metres: number; lat: number; lng: number }
  | { type: 'suggested'; id: number; ms: number; picks: Pick[] }
  | { type: 'error'; id: number; message: string };
