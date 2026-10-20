# rn-live2d — design docs

A React Native library that renders Live2D Cubism models **natively** on Android and iOS (no WebView), drawn with **react-native-skia**, with an API as easy as `pixi-live2d-display`.

| Doc | Contents |
| --- | --- |
| [architecture.md](./architecture.md) | Layers, per-frame flow, Skia drawing mapping |
| [data-path.md](./data-path.md) | How vertex data gets from C++ to Skia (v1 vs v2) |
| [api.md](./api.md) | Public, pixi-live2d-style API |
| [gotchas.md](./gotchas.md) | Licensing, assets, alpha, safety, coordinates |
| [roadmap.md](./roadmap.md) | Milestones |
| [plan/](./plan/) | Per-milestone plans ([1](./plan/milestone-01.md), [2](./plan/milestone-02.md), [3](./plan/milestone-03.md), [4](./plan/milestone-04.md), [5](./plan/milestone-05.md), [6](./plan/milestone-06.md)) |

## Core idea

Use **Cubism Core + the Cubism Native Framework (C++) only for model logic**. Skip Live2D's own OpenGL/Metal renderer and draw each drawable with Skia's `drawVertices`. That gives one shared C++ codebase for both platforms, and Skia handles the GPU backend (Metal on iOS, GL/Vulkan on Android).
