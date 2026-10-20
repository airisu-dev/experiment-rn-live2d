# Milestone 6 — Older Cubism SDK versions

**Status: base done, versions planned.** The build is ready for several versions (step 1, and `cpp/CubismCompat.hpp` with `RN_LIVE2D_CUBISM_SDK`), but only 5-r.5 is listed: `CubismCompat.hpp` fails the build on anything older. Adding 5-r.4.1 and 4-r.7 is steps 2–7.

Goal: build and run against **5-r.5** (current), **5-r.4.1** and **4-r.7**, the latest release of each major plus the last one before 5-r.5's API break.

## What's available

Every release from 4-r.1 to 5-r.5 is still served at `https://cubism.live2d.com/sdk-native/bin/CubismSdkForNative-<version>.zip`. Compared from the zips (2026-10-20):

| SDK | Newest moc | Android Core ABIs | iOS simulator Core | Framework |
| --- | --- | --- | --- | --- |
| 4-r.7 (2023-05) | 4.2 | arm64-v8a, **armeabi-v7a**, x86, x86_64 | one lib, **x86_64 only** | no `CubismExpressionMotionManager`; `StartMotion(motion, autoDelete, userTimeSeconds)`; `LoadMotion` without setting/group/index |
| 5-r.4.1 (2025-07) | 5.0 | arm64-v8a, x86, x86_64 | one lib, **x86_64 only** | no update scheduler, no `CubismLook` |
| 5-r.5 (2026-04) | 5.3 | arm64-v8a, x86, x86_64 | arm64 and x86_64 libs | `CubismUpdateScheduler` + `*Updater`s, `CubismLook`, offscreens, blend modes |

- **The API break is inside major 5**, between 5-r.4.1 and 5-r.5, not between majors. Everything before 5-r.5 shares one "legacy" API with small differences.
- **Core:** 5-r.5 renamed `csmGetDrawableRenderOrders` to `csmGetRenderOrders` (and the Framework's `GetDrawableRenderOrders()` to `GetRenderOrders()`). Everything else we call exists in all three, including `csmGetMocVersion` / `csmGetLatestMocVersion`.
- **16 KB pages:** not a concern. We link the Core's static `.a` into `libRnLive2d.so`, whose alignment comes from our own link (`-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` in `build.gradle`; current arm64 build: `0x4000`). The `.a` makes no page-size calls (`sysconf`, `mmap`, ...). 5-r.4.1's "16 KB support" is about the prebuilt `.so` in `Core/dll`, which we don't use, and even 4-r.7's `.so` is 64 KB aligned.

Checksums:

| Version | SHA-256 |
| --- | --- |
| 5-r.5 | `7ff3a4bbc19c0a8728965aa522ab77eb11b252916453e68a8a78d3b71188bb12` |
| 5-r.4.1 | `b71ec6bafc6578cce3b4cbbaa42a1cb51ae6eb477557932b02d22af957e733c7` |
| 4-r.7 | `bf3cc4db31a15107f5a5d5120dbac5c9b4cb143dea993bf12e44100d36b98d1e` |

## Steps

### 1. Supported versions in one place ✅

- `package.json`: `cubismSdk: { latest, versions: { <version>: { sha256 } } }`. To add a version: list it with its checksum (above), and drop the `#error` in `CubismCompat.hpp` down to it.
- `build.gradle` and `RnLive2d.podspec`: a listed version is supported; a newer release of a listed major warns; anything else fails. Both pass the version to C++ as `RN_LIVE2D_CUBISM_SDK` (major·10000 + release·100 + patch, so 5-r.4.1 is `50401`), read from `cubism-info.yml`.
- CLI: `rn-live2d fetch-sdk --sdk-version <version>` (default: `latest`). `scripts/fetch-cubism-sdk.sh` passes `CUBISM_SDK_VERSION` through. The config plugin is unchanged: the build reads the version from the SDK folder.
- `cpp/CubismCompat.hpp` (namespace `cubism`) holds the calls that differ: so far `cubism::renderOrders`.

### 2. C++ compatibility (`cpp/CubismCompat.hpp`)

- `cubism::renderOrders(model)` (already there): add the `csmGetDrawableRenderOrders` branch for before 5-r.5.
- **Update loop:** keep the scheduler on 5-r.5. Before it, `Live2DUserModel::update` runs the SDK sample's fixed order (5-r.4.1 `LAppModel::Update`): eye blink unless a motion moved the eyes → expression → look → breath → held parameters → physics → pose → `CubismModel::Update`.
  - Look: `_dragManager->Update(dt)`, then `AddParameterValue` with the factors we give `CubismLook` today (angle X/Y 30, Z −30·x·y, body X 10, eyeballs 1).
  - Held parameters: the same map `HeldParameterUpdater` applies, set after breath and before physics.
- **4-r.7 only:**
  - Expressions run on a plain `CubismMotionManager`; `StartMotion` takes the user time, so keep a running total.
  - `LoadMotion` can't read fade times from `model3.json`: set them from the settings (`GetMotionFadeInTimeValue` / `GetMotionFadeOutTimeValue`), as the 4.x samples did.
- Switch on `RN_LIVE2D_CUBISM_SDK` (`< 50500` for the legacy path, `< 50000` for 4-r.7).

### 3. Clearer error for too-new models

An older Core can't read newer mocs (4-r.7: up to 4.2, 5-r.4.1: up to 5.0). Check `csmGetMocVersion` against `csmGetLatestMocVersion` before loading, and throw e.g. "Live2D: this model is moc 5.0, Cubism SDK 4-r.7 reads up to 4.2" instead of today's generic message.

### 4. iOS

- Podspec staging: 5-r.5 merges `Release-iphonesimulator-{arm64,x86_64}` with `lipo` as today; older SDKs use the single `Release-iphonesimulator` lib as is.
- **Limitation:** before 5-r.5 the simulator Core is x86_64 only, so it can't link for arm64 simulators (Apple Silicon Macs, GitHub's macOS runners). Device builds work. Document it; `EXCLUDED_ARCHS[sdk=iphonesimulator*]=arm64` only works if every other pod has an x86_64 simulator slice, which Skia Graphite is unlikely to have.
- Test older SDKs on iOS with a device build (`preview` profile), not the `development` simulator profile.

### 5. Android

- armeabi-v7a is in 4-r.7 only. Apps that want it add it to `expo-build-properties` `android.buildArchs`; CMake already fails clearly when the Core lacks an ABI.
- Check `libRnLive2d.so` with `llvm-readelf -lW` per version, to catch a regression if the flexible page size flag goes away.

### 6. Checks

- Android: build the demo against each version. Hiyori and Mao: masks, motions, physics, expressions, focus, hit test, pose.
- iOS: a device build per version.
- CI: an Android compile-only matrix over the three versions, so the legacy path doesn't rot.
- Run lint and typecheck.

### 7. Docs

- [gotchas.md](../gotchas.md#licensing): supported versions, `--sdk-version`, the iOS simulator limitation.
- [api.md](../api.md): which moc versions each SDK reads (next to the Cubism 2 note).
