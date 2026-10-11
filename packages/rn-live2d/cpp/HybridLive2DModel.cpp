#include "HybridLive2DModel.hpp"
#include <algorithm>
#include <numeric>
#include "CubismSetup.hpp"
#include "Live2DCubismCore.hpp"

namespace margelo::nitro::rnlive2d {

using namespace Live2D::Cubism::Core;

namespace {

template <typename T>
std::shared_ptr<ArrayBuffer> copyToArrayBuffer(const T* data, size_t count) {
    return ArrayBuffer::copy(reinterpret_cast<const uint8_t*>(data), count * sizeof(T));
}

Live2DUserModel::Priority toPriority(std::optional<MotionPriority> priority) {
    switch (priority.value_or(MotionPriority::NORMAL)) {
        case MotionPriority::IDLE: return Live2DUserModel::PriorityIdle;
        case MotionPriority::FORCE: return Live2DUserModel::PriorityForce;
        default: return Live2DUserModel::PriorityNormal;
    }
}

} // namespace

HybridLive2DModel::HybridLive2DModel(const uint8_t* mocData, size_t mocSize, const std::string& settingsJson)
    : HybridObject(TAG), HybridLive2DModelSpec() {
    // The Framework must be started before any of its objects are created.
    ensureCubismFramework();
    _userModel = std::make_unique<Live2DUserModel>(mocData, mocSize, settingsJson);

    csmVector2 size{}, origin{};
    csmReadCanvasInfo(_userModel->model()->GetModel(), &size, &origin, &_pixelsPerUnit);
    _canvasWidth = size.X;
    _canvasHeight = size.Y;
    _originX = origin.X;
    _originY = origin.Y;

    // Compute vertex positions, opacities and render orders for the default parameters.
    _userModel->update(0);
}

double HybridLive2DModel::getDrawableCount() {
    return csmGetDrawableCount(_userModel->model()->GetModel());
}

std::vector<DrawableData> HybridLive2DModel::getDrawables() {
    const csmModel* model = _userModel->model()->GetModel();
    const int count = csmGetDrawableCount(model);
    const int* renderOrders = csmGetRenderOrders(model);
    const csmFlags* dynamicFlags = csmGetDrawableDynamicFlags(model);
    const csmFlags* constantFlags = csmGetDrawableConstantFlags(model);
    const int* textureIndices = csmGetDrawableTextureIndices(model);
    const float* opacities = csmGetDrawableOpacities(model);
    const int* vertexCounts = csmGetDrawableVertexCounts(model);
    const csmVector2** positions = csmGetDrawableVertexPositions(model);
    const csmVector2** uvs = csmGetDrawableVertexUvs(model);
    const int* indexCounts = csmGetDrawableIndexCounts(model);
    const unsigned short** indices = csmGetDrawableIndices(model);
    const int* maskCounts = csmGetDrawableMaskCounts(model);
    const int** masks = csmGetDrawableMasks(model);

    std::vector<int> order(count);
    std::iota(order.begin(), order.end(), 0);
    std::sort(order.begin(), order.end(),
              [&](int a, int b) { return renderOrders[a] < renderOrders[b]; });

    std::vector<DrawableData> result;
    result.reserve(count);
    for (int i : order) {
        result.emplace_back(i,
                            (dynamicFlags[i] & csmIsVisible) != 0,
                            textureIndices[i],
                            opacities[i],
                            constantFlags[i],
                            std::vector<double>(masks[i], masks[i] + maskCounts[i]),
                            copyToArrayBuffer(positions[i], vertexCounts[i]),
                            copyToArrayBuffer(uvs[i], vertexCounts[i]),
                            copyToArrayBuffer(indices[i], indexCounts[i]));
    }
    return result;
}

void HybridLive2DModel::loadPhysics(const std::string& json) {
    _userModel->loadPhysics(json);
}

void HybridLive2DModel::loadPose(const std::string& json) {
    _userModel->loadPose(json);
}

void HybridLive2DModel::loadMotion(const std::string& group, double index, const std::string& json) {
    _userModel->loadMotion(group, static_cast<int>(index), json);
}

bool HybridLive2DModel::startMotion(const std::string& group, double index, std::optional<MotionPriority> priority) {
    return _userModel->startMotion(group, static_cast<int>(index), toPriority(priority));
}

void HybridLive2DModel::update(double deltaSeconds) {
    _userModel->update(static_cast<float>(deltaSeconds));
}

} // namespace margelo::nitro::rnlive2d
