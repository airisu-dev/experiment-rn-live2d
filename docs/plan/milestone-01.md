# Milestone 1 — Static model on Android & iOS

**Status:**
- Android: **done** (2026-10-11). Hiyori renders on an Android emulator (x86_64).
- iOS: **in progress**: podspec and CI wiring done, waiting on the first CI build. See [step 7](#7-ios).

**Known issues** (fixed in [milestone 2](./milestone-02.md)):
- Pose isn't applied, so Hiyori shows both arm sets.
- Masks aren't applied, so masked parts draw unclipped.

Goal: load a Live2D model and draw it as a still image inside a Skia `<Canvas>`, on **Android and iOS**. No masks, motions, physics or interaction yet (see [roadmap.md](../roadmap.md)).

## Where things stand

- `packages/rn-live2d` is still the Nitro template: one `sum()` method, and `CMakeLists.txt` builds only `HybridRnLive2d.cpp`.
- **The Cubism SDK isn't in the repo.** No Core library, header or sample model. It must be downloaded separately ("Cubism SDK for Native"; see [gotchas.md](../gotchas.md#licensing)).
- **Skia v3 has no zero-copy vertex input.** `Skia.MakeVertices()` and `<Vertices>` take `SkPoint[]` and `number[]`, not typed arrays. So the v1 "zero-copy ArrayBuffer" path in [data-path.md](../data-path.md) isn't possible as written. That's fine for a static model: we convert once at load.
- There's no `metro.config.js`, so Metro won't bundle `.moc3` files yet.

## Main simplification

For loading and drawing a still model, **skip the Cubism Native Framework and use only Cubism Core's C API**:

- `csmReviveMocInPlace` loads the model data.
- `csmInitializeModelInPlace` sets up the model, and one `csmUpdateModel` call computes it.
- The `csmGetDrawable*` getters return the mesh data.

The Framework (motions, physics, its JSON parsing) can wait until roadmap milestone 3. That keeps the native build small.

## Steps

### 1. Vendor Cubism Core (not committed to git)

- Extract the whole SDK to `packages/rn-live2d/vendor/CubismSdkForNative/` (gitignored). Its `Core` and sample models are used now; its `Framework` from milestone 3. CMake uses `Core/include` and `Core/lib/android/<abi>/libLive2DCubismCore.a`; override with `-DCUBISM_CORE_DIR`.
- SDK 5-r.5 ships Android Core only for `arm64-v8a`, `x86`, `x86_64` (no `armeabi-v7a`), so `app.json` sets `expo-build-properties` `android.buildArchs` to those three.
- Sample models are copied to `assets/live2d/` (gitignored).
- In `android/CMakeLists.txt`:
  - Import the static `.a` for `${ANDROID_ABI}`.
  - Add the Core include directory.
  - Link the Core into `RnLive2d`.
  - Stop with a clear error if the Core is missing.
- iOS is wired separately in [step 7](#7-ios).

### 2. Nitro spec (`src/specs/*.nitro.ts`) and codegen

```ts
interface Live2DModel extends HybridObject<{ android: 'c++' }> {
  readonly canvasWidth: number
  readonly canvasHeight: number
  readonly originX: number
  readonly originY: number
  readonly pixelsPerUnit: number
  readonly drawableCount: number
  getDrawables(): DrawableData[] // sorted by render order, visible only
}

interface DrawableData {
  textureIndex: number
  opacity: number
  blendMode: number
  positions: ArrayBuffer // float32
  uvs: ArrayBuffer       // float32
  indices: ArrayBuffer   // uint16
}

interface RnLive2d extends HybridObject<{ android: 'c++' }> {
  loadModel(moc: ArrayBuffer): Live2DModel
}
```

Then run `bun run codegen` and register `Live2DModel` in `nitro.json`.

### 3. C++ (`cpp/HybridLive2DModel.{hpp,cpp}`)

- Copy the moc bytes into a 64-byte-aligned buffer (`csmAlignofMoc`).
- Run `csmHasMocConsistency`, then revive the moc.
- Allocate the model buffer with 16-byte alignment (`csmAlignofModel`), initialize it, and call `csmUpdateModel` once.
- Read canvas info and per-drawable data, then free both buffers in the destructor.
- Fail with a JS exception on a bad moc.

### 4. Loading assets (JS side)

- Add `metro.config.js` with `moc3` in `assetExts`.
- Turn each `require()` into a local file with `expo-asset` and read its bytes as an `ArrayBuffer`. A plain `fetch` of the asset URI fails in Android release builds, where assets are raw resources. Check the SDK 57 `expo-asset` / `expo-file-system` docs before writing this.
- Load textures with Skia's `Data` → `MakeImageFromEncoded`.
- Start with explicit requires, because Metro can't resolve the relative paths inside `model3.json`. Auto-resolving them can come later.

```ts
useLive2DModel({
  moc: require('./hiyori/hiyori.moc3'),
  textures: [require('./hiyori/texture_00.png'), /* … */],
})
```

### 5. Rendering (`<Live2D model x y scale />`)

- Build one `SkPicture` at load time:
  - For each drawable, call `MakeVertices(Triangles, …)`.
  - Positions: `px = x + vx * scale`, `py = y - vy * scale`. Cubism's y axis points up.
  - UVs: `(u * texW, (1 - v) * texH)`.
  - Paint uses an `ImageShader` of the drawable's texture, with alpha set from its opacity.
  - Blend modes: Normal → `SrcOver`, Additive → `Plus`, Multiply → `Multiply`.
- Show it with `<Picture>` inside the existing `<Canvas>`. Nothing runs per frame.
- Masks aren't handled yet, so masked parts draw unclipped (milestone 2).

### 6. Example screen and checks

- Replace the `sum` demo in `src/app/index.tsx` with Hiyori from the SDK samples. Keep the sample model out of git.
- Run `bunx expo prebuild --platform android`, then `bunx expo run:android`.
- Run lint and `tsc` at the end.

### 7. iOS

The C++, Nitro spec and JS are shared, so iOS only needs the native build wiring. Skia draws with Metal there.

#### How iOS gets built

There's no Mac locally, so iOS builds run on GitHub Actions through `rnd` (`@react-native-feel/deploy`):

```bash
bunx rnd build --platform ios --profile development
```

- It dispatches `.github/workflows/eas-build.yml`, which checks out the **pushed** code. Commit and push first; local changes aren't built.
- The `development` profile in `eas.json` builds a dev client **for the simulator** (`ios.simulator: true`). So the build links the `iphonesimulator` Core slices.
- The workflow runs `expo prebuild` and `pod install` itself, so the podspec and config plugins must be enough on their own.

#### CI needs the SDK, but the repo doesn't have it

The Core and the Hiyori sample are gitignored, so a CI checkout has neither. **Done:** `scripts/fetch-cubism-sdk.sh` (also `bun run fetch:cubism`):
- downloads `https://cubism.live2d.com/sdk-native/bin/CubismSdkForNative-5-r.5.zip` (Live2D's official URL),
- checks its pinned SHA-256,
- extracts it to `packages/rn-live2d/vendor/CubismSdkForNative/`,
- copies `Samples/Resources/Hiyori` to `assets/live2d/Hiyori`.

`eas-build.yml` runs it right after checkout, before install and prebuild, and caches the zip with `actions/cache`. This keeps the proprietary files out of the repo. The workflow file says the CLI never rewrites it, so the step is safe there. The same download also brings the Framework for milestone 3. To upgrade the SDK, change `VERSION` and `SHA256` in the script. Check that the Live2D license allows this kind of automated download in CI.

#### Podspec (`packages/rn-live2d/RnLive2d.podspec`)

The SDK ships iOS Core as separate static libraries per slice, not an xcframework: `Core/lib/ios/{Debug,Release}-iphoneos`, `…-iphonesimulator-arm64` and `…-iphonesimulator-x86_64`.

**Done:**
- On macOS, `fetch-cubism-sdk.sh` merges the two simulator slices with `lipo`. It then packages them with the device slice into `Core/Live2DCubismCore.xcframework` (`xcodebuild -create-xcframework`, Release libraries).
- The podspec:
  - vendors the xcframework (`vendored_frameworks`), so CocoaPods links the right slice for device or simulator, with static or dynamic pods;
  - adds `Core/include` to `HEADER_SEARCH_PATHS`. This is set before `add_nitrogen_files`, and RN's `install_modules_dependencies` appends to it rather than replacing it;
  - fails `pod install` with a clear message if the xcframework is missing;
  - drops `visionos` (no Core for it) and points `s.source` at the real repo.

This replaces the first idea of per-SDK `LIBRARY_SEARCH_PATHS`, which depended on the pod linking mode and `$(CURRENT_ARCH)` resolving at link time.

#### Checks

- Push, run the `rnd` command above, and watch the Actions run.
- Install the simulator build, start Metro, and confirm Hiyori looks the same as on Android: both arm sets and unclipped masks are expected until milestone 2.
- Unlike Android, iOS has no armeabi-v7a-style gap: the SDK ships device arm64 and both simulator architectures.

## Risks

- The iOS link setup can only be tested on CI, so each fix costs a push and a macOS run. Get the podspec right in as few rounds as possible.
- Prebuilt Core library names and ABIs vary between SDK versions. Match whatever SDK version is downloaded.
- Images decoded by Skia are already premultiplied, so dark edges shouldn't show up yet. That needs another check once masks and multiply/screen colors are added.

## Prerequisite

Download Cubism SDK for Native from Live2D (accepting their license) and extract it; step 1 starts from that location.
