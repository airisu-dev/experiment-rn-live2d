# Milestone 5 — Performance

Goal: steady 60 fps (120 where supported) with one model on a mid-range arm64 phone, and room for two models.

## Measure first

- Profile on a real arm64 phone in a release build, not the emulator.
- Split the frame time into: C++ `update`, crossing JSI + building `SkPoint[]`, `MakeVertices`, and Skia draw (`saveLayer`s for masks are the likely GPU cost).
- Use the Android GPU profiler / Perfetto for the GPU side.

## Measurements

`<Live2D onFrameStats>` reports per-frame timings of the animation loop, and the example app shows them in an overlay. The loop paces itself to the display's refresh rate (measured on the UI thread), and `maxFps` can cap it.

Galaxy S20 Ultra (SM-G988N, Snapdragon 865, Android 13, 120 Hz), release build, 2026-10-11:

| Model | fps / target | Work | update | copy | draw | of which mesh | meshes rebuilt | mask layers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hiyori | 118 / 120 | 7.6 ms | 0.1 | 0.8 | 6.7 | 5.3 | 110 | 16 |
| Mao | 65 / 120 | 15.2 ms | 0.3 | 1.8 | 13.1 | 10.9 | 136 | 54 |

- Mao is bound by the animation thread, not the GPU: 15.2 ms of work per frame matches 65 fps. At 60 Hz it fits, but with little room, and a mid-range phone won't hold 60.
- About 72% of Mao's frame is building meshes. react-native-skia's `MakeVertices` reads every position and texture coordinate as a JS object through JSI (`JsiSkVertices::createCtor`), and converts the indices again, on every rebuild. There's no typed-array path, so JS-side tweaks can't remove this cost.
- So item 3 below (C++ against Skia) is the fix that matters. Items 1 and 2 save at most the copy (1.8 ms) and part of the draw.

### After drawing in C++

Same phone, release build, same day:

| Model | fps / target | Work | update | draw | of which mesh | meshes rebuilt | mask layers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hiyori | 119 / 120 | 1.0 ms (was 7.6) | 0.4 | 0.7 | 0.2 | 110 | 16 |
| Mao | 121 / 120 | 1.2 ms (was 15.2) | 0.4 | 0.8 | 0.2 | 140 | 52 |

Both models hold the display's 120 Hz, with most of the 8.3 ms frame budget left over.

iPhone 15 (60 Hz), preview build from `feat/native-skia-drawer`, same day:

| Model | fps / target | Work | update | draw | of which mesh | meshes rebuilt | mask layers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hiyori | 51 / 61, then **60 / 60** | 1.3 ms, then 1.0 | 0.4 | 0.7 | 0.2 | 110 | 16 |
| Mao | 52 / 60, then **60 / 60** | 1.4 ms, then 1.0 | 0.4 | 0.6 | 0.2 | 136 | 54 |

("then": after the pacing fix below.)

- The C++ path works on iOS too (`copy 0.0`), and the work per frame matches Android.
- The missing frames were pacing, not work. The loop waited `frame time - work` with `setTimeout`, and the worklet runtime's timer on iOS wakes about 4 ms late every time, which added up. The loop now waits until an absolute time for each frame (`nextFrameAt += interval`), so late wake-ups don't add up; it starts over from "now" when it falls more than a frame behind. Android went from 118–121 to a steady 120/120, and the iPhone 15 from 51–52 to 60/60.
- `app.json` sets `CADisableMinimumFrameDurationOnPhone`, without which iOS caps apps at 60 Hz on ProMotion (120 Hz) iPhones.

## C++ drawing (`cpp/SkiaDrawer.cpp`)

