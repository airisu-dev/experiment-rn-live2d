# rn-live2d

Live2D Cubism models rendered natively in React Native with react-native-skia (Android first). Design docs are in [docs/](./docs/README.md).

## Setup

1. Fetch **Cubism SDK for Native** 5-r.5 from Live2D. This means accepting Live2D's license, which ships in the SDK as `LICENSE.md`.

   ```bash
   bun run fetch:cubism
   ```

   It runs `rn-live2d fetch-sdk`, which downloads the official zip, checks its SHA-256, and extracts it to `vendor/CubismSdkForNative/`. That gives the proprietary Core and the Cubism Native Framework source, which the native builds compile; `app.json` points the `rn-live2d` config plugin at that folder. It also copies the Hiyori and Mao samples to `assets/live2d/`. Both folders are gitignored and never committed. CI runs the same script.

2. Install and run on Android (development build; Expo Go won't work):

   ```bash
   bun install
   bunx expo prebuild --platform android
   bunx expo run:android
   ```
