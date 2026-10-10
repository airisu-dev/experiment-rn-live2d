#pragma once
#include "HybridRnLive2dSpec.hpp"

namespace margelo::nitro::rnlive2d {
class HybridRnLive2d : public HybridRnLive2dSpec {
    public:
        HybridRnLive2d() : HybridObject(TAG), HybridRnLive2dSpec() {}

        std::shared_ptr<HybridLive2DModelSpec> loadModel(const std::shared_ptr<ArrayBuffer>& moc) override;
    };
} // namespace margelo::nitro::rnlive2d
