# Roadmap

1. **Static draw** — Hiyori (SDK sample) rendered, no masks, no motions. Android ✅, iOS ✅ ([plan](./plan/milestone-01.md))
2. **Masks & pose** — clipping + inverted masks via `saveLayer`; initial pose. Android ✅, iOS to do ([plan](./plan/milestone-02.md))
3. **Motions & physics** — idle motion, physics, eye blink, breath. ([plan](./plan/milestone-03.md))
4. **Interaction** — `focus`, `hitTest`, `autoInteract`, expressions. ([plan](./plan/milestone-04.md))
5. **Perf** — profile; move to v2 data path if needed ([data-path.md](./data-path.md)). ([plan](./plan/milestone-05.md))

## Scaffolding ✅
- Nitro C++ module template
- CMake (Android) wiring for Cubism Core; Framework wiring comes in milestone 3
- v1 JSI + Skia renderer
