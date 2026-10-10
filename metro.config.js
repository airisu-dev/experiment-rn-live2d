const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle Live2D model data as assets.
config.resolver.assetExts.push('moc3');

module.exports = config;
