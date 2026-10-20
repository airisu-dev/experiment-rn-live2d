#if RN_LIVE2D_SKIA

#include "SkiaDrawer.hpp"
#include "CubismCompat.hpp"
#include <algorithm>
#include <chrono>
#include <cstring>
#include <numeric>
#include "JsiSkCanvas.h"
#include "JsiSkShader.h"
#include "include/core/SkCanvas.h"
#include "include/core/SkPaint.h"
#include "include/core/SkShader.h"
#include "include/core/SkVertices.h"

namespace margelo::nitro::rnlive2d {

using namespace Live2D::Cubism::Core;

namespace {

// The wrapper behind a react-native-skia JS object. jsi's hasNativeState<T>
// uses dynamic_cast, which can't be relied on across shared libraries, so check
// for any native state and cast: only rn-live2d's own JS passes these in.
template <typename T>
std::shared_ptr<T> unwrap(jsi::Runtime& runtime, const jsi::Value& value, const char* what) {
    if (!value.isObject()) throw jsi::JSError(runtime, std::string("Live2D: expected ") + what);
    jsi::Object object = value.getObject(runtime);
    if (!object.hasNativeState(runtime)) throw jsi::JSError(runtime, std::string("Live2D: expected ") + what);
    return std::static_pointer_cast<T>(object.getNativeState(runtime));
}

SkBlendMode blendModeOf(csmFlags constantFlags) {
    if (constantFlags & csmBlendAdditive) return SkBlendMode::kPlus;
    if (constantFlags & csmBlendMultiplicative) return SkBlendMode::kMultiply;
    return SkBlendMode::kSrcOver;
}

double millisecondsSince(std::chrono::steady_clock::time_point start) {
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
}

struct Mesh {
    sk_sp<SkVertices> vertices;
    // Model-space positions the mesh was built from, to detect changes.
    std::vector<csmVector2> positions;
    // Texture coordinates in pixels, built once.
    std::vector<SkPoint> texCoords;
};

} // namespace

struct SkiaDrawer::Impl {
    std::vector<sk_sp<SkShader>> shaders;
    std::vector<SkISize> textureSizes;
    std::vector<Mesh> meshes;
    std::vector<SkPoint> points; // scratch
    std::vector<int> order;      // scratch
    SkPaint paint;
    SkPaint layerPaint;
    int meshesBuilt = 0;
    double meshMs = 0;

    // Returns the drawable's mesh, rebuilt if its vertices moved; null if it has none.
    const SkVertices* meshOf(const csmModel* model, int i, const CanvasInfo& info) {
        const int vertexCount = csmGetDrawableVertexCounts(model)[i];
        const int indexCount = csmGetDrawableIndexCounts(model)[i];
        const int texture = csmGetDrawableTextureIndices(model)[i];
        if (vertexCount == 0 || indexCount == 0 || texture < 0 ||
            texture >= static_cast<int>(textureSizes.size())) {
            return nullptr;
        }
        Mesh& mesh = meshes[i];
        const csmVector2* positions = csmGetDrawableVertexPositions(model)[i];
        if (mesh.vertices && mesh.positions.size() == static_cast<size_t>(vertexCount) &&
            std::memcmp(mesh.positions.data(), positions, vertexCount * sizeof(csmVector2)) == 0) {
            return mesh.vertices.get();
        }

        const auto start = std::chrono::steady_clock::now();
        if (mesh.texCoords.size() != static_cast<size_t>(vertexCount)) {
            const csmVector2* uvs = csmGetDrawableVertexUvs(model)[i];
            const SkISize size = textureSizes[texture];
            mesh.texCoords.resize(vertexCount);
            for (int v = 0; v < vertexCount; ++v) {
                // Cubism UVs are v-up.
                mesh.texCoords[v] = {uvs[v].X * size.width(), (1 - uvs[v].Y) * size.height()};
            }
        }
        points.resize(vertexCount);
        for (int v = 0; v < vertexCount; ++v) {
            // Cubism is y-up in model units; Skia is y-down in pixels.
            points[v] = {info.originX + positions[v].X * info.pixelsPerUnit,
                         info.originY - positions[v].Y * info.pixelsPerUnit};
        }
        mesh.vertices = SkVertices::MakeCopy(SkVertices::kTriangles_VertexMode, vertexCount, points.data(),
                                             mesh.texCoords.data(), nullptr, indexCount,
                                             csmGetDrawableIndices(model)[i]);
        mesh.positions.assign(positions, positions + vertexCount);
        meshesBuilt++;
        meshMs += millisecondsSince(start);
        return mesh.vertices.get();
    }

