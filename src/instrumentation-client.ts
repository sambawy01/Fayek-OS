import * as Sentry from "@sentry/nextjs";

/** Browser error/telemetry init (Sentry). No-op until NEXT_PUBLIC_SENTRY_DSN is set. */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
