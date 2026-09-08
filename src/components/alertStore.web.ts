/**
 * PlatoPlan - Alert store (Web, pure)
 *
 * Framework-free queue that backs the in-app floating alerts on web.
 * `showAppAlert()` (used by AlertCompat) enqueues requests; the AlertHost
 * component subscribes and renders them. Kept free of react-native imports so
 * it can be unit-tested and imported from utils without pulling in RN.
 */

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Listener = (req: AlertRequest) => void;

let listener: Listener | null = null;
let nextId = 1;
const pending: AlertRequest[] = [];

/** Registers the host listener and flushes any buffered requests. Returns an unsubscribe fn. */
export function subscribeToAlerts(fn: Listener): () => void {
  listener = fn;
  if (pending.length > 0) {
    for (const req of pending.splice(0)) fn(req);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}

/**
 * Enqueues an alert to be shown by the mounted AlertHost.
 * If the host isn't mounted yet, the request is buffered and flushed on mount.
 */
export function showAppAlert(title: string, message?: string, buttons?: AlertButton[]): AlertRequest {
  const req: AlertRequest = {
    id: nextId++,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }],
  };
  if (listener) {
    listener(req);
  } else {
    pending.push(req);
  }
  return req;
}
