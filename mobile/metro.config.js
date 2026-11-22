const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = process.env.EXPO_PUBLIC_SENTRY_DSN
  ? require('@sentry/react-native/metro').getSentryExpoConfig(__dirname)
  : getDefaultConfig(__dirname);

config.watchFolders = [path.join(__dirname, '..', 'public')];

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  // Expo Router 6 uses a named stringify() from the old CommonJS package.
  if (name === 'query-string' && context.originModulePath.includes(`${path.sep}expo-router${path.sep}`)) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'src', 'router-query-string.js') };
  }
  return (resolveRequest ?? context.resolveRequest)(context, name, platform);
};

module.exports = config;
