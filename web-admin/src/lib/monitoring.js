import * as Sentry from '@sentry/browser';

// Opt-in error monitoring. Set VITE_SENTRY_DSN at build time to enable; without
// it this is a no-op. Sentry auto-captures unhandled errors and rejections.
const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({ dsn, environment: import.meta.env.MODE });
}

export function captureException(error) {
  if (dsn) Sentry.captureException(error);
}
