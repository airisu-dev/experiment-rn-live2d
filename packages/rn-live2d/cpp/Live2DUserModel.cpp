#include "Live2DUserModel.hpp"
#include <cstdlib>
#include <iterator>
#include <stdexcept>
#include "CubismDefaultParameterId.hpp"
#include "Effect/CubismBreath.hpp"
#include "Effect/CubismEyeBlink.hpp"
#include "Id/CubismIdManager.hpp"
#include "Motion/CubismBreathUpdater.hpp"
#include "Effect/CubismLook.hpp"
#include "Motion/CubismExpressionUpdater.hpp"
#include "Motion/CubismEyeBlinkUpdater.hpp"
#include "Motion/CubismLookUpdater.hpp"
#include "Motion/CubismMotion.hpp"
#include "Motion/CubismPhysicsUpdater.hpp"
#include "Motion/CubismPoseUpdater.hpp"
#include "Utils/CubismJson.hpp"

namespace margelo::nitro::rnlive2d {

using namespace Live2D::Cubism::Framework;

namespace {

const csmByte* bytesOf(const std::string& s) {
    return reinterpret_cast<const csmByte*>(s.data());
}

// The Framework's loaders don't check for parse errors and crash on invalid
// JSON, so parse it once up front and throw instead.
void requireValidJson(const std::string& json, const std::string& what) {
    Utils::CubismJson* parsed = Utils::CubismJson::Create(bytesOf(json), static_cast<csmSizeInt>(json.size()));
    if (!parsed) throw std::runtime_error("Live2D: invalid " + what);
    Utils::CubismJson::Delete(parsed);
}

CubismIdHandle idOf(const csmChar* name) {
    return CubismFramework::GetIdManager()->GetId(name);
}

// Applies setParameter values every update, after look and breath (so they
// can be overridden) and before physics (so hair and clothes follow).
class HeldParameterUpdater : public ICubismUpdater {
    public:
        explicit HeldParameterUpdater(const std::map<CubismIdHandle, float>& values)
            : ICubismUpdater(CubismUpdateOrder_Breath + 50), _values(values) {}

        void OnLateUpdate(CubismModel* model, csmFloat32) override {
            for (const auto& [id, value] : _values) {
                model->SetParameterValue(id, value);
            }
        }

