#pragma once
#if RN_LIVE2D_SKIA

#include <jsi/jsi.h>
#include <memory>
#include <vector>
#include "Live2DCubismCore.hpp"

namespace margelo::nitro::rnlive2d {

namespace jsi = facebook::jsi;

struct CanvasInfo {
    float originX;
    float originY;
    float pixelsPerUnit;
};

// Draws a model's drawables onto a react-native-skia canvas in C++, the same
// way src/drawer.ts does in JS, without building meshes through JSI.
// Not thread-safe: HybridLive2DModel serializes calls.
class SkiaDrawer {
    public:
        SkiaDrawer();
        ~SkiaDrawer();

        // shaders: SkShader[] (one per texture); sizes: [width0, height0, width1, ...].
        void setTextures(jsi::Runtime& runtime, const jsi::Value& shaders, const jsi::Value& sizes);

        // Draws the model's current state onto a JS SkCanvas. Returns
        // { meshesBuilt, layers, meshMs } when wantStats, else undefined.
        jsi::Value draw(jsi::Runtime& runtime, const jsi::Value& canvas, bool wantStats,
                        const Live2D::Cubism::Core::csmModel* model, const CanvasInfo& info);

    private:
        struct Impl;
        std::unique_ptr<Impl> _impl;
};

} // namespace margelo::nitro::rnlive2d

#endif // RN_LIVE2D_SKIA
