const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.watchFolders = [path.join(__dirname, '..', 'public')];

module.exports = config;