    private:
        const std::map<CubismIdHandle, float>& _values;
};

} // namespace

Live2DUserModel::Live2DUserModel(const uint8_t* moc, size_t mocSize, const std::string& settingsJson) {
    if (moc == nullptr || mocSize == 0) {
        throw std::runtime_error("Live2D: moc is empty");
    }
    LoadModel(moc, static_cast<csmSizeInt>(mocSize), true);
    if (_model == nullptr) {
        throw std::runtime_error("Live2D: moc is invalid, corrupted or newer than this Cubism Core");
    }

    requireValidJson(settingsJson, "model3.json");
    _setting = CSM_NEW CubismModelSettingJson(bytesOf(settingsJson), static_cast<csmSizeInt>(settingsJson.size()));

    for (csmInt32 i = 0; i < _setting->GetEyeBlinkParameterCount(); ++i) {
        _eyeBlinkIds.PushBack(_setting->GetEyeBlinkParameterId(i));
    }
    for (csmInt32 i = 0; i < _setting->GetLipSyncParameterCount(); ++i) {
        _lipSyncIds.PushBack(_setting->GetLipSyncParameterId(i));
    }

    if (_eyeBlinkIds.GetSize() > 0) {
        _eyeBlink = CubismEyeBlink::Create(_setting);
        _updateScheduler.AddUpdatableList(CSM_NEW CubismEyeBlinkUpdater(_motionUpdated, *_eyeBlink));
    }

    // Same breathing as the SDK samples.
    _breath = CubismBreath::Create();
    csmVector<CubismBreath::BreathParameterData> breath;
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamAngleX), 0.0f, 15.0f, 6.5345f, 0.5f));
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamAngleY), 0.0f, 8.0f, 3.5345f, 0.5f));
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamAngleZ), 0.0f, 10.0f, 5.5345f, 0.5f));
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamBodyAngleX), 0.0f, 4.0f, 15.5345f, 0.5f));
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamBreath), 0.5f, 0.5f, 3.2345f, 0.5f));
    _breath->SetParameters(breath);
    _updateScheduler.AddUpdatableList(CSM_NEW CubismBreathUpdater(*_breath));

    _updateScheduler.AddUpdatableList(CSM_NEW CubismExpressionUpdater(*_expressionManager));

    // Same look-at as the SDK samples, driven by focus().
    _look = CubismLook::Create();
    csmVector<CubismLook::LookParameterData> look;
    look.PushBack(CubismLook::LookParameterData(idOf(DefaultParameterId::ParamAngleX), 30.0f));
    look.PushBack(CubismLook::LookParameterData(idOf(DefaultParameterId::ParamAngleY), 0.0f, 30.0f));
    look.PushBack(CubismLook::LookParameterData(idOf(DefaultParameterId::ParamAngleZ), 0.0f, 0.0f, -30.0f));
    look.PushBack(CubismLook::LookParameterData(idOf(DefaultParameterId::ParamBodyAngleX), 10.0f));
    look.PushBack(CubismLook::LookParameterData(idOf(DefaultParameterId::ParamEyeBallX), 1.0f));
    look.PushBack(CubismLook::LookParameterData(idOf(DefaultParameterId::ParamEyeBallY), 0.0f, 1.0f));
    _look->SetParameters(look);
    _updateScheduler.AddUpdatableList(CSM_NEW CubismLookUpdater(*_look, *_dragManager));

    _updateScheduler.AddUpdatableList(CSM_NEW HeldParameterUpdater(_heldParameters));

    _updateScheduler.SortUpdatableList();
    _model->SaveParameters();
}

Live2DUserModel::~Live2DUserModel() {
    // Stop motions before deleting them: the motion manager still points at them.
    if (_motionManager) _motionManager->StopAllMotions();
    for (auto& [_, motion] : _motions) {
        ACubismMotion::Delete(motion);
    }
    if (_expressionManager) _expressionManager->StopAllMotions();
    for (auto& [_, expression] : _expressions) {
        ACubismMotion::Delete(expression);
    }
    CSM_DELETE(_setting);
}

void Live2DUserModel::loadPhysics(const std::string& json) {
    if (_physics) throw std::runtime_error("Live2D: physics already loaded");
    requireValidJson(json, "physics3.json");
    LoadPhysics(bytesOf(json), static_cast<csmSizeInt>(json.size()));
    if (!_physics) throw std::runtime_error("Live2D: invalid physics3.json");
    _updateScheduler.AddUpdatableList(CSM_NEW CubismPhysicsUpdater(*_physics));
    _updateScheduler.SortUpdatableList();
}

void Live2DUserModel::loadPose(const std::string& json) {
    if (_pose) throw std::runtime_error("Live2D: pose already loaded");
    requireValidJson(json, "pose3.json");
    LoadPose(bytesOf(json), static_cast<csmSizeInt>(json.size()));
    if (!_pose) throw std::runtime_error("Live2D: invalid pose3.json");
    _updateScheduler.AddUpdatableList(CSM_NEW CubismPoseUpdater(*_pose));
    _updateScheduler.SortUpdatableList();
}

void Live2DUserModel::loadMotion(const std::string& group, int index, const std::string& json) {
    const std::string key = motionKey(group, index);
    requireValidJson(json, "motion3.json for " + key);
    auto* motion = static_cast<CubismMotion*>(LoadMotion(
        bytesOf(json), static_cast<csmSizeInt>(json.size()), key.c_str(),
        nullptr, nullptr, _setting, group.c_str(), index));
    if (!motion) throw std::runtime_error("Live2D: invalid motion3.json for " + key);
    motion->SetEffectIds(_eyeBlinkIds, _lipSyncIds);

    auto it = _motions.find(key);
    if (it != _motions.end()) {
        _motionManager->StopAllMotions();
        ACubismMotion::Delete(it->second);
    }
    _motions[key] = motion;
}

