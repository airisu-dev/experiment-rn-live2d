#pragma once
#include <cstdlib>
#include <memory>
#include <vector>
#include "HybridLive2DModelSpec.hpp"
#include "Live2DCubismCore.h"

namespace margelo::nitro::rnlive2d {

struct FreeDeleter {
    void operator()(void* p) const { std::free(p); }
};
using AlignedBuffer = std::unique_ptr<void, FreeDeleter>;

class HybridLive2DModel : public HybridLive2DModelSpec {
    public:
        // Takes a .moc3 file's bytes. Throws std::runtime_error if it can't be loaded.
        HybridLive2DModel(const uint8_t* mocData, size_t mocSize);

        double getCanvasWidth() override { return _canvasSize.X; }
        double getCanvasHeight() override { return _canvasSize.Y; }
        double getOriginX() override { return _canvasOrigin.X; }
        double getOriginY() override { return _canvasOrigin.Y; }
        double getPixelsPerUnit() override { return _pixelsPerUnit; }
        double getDrawableCount() override { return csmGetDrawableCount(_model); }

        std::vector<DrawableData> getDrawables() override;
        void setPartOpacity(const std::string& id, double opacity) override;
        void setParameterValue(const std::string& id, double value) override;
        void update() override;

    private:
        // The model references the moc, so the moc buffer must outlive it.
        AlignedBuffer _mocBuffer;
        AlignedBuffer _modelBuffer;
        csmModel* _model = nullptr;
        csmVector2 _canvasSize{};
        csmVector2 _canvasOrigin{};
        float _pixelsPerUnit = 0;
    };

} // namespace margelo::nitro::rnlive2d
