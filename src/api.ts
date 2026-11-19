import { createApi, type UnauthorizedInfo } from '../core';

/**
 * The web binding of the shared Sumry client (core/api.ts).
 *
 * By default the API is same-origin: requests go to `/api/...` on whatever host serves
 * the page, and a reverse proxy routes them to the backend. VITE_API_URL overrides it
 * with an absolute origin, e.g. when the API lives on another host.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

type UnauthorizedListener = (path: string, info: UnauthorizedInfo) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Hears every 401 the API answers; returns the unsubscribe. The store uses it to end a dead session. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => { unauthorizedListeners.delete(listener); };
}

export const api = createApi({
  baseUrl: API_URL,
  onUnauthorized: (path, info) => {
    for (const listener of unauthorizedListeners) listener(path, info);
  },
});
