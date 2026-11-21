module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const organization = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (projectId) config.extra = { ...config.extra, eas: { ...config.extra?.eas, projectId } };
  if (googleServicesFile) config.android = { ...config.android, googleServicesFile };
  if (organization && project) {
    config.plugins = [...(config.plugins ?? []), ['@sentry/react-native/expo', { organization, project }]];
  }
  return config;
};
