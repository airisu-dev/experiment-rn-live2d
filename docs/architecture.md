# Architecture

## Layers

1. **C++ core (shared)**
   - Cubism Core (`.a` on iOS / `.so` on Android) — proprietary, supplied by the user (see [gotchas.md](./gotchas.md#licensing)).
   - Open-source **CubismNativeFramework**. Its motion, physics, expression, pose, eye-blink and lip-sync modules don't depend on a renderer, so they are used as-is. Its renderer is **not** used.
2. **JSI binding**
   - Expose a `Live2DModel` host object via **Nitro Modules** or a **C++ TurboModule**.
   - Must be callable from the UI/worklet runtime so updates can run inside `useFrameCallback`.
3. **Rendering** — react-native-skia `<Canvas>`.

## Per-frame flow

1. `model.update(dt)` in C++ (motions → expressions → eye blink / breath → physics → pose → `csmUpdateModel`).
2. Read each drawable's:
   - vertex positions, UVs, indices
   - opacity, render order (draw order)
   - blend mode, constant flags (double-sided, inverted mask)
   - mask list
   - multiply / screen colors
   - dynamic flags (visibility, vertex positions changed, etc.)
3. Draw with Skia, sorted by render order.

## Skia drawing mapping

| Cubism | Skia |
| --- | --- |
| Drawable mesh | `Vertices` (triangles) + image shader of its texture |
| Blend: Normal | `BlendMode.SrcOver` |
| Blend: Additive | `BlendMode.Plus` |
| Blend: Multiplicative | `BlendMode.Modulate` / `Multiply` |
| Clipping mask | `saveLayer` → draw drawable → draw mask(s) with `DstIn` (inverted: `DstOut`) → `restore` |
| Multiply / screen color | small `RuntimeEffect` (SkSL) shader |
| Opacity | paint alpha / color in shader |
