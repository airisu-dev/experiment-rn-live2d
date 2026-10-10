# Roadmap

1. **Static draw** — Hiyori (SDK sample) rendered, no masks, no motions.
2. **Masks** — clipping + inverted masks via `saveLayer`.
3. **Motions & physics** — idle motion, physics, eye blink, breath.
4. **Interaction** — `focus`, `hitTest`, `autoInteract`, expressions.
5. **Perf** — profile; move to v2 data path if needed ([data-path.md](./data-path.md)).

## Scaffolding (next step)
- `create-react-native-library` C++ template
- CMake (Android) / podspec (iOS) wiring for Cubism Core + Framework
- v1 JSI + Skia renderer
