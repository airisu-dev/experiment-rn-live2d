# react-native-rn-live2d

react-native-rn-live2d is a react native package built with Nitro

[![Version](https://img.shields.io/npm/v/react-native-rn-live2d.svg)](https://www.npmjs.com/package/react-native-rn-live2d)
[![Downloads](https://img.shields.io/npm/dm/react-native-rn-live2d.svg)](https://www.npmjs.com/package/react-native-rn-live2d)
[![License](https://img.shields.io/npm/l/react-native-rn-live2d.svg)](https://github.com/patrickkabwe/react-native-rn-live2d/LICENSE)

## Requirements

- React Native v0.76.0 or higher
- Node 18.0.0 or higher

> [!IMPORTANT]  
> To Support `Nitro Views` you need to install React Native version v0.78.0 or higher.

## Installation

```bash
npx expo install rn-live2d react-native-nitro-modules react-native-skia react-native-reanimated react-native-worklets react-native-gesture-handler expo-asset expo-file-system
```

Expo apps only (development builds with prebuild); the React Native CLI isn't supported.

Skia: either version works; install one, not both.

| Skia | Package | Renderer |
| --- | --- | --- |
| v3 | `react-native-skia` (3.3+) | Graphite (Vulkan, Metal) |
| v2 | `@shopify/react-native-skia` (2.10+) | Ganesh (OpenGL, Metal) |

For v2, install `@shopify/react-native-skia` instead of `react-native-skia` above, at 2.10 or later: `expo install` picks 2.6.2 for SDK 57, which hands Skia objects to C++ differently (JSI host objects, not native state), so pin a newer one, e.g. `npx expo install @shopify/react-native-skia@2.14.0`. The config plugin reads which one the app depends on, and models are drawn in C++ with it.

### Cubism SDK for Native

The package doesn't include Live2D's Cubism SDK: its Core is proprietary, and
each app downloads it from Live2D, accepting
[Live2D's license terms](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).

1. Download it (it's checked against a SHA-256):

   ```bash
   npx rn-live2d fetch-sdk --accept-license   # or bunx, yarn, pnpm
   ```

   It extracts to `./vendor/CubismSdkForNative` (change it with `--out`). Add `/vendor/` to `.gitignore`, so it's never in a public repo. On EAS Build,
   run the same command in an `eas-build-post-install` script.

2. Point the config plugin at it, in `app.json`:

   ```json
   "plugins": [["rn-live2d", { "cubismSdkPath": "./vendor/CubismSdkForNative" }]]
   ```

3. `npx expo prebuild`, then build. A missing or unsupported SDK stops the build with the path it looked at.

Publishing an app built on the SDK may also need Live2D's
[Cubism SDK Release License](https://www.live2d.com/en/sdk/license/) (businesses above 10M JPY a year).

## Credits

Bootstrapped with [create-nitro-module](https://github.com/patrickkabwe/create-nitro-module).

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
