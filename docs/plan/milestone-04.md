# Milestone 4 — Interaction

Goal: the [api.md](../api.md) methods and touch interaction work.

## Model methods ✅

All in `Live2DUserModel`, like the SDK sample's `LAppModel`:

- `setParameter(id, value)`: held values are applied every update by an updater ordered after look and breath and before physics, so they override motions and hair follows.
- `expression(name?)`: `exp3.json` files are loaded with `LoadExpression` and played through the expression manager and `CubismExpressionUpdater`.
- `motion(group, index?, priority?)`: random without an index. Priorities work like the SDK sample.
- `focus(x, y)`: `CubismLook` and `CubismLookUpdater` with the sample's parameters, driven by the `CubismTargetPoint` drag manager (eased).
- `hitTest(x, y)`: `IsHit` (vertex bounds) for each `HitAreas` entry of `model3.json`.

Threading: the model updates on the `live2d` worklet runtime, and these methods are called from the JS thread. `HybridLive2DModel` locks a mutex in every method.

## Coordinates ✅

Model methods take model pixels (the `picture` space). `loadModel.ts` converts them to model units with origin and pixels per unit for `hitTest`, and to -1..1 around the canvas center for `focus`. `useLive2DGesture` maps canvas points to model pixels with the `x`, `y` and `scale` it's given.

## Touch ✅

`useLive2DGesture(model, { x, y, scale })` returns a `react-native-gesture-handler` gesture for a `<GestureDetector>` around the `<Canvas>`. It can't be an `autoInteract` prop, because `<Live2D>` is a Skia node and gestures need a native view.

- Pan: the model follows the finger from touch down, then looks ahead again on release.
- Tap: `hitTest` → a random `Tap<Area>` motion, or a random expression for `Head` without one (like the SDK sample). `onHit` can replace this.
- `model3.json` has no hit area → motion mapping, so the naming convention above stands in for one.

Checked on the Android emulator:
- Hiyori follows the finger, and tapping her body hits `Body`.
- Mao's head hits `Head` and switches expressions, and her body hits `Body`.

## Model loading — open

`model3.json` lists every other file, so add `useLive2DModel(require('…/model3.json'))` that resolves them automatically. Metro can't resolve the paths at runtime, so this needs either a small Babel/Metro transform or a generated asset map. Pick one here.

## Checks

The model follows a finger, tapping the head and body plays motions, and expressions switch. Android ✅, iOS pending.
