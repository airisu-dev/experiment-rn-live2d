#pragma once
#include <vector>
#include "HybridRnLive2dSpec.hpp"

namespace margelo::nitro::rnlive2d {
class HybridRnLive2d : public HybridRnLive2dSpec {
    public:
        HybridRnLive2d() : HybridObject(TAG), HybridRnLive2dSpec() {}
       
        double sum(double a, double b) override;
    };
} // namespace margelo::nitro::rnlive2d
