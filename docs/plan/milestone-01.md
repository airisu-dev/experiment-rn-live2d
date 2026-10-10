# Milestone 1 — Static model on Android

**Status: done** (2026-10-11). Hiyori renders on an Android emulator (x86_64).

**Known issues** (fixed in [milestone 2](./milestone-02.md)):
- Pose isn't applied, so Hiyori shows both arm sets.
- Masks aren't applied, so masked parts draw unclipped.

Goal: load a Live2D model and draw it as a still image inside a Skia `<Canvas>`, **Android only**. No masks, motions, physics or interaction yet (see [roadmap.md](../roadmap.md)).

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
- Leave iOS (podspec, `nitro.json` iOS block) alone.

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

## Risks

- Prebuilt Core library names and ABIs vary between SDK versions. Match whatever SDK version is downloaded.
- Images decoded by Skia are already premultiplied, so dark edges shouldn't show up yet. That needs another check once masks and multiply/screen colors are added.

## Prerequisite

Download Cubism SDK for Native from Live2D (accepting their license) and extract it; step 1 starts from that location.
