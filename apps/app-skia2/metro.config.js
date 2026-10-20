const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle Live2D model data as assets.
config.resolver.assetExts.push('moc3');

// This app draws with Skia v2 (@shopify/react-native-skia). In the monorepo
// Skia v3 (react-native-skia) is installed too, for apps/app, and the shared
// demo and rn-live2d import it first: send those imports to v2.
const V3 = 'react-native-skia';
const V2 = '@shopify/react-native-skia';
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name =
    moduleName === V3 || moduleName.startsWith(`${V3}/`)
      ? V2 + moduleName.slice(V3.length)
      : moduleName;
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
