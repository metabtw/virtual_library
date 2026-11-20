import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.user;
      delete event.request;
      delete event.breadcrumbs;
      delete event.extra;
      return event;
    },
  });
}

export const withErrorMonitoring = <P extends Record<string, unknown>>(component: React.ComponentType<P>) =>
  dsn ? Sentry.wrap(component) : component;

let analytics: PostHog | undefined;
let analyticsEnabled = false;
export const hasAnalytics = Boolean(key && host);

export function setUsageMeasurement(enabled: boolean) {
  analyticsEnabled = enabled && hasAnalytics;
  if (analyticsEnabled && !analytics) {
    analytics = new PostHog(key!, {
      host, persistence: 'memory', captureAppLifecycleEvents: false,
      enableSessionReplay: false, disableGeoip: true, disableSurveys: true,
      preloadFeatureFlags: false, defaultOptIn: false,
    });
  }
  if (analyticsEnabled) void analytics?.optIn();
  else void analytics?.optOut();
}

export function trackUsage(event: 'room_joined' | 'focus_started' | 'focus_confirmed') {
  if (analyticsEnabled) analytics?.capture(event, { $process_person_profile: false });
}
