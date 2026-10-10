# Milestone 4 — Interaction

Goal: the [api.md](../api.md) methods and `autoInteract` work.

## Model methods

- `setParameter(id, value)`: write into `csmGetParameterValues`. Values are applied on the next `update`.
- `expression(name)`: load `exp3.json` with `CubismExpressionMotion` and play it through an expression manager.
- `motion(group, index?)`: already exists from milestone 3. Add priorities (idle / normal / force) like the SDK sample.
- `focus(x, y)`: `CubismTargetPoint` drives `ParamAngleX/Y`, `ParamBodyAngleX` and `ParamEyeBallX/Y` with easing.
- `hitTest(x, y)`: use `HitAreas` from `model3.json`. Test the point against each hit area drawable's vertex bounds, and return the hit area names.

## Coordinates

Convert canvas pixels → model units with the inverse of the `<Live2D>` transform: `x`, `y`, `scale`, then origin and pixels per unit.

## `autoInteract`

- Use `react-native-gesture-handler`: pan → `focus`, release → focus back to center, tap → `hitTest` → play the matching motion (e.g. `TapBody`).
- Read hit area → motion mappings from `model3.json` where present.

## Model loading

`model3.json` lists every other file, so add `useLive2DModel(require('…/model3.json'))` that resolves them automatically. Metro can't resolve the paths at runtime, so this needs either a small Babel/Metro transform or a generated asset map. Pick one here.

## Checks

The model follows a finger, tapping the head and body plays motions, and expressions switch.
