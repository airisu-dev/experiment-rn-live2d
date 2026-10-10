# Milestone 3 — Motions & physics

Goal: the model moves. Idle motion loops, with physics, eye blink and breath, at 60 fps on a mid-range phone.

## Native: bring in the Cubism Native Framework

- Compile `vendor/CubismSdkForNative/Framework/src` (from the same SDK download as the Core, so their versions always match) into `RnLive2d`, **without** any `Rendering/<backend>` folder. The Framework still includes the abstract `Rendering/CubismRenderer.hpp`, so check whether a small stub renderer is needed, or skip `CubismUserModel` and drive the modules directly.
- Modules to use: `CubismMotionManager` + `CubismMotion`, `CubismPhysics`, `CubismPose` (replaces milestone 2's JS pose), `CubismEyeBlink`, `CubismBreath`.
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
