import { createApi } from '../core';

/**
 * The web binding of the shared Sumry client (core/api.ts).
 *
 * By default the API is same-origin: requests go to `/api/...` on whatever host serves
 * the page, and a reverse proxy routes them to the backend. VITE_API_URL overrides it
 * with an absolute origin, e.g. when the API lives on another host.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export const api = createApi({ baseUrl: API_URL });
