# Public API (pixi-live2d style)

```tsx
// A require.context of the model's folder: the files its model3.json lists are
// loaded from it. Or pass the files yourself as a Live2DModelSource.
const model = useLive2DModel(require.context('./Mao', true, /\.(json|moc3|png)$/));
const gesture = useLive2DGesture(model, { x, y, scale });

<GestureDetector gesture={gesture}>
  <Canvas style={{ flex: 1 }}>
    <Live2D model={model} x={x} y={y} scale={scale} />
  </Canvas>
</GestureDetector>
```

The app needs a `GestureHandlerRootView` at its root.

## Model methods

Points are in model pixels: the model's canvas at its native size
(`model.width` x `model.height`), origin top-left.

```ts
model.motion('TapBody');                 // random motion of a group
model.motion('TapBody', 0, 'force');     // given motion and priority (idle / normal / force)
model.expression('exp_01');              // expression; random without a name
model.resetExpression();
model.setParameter('ParamAngleX', 30);   // held over motions until resetParameter
model.resetParameter('ParamAngleX');
model.focus(x, y);                       // look at a point, easing
model.resetFocus();
model.hitTest(x, y);                     // → ['Head']
```

Methods can be called from the JS thread while the model animates on its
background thread: the native model is locked.

## `<Live2D />` props

| Prop | Description |
| --- | --- |
| `model` | Model from `useLive2DModel` |
| `x`, `y` | Position on canvas |
| `scale` | Uniform scale |
| `paused` | Stops animating, keeps the current frame |

## `useLive2DGesture(model, options)`

Returns a gesture for a `<GestureDetector>` around the `<Canvas>`. Gestures need
a native view, so this can't be a prop of `<Live2D>`, which is drawn inside the canvas.

| Option | Description |
| --- | --- |
| `x`, `y`, `scale` | Same as the `<Live2D>` props, to map touches to the model |
| `focus` | Follow the finger while it's down (default `true`) |
| `onHit(hitAreas)` | Called on a tap on hit areas. Return `true` to skip the default: a random `Tap<Area>` motion (e.g. `TapBody`), or a random expression for `Head` without one, like the SDK sample |
