/**
 * Sumry shared core: API client, types, analytics, formatting and the derived numbers both
 * apps show. Pure TypeScript - no React, DOM or React Native imports. The web repo holds
 * the source; scripts/sync-core.sh vendors it into the phone app.
 */
export * from './types';
export * from './api';
export * from './format';
export * from './analytics';
