# Milestone 3 — Motions & physics

**Status: in progress.**
- Step 1, Framework builds and starts: Android **done** (2026-10-11); iOS podspec updated, waiting on a CI build. See [Step 1 notes](#step-1-notes).
- Step 2, `update(dt)` with motions, physics, blink, breath, pose: Android **done** (2026-10-11), iOS waiting on a CI build. See [Step 2 notes](#step-2-notes).
- Step 3, per-frame redraw: Android **works** (2026-10-11) on a background worklet thread: Hiyori 56–58 fps, Mao 44–46 fps on the emulator. iOS and real-device numbers still to check. See [Step 3 notes](#step-3-notes) and [Background thread](#background-thread-react-native-worklets).

Goal: the model moves. Idle motion loops, with physics, eye blink and breath, at 60 fps on a mid-range phone.

## Native: bring in the Cubism Native Framework

- Compile the Framework's `src` into `RnLive2d`, **without** any `Rendering/<backend>` folder. The Framework still includes the abstract `Rendering/CubismRenderer.hpp`, so check whether a small stub renderer is needed, or skip `CubismUserModel` and drive the modules directly.
- Modules to use: `CubismMotionManager` + `CubismMotion`, `CubismPhysics`, `CubismPose` (replaces milestone 2's JS pose), `CubismEyeBlink`, `CubismBreath`.
- Add the Framework sources to both `android/CMakeLists.txt` and the podspec. The Framework is a git submodule (`third_party/CubismNativeFramework`, tag `5-r.5`, matching the Core); CI checks it out with `submodules: true`.
- Add `CubismFramework::StartUp` / `Initialize` once per process, with an allocator.
- New model methods: `update(dt)`, `motion(group, index?)`, and loading of motion / physics / pose JSON (read as strings in JS, passed to C++).

## Per-frame drawing

The single `SkPicture` no longer works, so redraw every frame:

- Drive `update(dt)` from Reanimated's `useFrameCallback` on the UI thread. Nitro objects must be callable from worklets (check `NitroModules.box`).
- Only rebuild `SkVertices` for drawables whose dynamic flags say vertices, opacity or visibility changed (`csmVertexPositionsDidChange`, …). Reuse the rest.
- Keep the milestone 2 mask drawing.

## Assets

`motion3.json` and `physics3.json` are plain JSON, so `require()` already works. Extend the `useLive2DModel` source with `motions: { [group]: [...] }`, `physics` and `pose`.

## Checks

- Hiyori plays the `Idle` group in a loop, blinks and breathes, and the hair and skirt swing.
- Profile frame time on the emulator and on a real arm64 phone. If it's too slow, pull [milestone 5](./milestone-05.md) forward.

## Step 1 notes

- `android/CMakeLists.txt` builds every `.cpp` under `third_party/CubismNativeFramework/src` (the git submodule) into a static `CubismFramework` library, minus the `Rendering/<backend>` folders. That's 49 files, compiled with `-w` because it's third-party code. It's linked before the Core.
- No stub renderer class is needed. Outside the backends, the Framework only calls two static functions that each backend normally defines: `CubismRenderer::Create` (used by `CubismUserModel`) and `CubismRenderer::StaticRelease` (used by `CubismFramework::Dispose`). `cpp/CubismRendererStub.cpp` defines them as no-ops, with `Create` returning `nullptr`. So **don't use `CubismUserModel`'s renderer**; drive `CubismModel` and the motion/physics/pose classes directly.
- The Framework needs no platform defines outside the renderer.
- `cpp/CubismSetup.cpp`: `ensureCubismFramework()` runs `StartUp` + `Initialize` once per process (`std::call_once`), with an aligned allocator and a log function (logcat tag `RnLive2d` on Android). It's called from the `HybridLive2DModel` constructor.
- Checked on the emulator: `libRnLive2d.so` contains the Framework symbols, and logcat shows `Live2D Cubism Core version: 06.00.0001`, `CubismFramework::StartUp() is complete.` and `Initialize() is complete.`. Rendering is unchanged.
- Both builds stop with "Run `git submodule update --init`" if the submodule is missing.
- iOS: the podspec adds `third_party/CubismNativeFramework/src/**/*.{hpp,cpp}` to `source_files`, excludes `Rendering/*/**/*` (the backends), and adds that `src` to `HEADER_SEARCH_PATHS`. The stub and setup files come in with `cpp/**`. No header basename collisions (checked), so the flat header lookup is safe.

## Step 2 notes

- `cpp/Live2DUserModel` subclasses the Framework's `CubismUserModel` and never calls `CreateRenderer()`. That gives the SDK's own loaders (`LoadModel`, `LoadPhysics`, `LoadPose`, `LoadMotion`) and motion manager, without its renderer. `HybridLive2DModel` wraps it and reads drawables from `model()->GetModel()`.
- `update(dt)` follows the SDK sample's `LAppModel::Update`: `LoadParameters` → motion (a random `Idle` motion when nothing plays) → `SaveParameters` → update scheduler (eye blink unless a motion moved the eyes, breath, physics, pose) → `CubismModel::Update`.
- Eye blink and lip sync ids and motion fade times come from `model3.json`, which `RnLive2d.loadModel(moc, settingsJson)` now requires. Breath uses the samples' parameters.
- Pose now runs in C++ (`CubismPose`, with fades). The JS pose and `setPartOpacity`/`setParameterValue` were removed: with motions running, `LoadParameters` would overwrite those writes every frame. Milestone 4 re-adds parameter control at the right point in `update`.
- JS API: `useLive2DModel({ settings, moc, textures, physics?, pose?, motions?: { Group: [...] } })`. `Live2DModel` exposes `native` (`update`, `startMotion(group, index, 'idle' | 'normal' | 'force')`) and `draw()`, which renders the current state into a new `SkPicture` for step 3.
- Use the Framework's `Live2DCubismCore.hpp` (Core API in `Live2D::Cubism::Core`), never `Live2DCubismCore.h` directly, in code that also includes Framework headers.
- **The Framework's JSON parser is not a full JSON parser** (see [gotchas.md](../gotchas.md#cubism-json-parser)). `JSON.stringify` output crashed the app on the first try. Fixes: `src/cubismJson.ts` writes JSON the parser accepts, and C++ test-parses every input and throws a JS error instead of crashing.
- Checked on the emulator with a temporary 10 Hz update + redraw loop (removed afterwards):
  - Hiyori: head, arms, hair and ribbons move between frames.
  - Mao: the glowing orbs drift and a paint drop falls.
  - No crash. `update` takes 0.1–0.3 ms; a full redraw in JS takes 6–9 ms (Hiyori) and 10–13 ms (Mao).
- Without step 3, the app still shows one still frame (the state after load).

## Step 3 notes

- First version: `<Live2D>` ran a `requestAnimationFrame` loop on the JS thread: `native.update(dt)` (real elapsed time, capped at 0.1 s) → `model.draw()` → a Reanimated shared value that `<Picture>` reads, so Skia redraws without a React re-render. A `paused` prop stops the loop and keeps the last frame.
- Native memory: Hermes doesn't see the native memory behind Skia objects, so frames piled up. Fixes:
  - Replaced meshes are `dispose()`d once the frame is recorded; the picture keeps its own reference.
  - Pictures are disposed three frames after being replaced, in case the UI thread is still drawing them. `model.picture` and the newest frame are never disposed.
  - Memory now stays flat (about 567 MB PSS for the whole debug app over 60 s, versus 620–680 MB swings before).
- Mesh reuse: `createDrawer` keeps last frame's meshes and only rebuilds a drawable whose vertex positions changed. Texture coordinates and indices are built once. About half the meshes move in a typical idle frame (Mao: about 135 of 262).
- Where the time goes (Mao, emulator, debug JS, before mesh reuse): `Skia.MakeVertices` about 12.5 ms per frame, building point arrays about 5 ms, copying drawables out of C++ about 1 ms, `update` 0.2–0.3 ms. `MakeVertices` has no typed-array path: it reads every point as a JS object.
- Results on the x86_64 emulator, debug build:

  | Model | JS work per frame | Frame rate |
  | --- | --- | --- |
  | Hiyori | about 7.5 ms (was about 9.5 ms) | 52–59 fps for the first ~20 s, then 16–30 fps |
  | Mao | about 13.7 ms (was about 17 ms) | about 29.5 fps |

- After Hiyori slows down, no app thread is busy (max 12% CPU) and the JS work stays at about 7 ms. So the limit is outside JS, most likely the emulator's emulated GPU with all the mask layers. **The emulator can't settle this; measure a release build on a real arm64 phone (and iOS) next.**
- If a real device is also too slow, the options are: fewer mask layers per frame (milestone 5, item 2), or drawing directly in C++ against react-native-skia's Skia (milestone 5, item 3, the "v2" data path), which removes `MakeVertices` from JS entirely.

## Background thread (react-native-worklets)

`<Live2D>` now runs the loop on its own worklet runtime (`createWorkletRuntime({ name: 'live2d' })`, shared by all models), so the JS thread does no per-frame work.

- The drawing code moved to `src/drawer.ts`, with every function a worklet. `model.draw()` on the JS thread uses the same code.
- Nitro and Skia objects pass into the runtime as worklet arguments: both libraries register their objects with worklets. Skia's global API isn't installed on that runtime, but creating and using Skia objects from the captured `Skia` works.
- **`scheduleOnUI` can't be called from a custom worklet runtime** unless the app uses worklets' Bundle Mode. So the loop publishes `{ frame, picture }` to a `Synchronizable`, and a Reanimated `useFrameCallback` on the UI thread copies it into the `<Picture>` shared value when the frame number changes.
- **Pacing:** that runtime's `requestAnimationFrame` polls every 16 ms after the previous frame, which halved the frame rate (about 32 fps). The loop uses `setTimeout` aimed at a 16.7 ms frame instead.
- **Errors:** an uncaught exception on that runtime aborts the whole app (seen as a `JniException` on the `live2d_queue` thread). Setup and every frame are wrapped; on error the loop stops and logs `[rn-live2d] animation stopped` to the JS console.
- Pictures are freed 4 frames after being replaced (the UI picks up the newest one each display frame).
- Results on the emulator (debug build), same code otherwise:

  | Model | JS-thread loop | Background-thread loop |
  | --- | --- | --- |
  | Hiyori | 52–59 fps, falling to 16–30 fps after ~20 s | **56–58 fps, steady** (50 s) |
  | Mao | ~29.5 fps | **44–46 fps** |

  Work per frame is higher on the background runtime (Hiyori about 13 ms, Mao about 22 ms, versus 7.5 and 13.7 ms on the JS thread), probably because Skia calls go through boxed objects. It still wins because nothing else competes for that thread. Memory stays flat at about 590 MB PSS. Switching models stops one loop and starts the next cleanly.
- **Threading caveat for milestone 4:** the native model is now updated on the `live2d` thread. Calling `native.startMotion` (or `model.draw()`) from the JS thread while it animates would race with that thread. Route those calls through the runtime (e.g. `scheduleOnRuntime`), or add a lock in C++.
