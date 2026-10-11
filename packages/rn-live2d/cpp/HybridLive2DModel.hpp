#pragma once
#include <memory>
#include <string>
#include <vector>
#include "HybridLive2DModelSpec.hpp"
#include "Live2DUserModel.hpp"

namespace margelo::nitro::rnlive2d {

class HybridLive2DModel : public HybridLive2DModelSpec {
    public:
        // Takes a .moc3 file's bytes and its model3.json. Throws std::runtime_error if they can't be loaded.
        HybridLive2DModel(const uint8_t* mocData, size_t mocSize, const std::string& settingsJson);

        double getCanvasWidth() override { return _canvasWidth; }
        double getCanvasHeight() override { return _canvasHeight; }
        double getOriginX() override { return _originX; }
        double getOriginY() override { return _originY; }
        double getPixelsPerUnit() override { return _pixelsPerUnit; }
        double getDrawableCount() override;

        std::vector<DrawableData> getDrawables() override;
        void loadPhysics(const std::string& json) override;
        void loadPose(const std::string& json) override;
        void loadMotion(const std::string& group, double index, const std::string& json) override;
        bool startMotion(const std::string& group, double index, std::optional<MotionPriority> priority) override;
        void update(double deltaSeconds) override;

    private:
        std::unique_ptr<Live2DUserModel> _userModel;
        float _canvasWidth = 0;
        float _canvasHeight = 0;
        float _originX = 0;
        float _originY = 0;
        float _pixelsPerUnit = 0;
    };

} // namespace margelo::nitro::rnlive2d
