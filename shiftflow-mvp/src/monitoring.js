import * as Sentry from '@sentry/node';

// Error monitoring is opt-in: with no SENTRY_DSN everything below is a no-op, so
// the app runs identically without an account configured.
const dsn = process.env.SENTRY_DSN;
export const monitoringEnabled = !!dsn;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  });
  console.log('Sentry: error monitoring enabled');
}

export function captureException(error, context) {
  if (dsn) Sentry.captureException(error, context);
}
