# rn-live2d

Live2D Cubism models rendered natively in React Native with react-native-skia (Android first). Design docs are in [docs/](./docs/README.md).

## Setup

1. Fetch **Cubism SDK for Native** 5-r.5 from Live2D. This means accepting Live2D's license, which ships in the SDK as `LICENSE.md`.

   ```bash
   bun run fetch:cubism
   ```

   It downloads the official zip, checks its SHA-256, and extracts it to `packages/rn-live2d/vendor/CubismSdkForNative/`. That gives the proprietary Core, and later the Framework. It also copies the Hiyori sample to `assets/live2d/Hiyori`. Both folders are gitignored and never committed. CI runs the same script.

2. Install and run on Android (development build; Expo Go won't work):

   ```bash
   bun install
   bunx expo prebuild --platform android
   bunx expo run:android
   ```
