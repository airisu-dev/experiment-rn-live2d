# Milestone 2 — Masks & pose

Goal: the static model looks correct. Clipping masks work, and the pose shows one arm set instead of both. Still drawn once into an `SkPicture`.

## Pose

`pose3.json` lists groups of mutually exclusive parts (Hiyori: `PartArmA` / `PartArmB`). At rest, the first part in each group is visible and the rest are hidden; `Link` parts follow their parent.

- C++: add `setPartOpacity(id: string, value: number)` and `update()` (re-runs `csmUpdateModel`). Part ids come from `csmGetPartIds`, opacities from `csmGetPartOpacities`.
- JS: optional `pose` source in `useLive2DModel`. Read the JSON, apply the rest state, call `update()`, then build the picture.
- The pose fade (`FadeInTime`) only matters once motions run (milestone 3).

## Masks

- C++: return **all** drawables, not only visible ones, because mask drawables may be hidden themselves. Add to `DrawableData`: `visible`, `renderOrder`, and `masks: number[]` (from `csmGetDrawableMaskCounts` / `csmGetDrawableMasks`). `constantFlags` already carries `csmIsInvertedMask`.
- JS drawing for a masked drawable:
  1. `saveLayer()`: draw the drawable as today.
  2. `saveLayer(paint with BlendMode.DstIn)`, or `DstOut` if inverted: draw every mask mesh with `SrcOver` at full opacity, so the masks are combined as a union.
  3. `restore()` twice.
- Cache each drawable's `SkVertices` once, because masks reuse the same meshes many times.

## Checks

- Hiyori shows one arm set, and the clipped details (eyes, mouth, hair shadows) are clipped.
- Also try one other sample (e.g. Haru or Mao), since some use inverted masks.
- Watch for dark edges at mask boundaries (premultiplied alpha, see [gotchas.md](../gotchas.md#premultiplied-alpha)).
