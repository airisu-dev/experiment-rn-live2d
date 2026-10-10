#include "HybridLive2DModel.hpp"
#include <algorithm>
#include <cstring>
#include <numeric>
#include <stdexcept>

namespace margelo::nitro::rnlive2d {

namespace {

AlignedBuffer allocateAligned(size_t alignment, size_t size) {
    void* p = nullptr;
    if (posix_memalign(&p, alignment, size) != 0) {
        throw std::runtime_error("Live2D: out of memory");
    }
    return AlignedBuffer(p);
}

template <typename T>
std::shared_ptr<ArrayBuffer> copyToArrayBuffer(const T* data, size_t count) {
    return ArrayBuffer::copy(reinterpret_cast<const uint8_t*>(data), count * sizeof(T));
}

} // namespace

HybridLive2DModel::HybridLive2DModel(const uint8_t* mocData, size_t mocSize)
    : HybridObject(TAG), HybridLive2DModelSpec() {
    if (mocData == nullptr || mocSize == 0) {
        throw std::runtime_error("Live2D: moc is empty");
    }
    const auto size = static_cast<unsigned int>(mocSize);

    _mocBuffer = allocateAligned(csmAlignofMoc, mocSize);
    std::memcpy(_mocBuffer.get(), mocData, mocSize);

    if (csmGetMocVersion(_mocBuffer.get(), size) > csmGetLatestMocVersion()) {
        throw std::runtime_error("Live2D: moc version is newer than this Cubism Core");
    }
    if (!csmHasMocConsistency(_mocBuffer.get(), size)) {
        throw std::runtime_error("Live2D: moc is invalid or corrupted");
    }
    csmMoc* moc = csmReviveMocInPlace(_mocBuffer.get(), size);
    if (moc == nullptr) {
        throw std::runtime_error("Live2D: failed to revive moc");
    }

    const unsigned int modelSize = csmGetSizeofModel(moc);
    _modelBuffer = allocateAligned(csmAlignofModel, modelSize);
    _model = csmInitializeModelInPlace(moc, _modelBuffer.get(), modelSize);
    if (_model == nullptr) {
        throw std::runtime_error("Live2D: failed to initialize model");
    }

    // Compute vertex positions, opacities and render orders for the default parameters.
    csmUpdateModel(_model);
    csmReadCanvasInfo(_model, &_canvasSize, &_canvasOrigin, &_pixelsPerUnit);
}

std::vector<DrawableData> HybridLive2DModel::getDrawables() {
    const int count = csmGetDrawableCount(_model);
    const int* renderOrders = csmGetRenderOrders(_model);
    const csmFlags* dynamicFlags = csmGetDrawableDynamicFlags(_model);
    const csmFlags* constantFlags = csmGetDrawableConstantFlags(_model);
    const int* textureIndices = csmGetDrawableTextureIndices(_model);
    const float* opacities = csmGetDrawableOpacities(_model);
    const int* vertexCounts = csmGetDrawableVertexCounts(_model);
    const csmVector2** positions = csmGetDrawableVertexPositions(_model);
    const csmVector2** uvs = csmGetDrawableVertexUvs(_model);
    const int* indexCounts = csmGetDrawableIndexCounts(_model);
    const unsigned short** indices = csmGetDrawableIndices(_model);

    std::vector<int> order(count);
    std::iota(order.begin(), order.end(), 0);
    std::sort(order.begin(), order.end(),
              [&](int a, int b) { return renderOrders[a] < renderOrders[b]; });

    std::vector<DrawableData> result;
    result.reserve(count);
    for (int i : order) {
        if (!(dynamicFlags[i] & csmIsVisible) || opacities[i] <= 0.0f || indexCounts[i] == 0) {
            continue;
        }
        result.emplace_back(textureIndices[i],
                            opacities[i],
                            constantFlags[i],
                            copyToArrayBuffer(positions[i], vertexCounts[i]),
                            copyToArrayBuffer(uvs[i], vertexCounts[i]),
                            copyToArrayBuffer(indices[i], indexCounts[i]));
    }
    return result;
}

} // namespace margelo::nitro::rnlive2d