    void drawMesh(SkCanvas* canvas, const SkVertices* vertices, int texture, SkPaint& p) {
        p.setShader(shaders[texture]);
        // No per-vertex colors, so the vertex blend mode is unused; the shader alone colors the mesh.
        canvas->drawVertices(vertices, SkBlendMode::kDst, p);
    }
};

SkiaDrawer::SkiaDrawer() : _impl(std::make_unique<Impl>()) {
    _impl->paint.setAntiAlias(true);
}

SkiaDrawer::~SkiaDrawer() = default;

void SkiaDrawer::setTextures(jsi::Runtime& runtime, const jsi::Value& shaders, const jsi::Value& sizes) {
    jsi::Array shaderArray = shaders.asObject(runtime).asArray(runtime);
    jsi::Array sizeArray = sizes.asObject(runtime).asArray(runtime);
    const size_t count = shaderArray.size(runtime);
    if (sizeArray.size(runtime) != count * 2) {
        throw jsi::JSError(runtime, "Live2D: expected a width and height per texture");
    }
    _impl->shaders.clear();
    _impl->textureSizes.clear();
    for (size_t i = 0; i < count; ++i) {
        auto shader = unwrap<RNSkia::JsiSkShader>(runtime, shaderArray.getValueAtIndex(runtime, i), "an SkShader");
        _impl->shaders.push_back(shader->getObject());
        _impl->textureSizes.push_back(SkISize::Make(
            static_cast<int>(sizeArray.getValueAtIndex(runtime, i * 2).asNumber()),
            static_cast<int>(sizeArray.getValueAtIndex(runtime, i * 2 + 1).asNumber())));
    }
    // Texture coordinates depend on the texture sizes.
    _impl->meshes.clear();
}

jsi::Value SkiaDrawer::draw(jsi::Runtime& runtime, const jsi::Value& canvasValue, bool wantStats,
                            const csmModel* model, const CanvasInfo& info) {
    if (_impl->shaders.empty()) throw jsi::JSError(runtime, "Live2D: call setTextures before draw");
    SkCanvas* canvas = unwrap<RNSkia::JsiSkCanvas>(runtime, canvasValue, "an SkCanvas")->getCanvas();
    Impl& d = *_impl;

    const int count = csmGetDrawableCount(model);
    if (d.meshes.size() != static_cast<size_t>(count)) d.meshes.resize(count);
    d.meshesBuilt = 0;
    d.meshMs = 0;
    int layers = 0;

    const int* renderOrders = cubism::renderOrders(model);
    const csmFlags* dynamicFlags = csmGetDrawableDynamicFlags(model);
    const csmFlags* constantFlags = csmGetDrawableConstantFlags(model);
    const int* textureIndices = csmGetDrawableTextureIndices(model);
    const float* opacities = csmGetDrawableOpacities(model);
    const int* maskCounts = csmGetDrawableMaskCounts(model);
    const int** masks = csmGetDrawableMasks(model);

    // Draw order: drawable indices sorted by render order.
    std::vector<int>& order = d.order;
    order.resize(count);
    std::iota(order.begin(), order.end(), 0);
    std::sort(order.begin(), order.end(), [&](int a, int b) { return renderOrders[a] < renderOrders[b]; });

    for (int i : order) {
        if (!(dynamicFlags[i] & csmIsVisible) || opacities[i] <= 0) continue;
        const SkVertices* vertices = d.meshOf(model, i, info);
        if (!vertices) continue;

        if (maskCounts[i] == 0) {
            d.paint.setAlphaf(opacities[i]);
            d.paint.setBlendMode(blendModeOf(constantFlags[i]));
            d.drawMesh(canvas, vertices, textureIndices[i], d.paint);
            continue;
        }

        // Draw into a layer, cut it with the union of the masks, then composite
        // the layer with the drawable's blend mode.
        const SkRect& bounds = vertices->bounds();
        d.layerPaint.setBlendMode(blendModeOf(constantFlags[i]));
        canvas->saveLayer(&bounds, &d.layerPaint);
        d.paint.setAlphaf(opacities[i]);
        d.paint.setBlendMode(SkBlendMode::kSrcOver);
        d.drawMesh(canvas, vertices, textureIndices[i], d.paint);

        d.layerPaint.setBlendMode((constantFlags[i] & csmIsInvertedMask) ? SkBlendMode::kDstOut : SkBlendMode::kDstIn);
        canvas->saveLayer(&bounds, &d.layerPaint);
        d.paint.setAlphaf(1);
        for (int m = 0; m < maskCounts[i]; ++m) {
            const int maskIndex = masks[i][m];
            const SkVertices* maskVertices = d.meshOf(model, maskIndex, info);
            if (maskVertices) d.drawMesh(canvas, maskVertices, textureIndices[maskIndex], d.paint);
        }
        canvas->restore();
        canvas->restore();
        layers += 2;
    }

    if (!wantStats) return jsi::Value::undefined();
    jsi::Object stats(runtime);
    stats.setProperty(runtime, "meshesBuilt", d.meshesBuilt);
    stats.setProperty(runtime, "layers", layers);
    stats.setProperty(runtime, "meshMs", d.meshMs);
    return stats;
}

} // namespace margelo::nitro::rnlive2d

#endif // RN_LIVE2D_SKIA