- `HybridLive2DModel` adds two raw JSI methods: `setTextures(shaders, sizes)` once per model, and `drawTo(canvas, wantStats)` per frame. JS records each frame with `Skia.PictureRecorder` and passes the canvas in. The C++ side reads the drawables straight from Cubism Core and draws them like `src/drawer.ts`: a mesh is rebuilt only when its vertex positions changed (`memcmp` against the last build), and texture coordinates are built once.
- JS objects are unwrapped from their JSI native state with a plain cast. jsi's `hasNativeState<T>` uses `dynamic_cast`, which can't be relied on across shared libraries.
- **Two copies of Skia on Android:** `librnskia.so` doesn't export Skia's symbols, so rn-live2d links the same prebuilt `libskia.a` (from `react-native-skia-graphite-android`) and compiles with react-native-skia's headers and defines. Objects created by one copy are used by the other through virtual calls on identical layouts. This holds only while both come from the same package versions, which the shared `node_modules` guarantees. It adds about 2.5 MB per ABI to `libRnLive2d.so` (3.6 MB in the APK).
- **iOS: one copy of Skia.** Skia is linked statically into the app there, so `RnLive2d.podspec` depends on `react-native-skia` and adds only its headers and defines (`RN_LIVE2D_SKIA`, `SK_GRAPHITE`, …); `SkiaDrawer.cpp` calls the app's own Skia.
- Without the Skia packages, the raw methods don't exist and `<Live2D>` falls back to the JS drawer, on either platform.

## Several models (`src/ticker.ts`)

Goal: room for two models. Each `<Live2D>` used to run its own timer loop.

- **One loop for all models.** The live2d worklet runtime keeps one ticker in its `globalThis`. Each frame it updates and draws every registered model once, then publishes the picture to that model's views. The timer stops when nothing is shown, and pacing is shared (absolute frame times, see above).
- **Models are entries, `<Live2D>`s are views.** Entries are keyed by `Live2DModel.id` (set at load). Two views of one model share its frames instead of updating it twice per frame, which would play it at double speed. A view stops by setting its `running` flag; an entry goes when it has no views.
- **`maxFps` is per model.** The ticker runs at the display's rate, and a capped model skips ticks until its interval has passed (the fastest view's cap wins).
- **Frames are freed when no view shows them.**
  - **What went wrong:** frames used to be freed 4 frames after being replaced. A UI thread that fell further behind still held a freed picture: a stall, the app in the background, or a view stopping on the second-newest frame. The next redraw then failed with `Attempted to access a disposed object`, usually a JS-thread redraw after a re-render.
  - **The UI thread reports back:** each view sets its `shown` synchronizable to the frame it takes. A frame is freed once every view is past it, keeping one extra for a JS-thread redraw that just read it.
  - **Drawing waits for the slowest view:** it stays at most 4 frames ahead of the slowest view's UI thread. In the background the loop waits instead of piling up frames.
  - **A stopped view keeps its frames:** a paused or unmounted view still shows its last frame. The frames it could still show leave the entry unfreed, and the GC collects them later. This also fixes pausing one of two views of the same model.
- **Errors stay local.** A model that throws is dropped and logged, and the others keep going.
- **Stats** are per model (each timed from its own start), plus `models` and `loopWorkMs` for the whole loop.

Android emulator, debug build: Hiyori and Mao side by side in one canvas hold 60/60 fps, with about 3 ms of work each and 6 ms for the loop. Real-device numbers still to measure.

### Touch with several models (`useLive2DGestures`)

- One gesture for the canvas. Per-model gestures combined with `Gesture.Simultaneous` don't work: the inner taps aren't simultaneous with each other, so the first model's tap takes every touch.
- A tap hit-tests targets from the topmost (last listed) down; the first model hit reacts.
- A drag makes every model look at the finger, relative to its own placement.
- A long press (350 ms, `Gesture.Pan().activateAfterLongPress`) on a model's hit area picks it up if it has `onMove`; moves report its new top-left, keeping the grab offset. Taps are limited to 300 ms, so a long press isn't also a tap.
- Targets are read from a ref at touch time, so the gesture is built once.

## Likely fixes, in order of effort

1. Fewer JS allocations: reuse point arrays and send only drawables that changed (dynamic flags).
2. Mask cost: group drawables that share the same mask set into one layer, or render masks once into an offscreen surface per frame (as Cubism's own renderer does with its mask texture).
3. **v2 data path** ([data-path.md](../data-path.md)): draw directly on the `SkCanvas` in C++, linking against react-native-skia's Skia. This removes the JS hop for vertex data, but ties the build to Skia versions.

## Also

- Offscreen rendering for Cubism 5.3 models (`csmGetOffscreen*`), if newer models need it.
- Profile iOS on a real device too, not only the simulator.
