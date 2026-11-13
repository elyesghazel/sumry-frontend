import { createApi } from '../core';

/**
 * The web binding of the shared Sumry client (core/api.ts).
 *
 * VITE_API_URL lets a dev build point at a local backend; the deployed default is the
 * production API.
 */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://sumry.elyesghazel.ch';

export const api = createApi({ baseUrl: API_URL });
