import * as Sentry from "@sentry/nextjs";

/**
 * Server + edge error/telemetry init (Sentry). No-op until NEXT_PUBLIC_SENTRY_DSN
 * is set, so the app runs unchanged without it. `onRequestError` reports the
 * server-render / route-handler 500s that were previously invisible (e.g. the
 * [object Date] crash) straight to Sentry.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || "development",
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