bool Live2DUserModel::startMotion(const std::string& group, int index, Priority priority) {
    auto it = _motions.find(motionKey(group, index));
    if (it == _motions.end()) return false;

    if (priority == PriorityForce) {
        _motionManager->SetReservePriority(priority);
    } else if (!_motionManager->ReserveMotion(priority)) {
        return false;
    }
    // autoDelete = false: the motion is reused, and freed in the destructor.
    _motionManager->StartMotionPriority(it->second, false, priority);
    return true;
}

bool Live2DUserModel::startRandomMotion(const std::string& group, Priority priority) {
    int count = 0;
    while (_motions.count(motionKey(group, count))) ++count;
    if (count == 0) return false;
    return startMotion(group, std::rand() % count, priority);
}

void Live2DUserModel::loadExpression(const std::string& name, const std::string& json) {
    requireValidJson(json, "exp3.json for " + name);
    ACubismMotion* expression = LoadExpression(bytesOf(json), static_cast<csmSizeInt>(json.size()), name.c_str());
    if (!expression) throw std::runtime_error("Live2D: invalid exp3.json for " + name);

    auto it = _expressions.find(name);
    if (it != _expressions.end()) {
        _expressionManager->StopAllMotions();
        ACubismMotion::Delete(it->second);
    }
    _expressions[name] = expression;
}

bool Live2DUserModel::setExpression(const std::string& name) {
    auto it = _expressions.find(name);
    if (it == _expressions.end()) return false;
    // autoDelete = false: the expression is reused, and freed in the destructor.
    _expressionManager->StartMotion(it->second, false);
    return true;
}

bool Live2DUserModel::setRandomExpression() {
    if (_expressions.empty()) return false;
    auto it = _expressions.begin();
    std::advance(it, std::rand() % _expressions.size());
    return setExpression(it->first);
}

void Live2DUserModel::clearExpression() {
    _expressionManager->StopAllMotions();
}

void Live2DUserModel::setParameter(const std::string& id, float value) {
    _heldParameters[idOf(id.c_str())] = value;
}

void Live2DUserModel::clearParameter(const std::string& id) {
    _heldParameters.erase(idOf(id.c_str()));
}

void Live2DUserModel::focus(float x, float y) {
    SetDragging(x, y);
}

std::vector<std::string> Live2DUserModel::hitTest(float x, float y) {
    std::vector<std::string> hits;
    // Like the SDK sample: a fading-in or transparent model can't be hit.
    if (_model->GetModelOpacity() < 1) return hits;
    for (csmInt32 i = 0; i < _setting->GetHitAreasCount(); ++i) {
        if (IsHit(_setting->GetHitAreaId(i), x, y)) {
            hits.emplace_back(_setting->GetHitAreaName(i));
        }
    }
    return hits;
}

void Live2DUserModel::update(float deltaSeconds) {
    // Same order as the SDK sample's LAppModel::Update.
    _motionUpdated = false;
    _model->LoadParameters();
    if (_motionManager->IsFinished()) {
        startRandomMotion("Idle", PriorityIdle);
    } else {
        _motionUpdated = _motionManager->UpdateMotion(_model, deltaSeconds);
    }
    _model->SaveParameters();

    // Eye blink (unless a motion moved the eyes), expression, look, breath,
    // held parameters, physics, pose.
    _updateScheduler.OnLateUpdate(_model, deltaSeconds);
    _model->Update();
}

std::string Live2DUserModel::motionKey(const std::string& group, int index) {
    return group + "_" + std::to_string(index);
}

} // namespace margelo::nitro::rnlive2d
