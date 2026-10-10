# Milestone 5 — Performance

Goal: steady 60 fps (120 where supported) with one model on a mid-range arm64 phone, and room for two models.

## Measure first

- Profile on a real arm64 phone in a release build, not the emulator.
- Split the frame time into: C++ `update`, crossing JSI + building `SkPoint[]`, `MakeVertices`, and Skia draw (`saveLayer`s for masks are the likely GPU cost).
- Use the Android GPU profiler / Perfetto for the GPU side.

## Likely fixes, in order of effort

1. Fewer JS allocations: reuse point arrays and send only drawables that changed (dynamic flags).
2. Mask cost: group drawables that share the same mask set into one layer, or render masks once into an offscreen surface per frame (as Cubism's own renderer does with its mask texture).
3. **v2 data path** ([data-path.md](../data-path.md)): draw directly on the `SkCanvas` in C++, linking against react-native-skia's Skia. This removes the JS hop for vertex data, but ties the build to Skia versions.

## Also

- Offscreen rendering for Cubism 5.3 models (`csmGetOffscreen*`), if newer models need it.
- Revisit iOS once Android is solid: the podspec, Core `.a` and Framework wiring are left out until then.
