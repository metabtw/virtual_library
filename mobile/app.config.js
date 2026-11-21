module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const organization = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  config.plugins = [...(config.plugins ?? []), ['react-native-google-mobile-ads', {
    androidAppId: process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
    iosAppId: process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511',
    delayAppMeasurementInit: true,
  }]];

  if (projectId) config.extra = { ...config.extra, eas: { ...config.extra?.eas, projectId } };
  if (googleServicesFile) config.android = { ...config.android, googleServicesFile };
  if (organization && project) {
    config.plugins = [...(config.plugins ?? []), ['@sentry/react-native/expo', { organization, project }]];
  }
  return config;
};
