#include "HybridLive2DModel.hpp"
#include <algorithm>
#include <numeric>
#include "CubismSetup.hpp"
#include "CubismCompat.hpp"

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
    std::lock_guard lock(_mutex);
    return csmGetDrawableCount(_userModel->model()->GetModel());
}

std::vector<DrawableData> HybridLive2DModel::getDrawables() {
    std::lock_guard lock(_mutex);
    const csmModel* model = _userModel->model()->GetModel();
    const int count = csmGetDrawableCount(model);
    const int* renderOrders = cubism::renderOrders(model);
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
    std::lock_guard lock(_mutex);
    _userModel->loadPhysics(json);
}

void HybridLive2DModel::loadPose(const std::string& json) {
    std::lock_guard lock(_mutex);
    _userModel->loadPose(json);
}

void HybridLive2DModel::loadMotion(const std::string& group, double index, const std::string& json) {
    std::lock_guard lock(_mutex);
    _userModel->loadMotion(group, static_cast<int>(index), json);
}

bool HybridLive2DModel::startMotion(const std::string& group, std::optional<double> index, std::optional<MotionPriority> priority) {
    std::lock_guard lock(_mutex);
    if (!index) return _userModel->startRandomMotion(group, toPriority(priority));
    return _userModel->startMotion(group, static_cast<int>(*index), toPriority(priority));
}

void HybridLive2DModel::loadExpression(const std::string& name, const std::string& json) {
    std::lock_guard lock(_mutex);
    _userModel->loadExpression(name, json);
}

bool HybridLive2DModel::setExpression(const std::optional<std::string>& name) {
    std::lock_guard lock(_mutex);
    return name ? _userModel->setExpression(*name) : _userModel->setRandomExpression();
}

void HybridLive2DModel::clearExpression() {
    std::lock_guard lock(_mutex);
    _userModel->clearExpression();
}

void HybridLive2DModel::setParameter(const std::string& id, double value) {
    std::lock_guard lock(_mutex);
    _userModel->setParameter(id, static_cast<float>(value));
}

void HybridLive2DModel::clearParameter(const std::string& id) {
    std::lock_guard lock(_mutex);
    _userModel->clearParameter(id);
}

void HybridLive2DModel::focus(double x, double y) {
    std::lock_guard lock(_mutex);
    _userModel->focus(static_cast<float>(std::clamp(x, -1.0, 1.0)), static_cast<float>(std::clamp(y, -1.0, 1.0)));
}

std::vector<std::string> HybridLive2DModel::hitTest(double x, double y) {
    std::lock_guard lock(_mutex);
    return _userModel->hitTest(static_cast<float>(x), static_cast<float>(y));
}

void HybridLive2DModel::update(double deltaSeconds) {
    std::lock_guard lock(_mutex);
    _userModel->update(static_cast<float>(deltaSeconds));
}

void HybridLive2DModel::loadHybridMethods() {
    HybridLive2DModelSpec::loadHybridMethods();
#if RN_LIVE2D_SKIA
    registerHybrids(this, [](Prototype& prototype) {
        prototype.registerRawHybridMethod("setTextures", 2, &HybridLive2DModel::setTexturesRaw);
        prototype.registerRawHybridMethod("drawTo", 2, &HybridLive2DModel::drawToRaw);
    });
#endif
}

#if RN_LIVE2D_SKIA
jsi::Value HybridLive2DModel::setTexturesRaw(jsi::Runtime& runtime, const jsi::Value&, const jsi::Value* args, size_t) {
    std::lock_guard lock(_mutex);
    _drawer.setTextures(runtime, args[0], args[1]);
    return jsi::Value::undefined();
}

jsi::Value HybridLive2DModel::drawToRaw(jsi::Runtime& runtime, const jsi::Value&, const jsi::Value* args, size_t) {
    std::lock_guard lock(_mutex);
    const CanvasInfo info{_originX, _originY, _pixelsPerUnit};
    return _drawer.draw(runtime, args[0], args[1].isBool() && args[1].getBool(),
                        _userModel->model()->GetModel(), info);
}
#endif

} // namespace margelo::nitro::rnlive2d
