# rn-live2d

Live2D Cubism models rendered natively in React Native with react-native-skia (Android first). Design docs are in [docs/](./docs/README.md).

## Setup

1. Clone with submodules: the open-source [Cubism Native Framework](https://github.com/Live2D/CubismNativeFramework) is a git submodule in `packages/rn-live2d/third_party/`.

   ```bash
   git clone --recurse-submodules <repo-url>
   # or, in an existing clone:
   git submodule update --init
   ```

2. Fetch **Cubism SDK for Native** 5-r.5 from Live2D. This means accepting Live2D's license, which ships in the SDK as `LICENSE.md`.

   ```bash
   bun run fetch:cubism
   ```

   It downloads the official zip, checks its SHA-256, and extracts it to `packages/rn-live2d/vendor/CubismSdkForNative/`. That gives the proprietary Core, which Live2D only ships in this download. It also copies the Hiyori and Mao samples to `assets/live2d/`. Both folders are gitignored and never committed. CI runs the same script.

3. Install and run on Android (development build; Expo Go won't work):

   ```bash
   bun install
   bunx expo prebuild --platform android
   bunx expo run:android
   ```
