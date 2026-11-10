import type { WorkerRequest, WorkerResponse } from './types';

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let nextId = 1;
const pending = new Map<number, (r: WorkerResponse) => void>();

worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  const cb = pending.get(e.data.id);
  if (cb) { pending.delete(e.data.id); cb(e.data); }
};

export function call<T extends WorkerResponse['type']>(req: Req): Promise<Extract<WorkerResponse, { type: T }>> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, r => (r.type === 'error' ? reject(new Error(r.message)) : resolve(r as Extract<WorkerResponse, { type: T }>)));
    worker.postMessage({ ...req, id } as WorkerRequest);
  });
}
