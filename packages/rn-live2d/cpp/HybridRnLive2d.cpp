#include "HybridRnLive2d.hpp"
#include "HybridLive2DModel.hpp"

namespace margelo::nitro::rnlive2d {

std::shared_ptr<HybridLive2DModelSpec> HybridRnLive2d::loadModel(const std::shared_ptr<ArrayBuffer>& moc) {
    return std::make_shared<HybridLive2DModel>(moc->data(), moc->size());
}

} // namespace margelo::nitro::rnlive2d
