# Data path: C++ → Skia

Do it in two phases.

## v1 — JSI ArrayBuffers + worklet drawing

- C++ writes vertex data into shared JSI `ArrayBuffer`s (zero copy).
- A worklet builds Skia `Vertices` and draws them.
- No linking against Skia → simple build.
- Fine for typical models (~100–300 drawables).

## v2 — draw directly in C++ (done on Android and iOS, see [milestone 5](./plan/milestone-05.md#c-drawing-cppskiadrawercpp))

- Unwrap the `JsiSkCanvas` host object in C++ and draw straight onto the `SkCanvas`.
- Requires linking against the Skia binaries shipped by `@shopify/react-native-skia`.
- Faster, but tighter coupling to Skia versions.
