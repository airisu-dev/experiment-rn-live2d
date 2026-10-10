# rn-live2d

Live2D Cubism models rendered natively in React Native with react-native-skia (Android first). Design docs are in [docs/](./docs/README.md).

## Setup

1. Download **Cubism SDK for Native** 5-r.5 from Live2D (accept their license) and extract it to `packages/rn-live2d/vendor/CubismSdkForNative/`. It provides the proprietary Core (and later the Framework); the folder is gitignored and never committed.

2. Copy a sample model for the example app, e.g. `vendor/CubismSdkForNative/Samples/Resources/Hiyori` → `assets/live2d/Hiyori` (also gitignored).

3. Install and run on Android (development build; Expo Go won't work):

   ```bash
   bun install
   bunx expo prebuild --platform android
   bunx expo run:android
   ```
