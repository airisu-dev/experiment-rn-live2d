# Public API (pixi-live2d style)

```tsx
const model = useLive2DModel(require('./hiyori/hiyori.model3.json'));

<Canvas style={{ flex: 1 }}>
  <Live2D model={model} x={0} y={100} scale={0.25} autoInteract />
</Canvas>
```

## Model methods

```ts
model.motion('TapBody');                 // play motion group
model.expression('smile');               // set expression
model.setParameter('ParamAngleX', 30);   // set parameter value
model.focus(x, y);                       // look-at
model.hitTest(x, y);                     // → ['Head']
```

## `<Live2D />` props

| Prop | Description |
| --- | --- |
| `model` | Model from `useLive2DModel` |
| `x`, `y` | Position on canvas |
| `scale` | Uniform scale |
| `autoInteract` | Auto focus on pointer, hit-area tap → motion |
