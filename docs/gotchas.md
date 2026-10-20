# Gotchas

## Licensing
Cubism Core is under the Live2D Proprietary Software License, which allows redistributing it only inside a finished app for its end users, not in a package for other developers. So **neither the npm package nor this repo contains any of the SDK**, the same as `pixi-live2d-display`. Each app downloads Cubism SDK for Native from Live2D itself, accepting the license, and points the package at it:

- `rn-live2d fetch-sdk --accept-license [--sdk-version <version>] [--out <dir>]` (`cli/src`, run through any package manager: `npx`, `bunx`, …) downloads the official zip of a supported version (default: the latest) and checks its SHA-256. On EAS Build, run it in an `eas-build-post-install` script.
- The config plugin (`plugin/src`, loaded by `app.plugin.js`, option `cubismSdkPath`, relative to the app's root) writes the folder into `android/gradle.properties` and `ios/Podfile.properties.json` as `rnLive2d.cubismSdkPath`, relative to the native folder. The environment variable `RN_LIVE2D_CUBISM_SDK` overrides it. Only Expo apps (prebuild) are supported.
- `android/build.gradle` and `RnLive2d.podspec` read it, check the SDK's `cubism-info.yml` version against `cubismSdk.versions` in the package's `package.json` (a newer release of a listed major warns, anything else unlisted fails), pass it to C++ as `RN_LIVE2D_CUBISM_SDK` (5-r.4.1 → `50401`), and build the **Core** and the **Cubism Native Framework** source from that one folder, so the two always match.
- iOS: CocoaPods only compiles files inside the pod, so at `pod install` the podspec copies the Framework source into the gitignored `cubism-sdk/` and packages the Core's static libraries as an xcframework there (`lipo`, `xcodebuild -create-xcframework`). It's redone when the SDK's folder or version changes.

Apps built on the SDK by businesses above 10M JPY annual revenue also need Live2D's Cubism SDK Release License. To support another SDK version, add it with its `sha256` to `cubismSdk.versions` (and move `latest` if it's newer), and put calls that differ between versions in `cpp/CubismCompat.hpp`. Only 5-r.5 is listed for now: older versions are planned in [milestone 6](./plan/milestone-06.md).

The plugin and the CLI are TypeScript, built to `plugin/build` and `cli/build` (`tsc -b plugin cli`, gitignored). The repo's `postinstall` builds them, and so does `prepack` before publishing: Expo CLI only loads `app.plugin.js`, and Node won't run TypeScript from `node_modules`.

## Assets
`model3.json` references `.moc3`, textures, motions and physics files by relative path.
- Add `moc3` and `motion3.json` (and other Cubism file types) to Metro's `assetExts`.
- Resolve the bundle to real file paths natively.

## Premultiplied alpha
Cubism expects premultiplied alpha. Make sure texture loading and the shader agree, otherwise edges get dark halos.

## Moc consistency
Call `csmHasMocConsistency` on the `.moc3` before loading untrusted models.

## Coordinates
Cubism uses a unit space centered on the origin. Map to canvas pixels with a canvas-size / pixels-per-unit transform.

## Cubism JSON parser
The Cubism Native Framework parses its JSON files (model3, physics3, pose3, motion3, ...) with its own `Utils::CubismJson`, which only handles the layout Cubism Editor writes:
- A number must be followed by a newline or a comma (`CubismJson::ParseNumeric`). `{"A":1}`, `[1,2]` and `{"A": 1, "B": 2}` all fail.
- Exponents (`1e-7`) aren't supported.

`JSON.stringify(x)` breaks both rules. Send files through `toCubismJson` (`packages/rn-live2d/src/cubismJson.ts`): tab-indented, one value per line, exponents written out in full. Its loaders also don't check for parse errors and crash on bad JSON, so `Live2DUserModel` test-parses every input first and throws instead.

## Android release assets

In Android release builds, assets are embedded in the APK. For images, `expo-asset` skips the download and sets `localUri` to a bare drawable name (enough for `<Image>`), which `expo-file-system` rejects ("URI is not absolute"). `readAsset` in `loadModel.ts` clears that and calls `downloadAsync()`, which copies the resource into the cache. Debug builds never hit this: Metro serves assets over HTTP. Always check a release build before calling a loading change done.

## Worklet captures

A worklet copies everything it captures to its runtime. Capturing `globalThis` (even through a module constant) fails with "Trying to convert a cyclic object to a serializable". Reference `globalThis` inside the worklet body instead (see `src/clock.ts`).

## React Compiler and gesture callbacks

The React Compiler is on, and it compiles the workspace package too. A `let` reassigned in one gesture callback and read in another (both made in the same `useMemo`) wasn't seen by the other callback: the long-press drag set it in `onStart`, and `onUpdate` still read `null`. Keep such state on a mutable object (`{ current }`) or a ref (see `useLive2DGesture.ts`).

## Gesture handler events

- `Pan().activateAfterLongPress`: `onBegin` doesn't run before `onStart` the way you'd expect, so don't save the press position in `onBegin` for `onStart`. Read it from `onStart`'s own event; the finger has barely moved by then.
- Combining separate per-model gestures with `Gesture.Simultaneous` doesn't make their inner gestures simultaneous with each other. Use one gesture for all models (`useLive2DGestures`).

## Skia v2 and v3

rn-live2d works with Skia v3 (`react-native-skia`, Graphite) and v2 (`@shopify/react-native-skia`, Ganesh) from 2.10. The APIs it uses are the same in both, in JS and in C++ (`JsiSkNativeObjects.h`, `JsiSkShader.h` and `JsiSkCanvas::getCanvas` match). Before 2.10 (2.6–2.9, and 2.6.2 is what `expo install` picks for SDK 57), Skia objects reach C++ as JSI host objects instead of native state, which `SkiaDrawer` doesn't unwrap.

- **JS:** `src/skia.ts` requires v3, else v2 (Expo's Metro treats guarded requires as optional), and declares the few Skia types the library uses itself: its sources are type-checked by the app, which may have only one of the packages.
- **Native:** the config plugin writes the Skia package the app's `package.json` depends on as `rnLive2d.skiaPackage`. `build.gradle` and the podspec resolve it from the app's folder, not the library's: in a monorepo both versions are installed side by side (different names, so hoisting keeps both). Graphite builds use `SK_GRAPHITE` and the Dawn headers; Ganesh builds `SK_GL SK_GANESH` (Android) or `SK_METAL SK_GANESH` (iOS), and link `react-native-skia-android`'s `libskia.a`.
- **Monorepo apps on v2** map `react-native-skia` to `@shopify/react-native-skia` in their Metro config (`apps/app-skia2/metro.config.js`): otherwise the library's guarded require finds the hoisted v3 first.
- **Changing a package's version with Bun** (2.6.2 to 2.14.0 here) left the old version's extra folders in `node_modules` (2.6.2's `cpp/jsi2`, `android/src/paper`, …), and the Android build failed on the mix: first Skia's `prepareHeaders` on two `EnumMapper.h`, then Java on old classes. Delete the package's folder and reinstall, and delete `android/app/build/generated/autolinking` if autolinking still lists old classes.
