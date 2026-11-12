/**
 * PlatoPlan - observable status of the cloud sync engine (for the header indicator).
 */

export type EngineStatus = 'idle' | 'syncing' | 'error';

export interface EngineState {
  status: EngineStatus;
  /** Last error summary, when status === 'error'. */
  message?: string;
}

type Listener = (state: EngineState) => void;

let current: EngineState = { status: 'idle' };
const listeners = new Set<Listener>();

export function getEngineState(): EngineState {
  return current;
}

export function setEngineState(next: EngineState): void {
  current = next;
  listeners.forEach((l) => l(current));
}

export function subscribeEngineState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
