#include "HybridRnLive2d.hpp"
#include "HybridLive2DModel.hpp"

namespace margelo::nitro::rnlive2d {

std::shared_ptr<HybridLive2DModelSpec> HybridRnLive2d::loadModel(const std::shared_ptr<ArrayBuffer>& moc, const std::string& settingsJson) {
    return std::make_shared<HybridLive2DModel>(moc->data(), moc->size(), settingsJson);
}

} // namespace margelo::nitro::rnlive2d
