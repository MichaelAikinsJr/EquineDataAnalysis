from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth import authenticate
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .tasks_classical import _available_classical_angle_specs

from .biomechanics_33 import KPT_ORDER
from .models import User
from .models import SessionAngleFrame
from .models import Horse, AnalysisSession


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "password"]
        extra_kwargs = {
            "password": {"write_only": True}
        }

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        email = validated_data.pop("email")
        user = User.objects.create_user(
            email=email,
            password=password,
            **validated_data
        )
        return user


class SecureTokenSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        authenticate_kwargs = {
            self.username_field: attrs[self.username_field],
            "password": attrs["password"],
        }
        user = authenticate(**authenticate_kwargs)

        if user is None:
            raise serializers.ValidationError("Invalid credentials")

        data = super().validate(attrs)
        data["user"] = {
            "id": user.id,
            "email": user.email,
        }
        return data


class HorseSerializer(serializers.ModelSerializer):
    session_count = serializers.SerializerMethodField()

    class Meta:
        model = Horse
        fields = [
            "id",
            "name",
            "breed",
            "created_at",
            "session_count",
        ]

    def get_session_count(self, obj):
        return obj.sessions.count()


class SessionListSerializer(serializers.ModelSerializer):
    horse_id = serializers.UUIDField(source="horse.id", read_only=True)
    horse_name = serializers.CharField(source="horse.name", read_only=True)

    class Meta:
        model = AnalysisSession
        fields = [
            "id",
            "horse_id",
            "horse_name",
            "gait",
            "notes",
            "original_filename",
            "status",
            "progress",
            "current_step",
            "quality_score",
            "symmetry_index",
            "tracking_mode",
            "manual_start_frame",
            "manual_keypoints_norm",
            "manual_keyframes_norm",
            "created_at",
            "updated_at",
        ]


from rest_framework import serializers
from .models import AnalysisSession


class SessionResultsSerializer(serializers.ModelSerializer):
    horse_id = serializers.UUIDField(source="horse.id", read_only=True)
    horse_name = serializers.CharField(source="horse.name", read_only=True)
    video = serializers.SerializerMethodField()
    annotated_video = serializers.SerializerMethodField()
    tracking_mode = serializers.CharField(read_only=True)
    selected_keypoints = serializers.SerializerMethodField()
    available_angle_series = serializers.SerializerMethodField()

    class Meta:
        model = AnalysisSession
        fields = [
            "id",
            "horse_id",
            "horse_name",
            "gait",
            "notes",
            "original_filename",
            "video",
            "annotated_video",
            "status",
            "progress",
            "current_step",
            "orientation",
            "visible_side",
            "fps",
            "total_frames",
            "quality_score",
            "symmetry_index",
            "narrative_report",
            "poll_rom_norm",
            "wither_rom_norm",
            "pelvis_rom_norm",
            "pelvis_roll_mean_abs_norm",
            "fore_protraction_asymmetry_deg",
            "hind_protraction_asymmetry_deg",
            "summary_metrics",
            "error_message",
            "created_at",
            "updated_at",
            "tracking_mode",
            "selected_keypoints",
            "available_angle_series",
        ]

    def get_video(self, obj):
        if obj.video:
            try:
                return obj.video.url
            except Exception:
                return None
        return None

    def get_annotated_video(self, obj):
        if obj.annotated_video:
            try:
                return obj.annotated_video.url
            except Exception:
                return None
        return None

    def get_selected_keypoints(self, obj):
        names = []

        raw_multi = getattr(obj, "manual_keyframes_norm", None)
        if isinstance(raw_multi, list) and raw_multi:
            seen = set()
            for frame_item in raw_multi:
                if not isinstance(frame_item, dict):
                    continue
                points = frame_item.get("selected_keypoints", [])
                if not isinstance(points, list):
                    continue
                for point_item in points:
                    if not isinstance(point_item, dict):
                        continue
                    name = point_item.get("name")
                    if isinstance(name, str):
                        clean = name.strip()
                        if clean and clean not in seen:
                            seen.add(clean)
                            names.append(clean)
            return names

        raw = obj.manual_keypoints_norm
        if not isinstance(raw, list):
            return []

        for item in raw:
            if isinstance(item, dict):
                name = item.get("name")
                if isinstance(name, str) and name.strip():
                    names.append(name.strip())
        return names

    def get_available_angle_series(self, obj):
        summary = obj.summary_metrics or {}
        if not isinstance(summary, dict):
            return []

        raw = summary.get("available_angle_series", [])
        if not isinstance(raw, list):
            return []

        clean = []
        for item in raw:
            if not isinstance(item, dict):
                continue

            key = item.get("key")
            label = item.get("label")
            triplet = item.get("triplet", [])

            if not isinstance(key, str) or not key.strip():
                continue
            if not isinstance(label, str) or not label.strip():
                continue
            if not isinstance(triplet, list):
                triplet = []

            clean.append({
                "key": key,
                "label": label,
                "triplet": [x for x in triplet if isinstance(x, str)],
            })

        return clean

class SessionAngleFrameSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionAngleFrame
        fields = [
            "frame_index",
            "timestamp_sec",
            "keypoints_norm",
            "bbox_xyxy_norm",
            "frame_quality_score",
            "orientation",
            "visible_side",
            "left_hip_angle_deg",
            "left_stifle_angle_deg",
            "left_hock_angle_deg",
            "left_hind_fetlock_angle_deg",
            "left_shoulder_angle_deg",
            "left_elbow_angle_deg",
            "left_knee_angle_deg",
            "left_fore_fetlock_angle_deg",
            "right_hip_angle_deg",
            "right_stifle_angle_deg",
            "right_hock_angle_deg",
            "right_hind_fetlock_angle_deg",
            "right_shoulder_angle_deg",
            "right_elbow_angle_deg",
            "right_knee_angle_deg",
            "right_fore_fetlock_angle_deg",
            "left_hind_protraction_signed_deg",
            "left_fore_protraction_signed_deg",
            "right_hind_protraction_signed_deg",
            "right_fore_protraction_signed_deg",
            "left_hind_protraction_deg",
            "left_fore_protraction_deg",
            "right_hind_protraction_deg",
            "right_fore_protraction_deg",
            "poll_y_norm",
            "wither_y_norm",
            "pelvis_mid_y_norm",
            "head_mid_y_norm",
            "left_pelvis_y_norm",
            "right_pelvis_y_norm",
            "pelvis_roll_diff_norm",
            "tail_base_y_norm",
            "metrics_json",
        ]


class HorseHistoryPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    fetlockForeRom = serializers.FloatField(allow_null=True)
    fetlockHindRom = serializers.FloatField(allow_null=True)
    protractionSI = serializers.FloatField(allow_null=True)
    pollStability = serializers.FloatField(allow_null=True)


class HorseSessionSerializer(serializers.ModelSerializer):
    horse_id = serializers.UUIDField(source="horse.id", read_only=True)
    horse_name = serializers.CharField(source="horse.name", read_only=True)
    duration = serializers.SerializerMethodField()
    video_url = serializers.FileField(source="video", read_only=True)
    annotated_video_url = serializers.FileField(source="annotated_video", read_only=True)

    class Meta:
        model = AnalysisSession
        fields = [
            "id",
            "horse_id",
            "horse_name",
            "gait",
            "notes",
            "original_filename",
            "video_url",
            "annotated_video_url",
            "status",
            "progress",
            "current_step",
            "error_message",
            "orientation",
            "visible_side",
            "fps",
            "total_frames",
            "quality_score",
            "symmetry_index",
            "narrative_report",
            "poll_rom_norm",
            "wither_rom_norm",
            "pelvis_rom_norm",
            "pelvis_roll_mean_abs_norm",
            "fore_protraction_asymmetry_deg",
            "hind_protraction_asymmetry_deg",
            "summary_metrics",
            "created_at",
            "updated_at",
            "duration",
        ]

    def get_duration(self, obj):
        if obj.total_frames and obj.fps and obj.fps > 0:
            return f"{obj.total_frames / obj.fps:.1f}s"
        return "—"


class HorseDetailSerializer(serializers.ModelSerializer):
    session_count = serializers.SerializerMethodField()

    class Meta:
        model = Horse
        fields = [
            "id",
            "name",
            "breed",
            "created_at",
            "session_count",
        ]

    def get_session_count(self, obj):
        return obj.sessions.count()


class HorseSessionListSerializer(serializers.ModelSerializer):
    quality_score = serializers.FloatField(read_only=True)
    duration = serializers.SerializerMethodField()

    class Meta:
        model = AnalysisSession
        fields = [
            "id",
            "gait",
            "status",
            "quality_score",
            "created_at",
            "duration",
            "total_frames",
            "fps",
        ]

    def get_duration(self, obj):
        if obj.total_frames and obj.fps and obj.fps > 0:
            seconds = obj.total_frames / obj.fps
            return f"{seconds:.1f}s"
        return "—"


class AnalysisSessionSerializer(serializers.ModelSerializer):
    horse_id = serializers.UUIDField(source="horse.id", read_only=True)
    horse_name = serializers.CharField(source="horse.name", read_only=True)

    class Meta:
        model = AnalysisSession
        fields = [
            "id",
            "horse_id",
            "horse_name",
            "gait",
            "notes",
            "original_filename",
            "status",
            "progress",
            "current_step",
            "error_message",
            "tracking_mode",
            "manual_start_frame",
            "manual_keypoints_norm",
            "fps",
            "total_frames",
            "orientation",
            "visible_side",
            "quality_score",
            "summary_metrics",
            "annotated_video",
        ]

class SelectedKeypointSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    point = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
    )
    original_index = serializers.IntegerField(required=False, allow_null=True)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Keypoint name cannot be empty.")
        return value

    def validate_point(self, value):
        if len(value) != 2:
            raise serializers.ValidationError("Each point must contain exactly 2 values.")
        x, y = value
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            raise serializers.ValidationError("Point values must be normalized between 0 and 1.")
        return [float(x), float(y)]
    
class ClassicalKeyframeSerializer(serializers.Serializer):
    frame_index = serializers.IntegerField(min_value=0)
    selected_keypoints = SelectedKeypointSerializer(many=True)

    def validate_selected_keypoints(self, value):
        if not value:
            raise serializers.ValidationError("At least one keypoint must be selected.")

        names = [item["name"] for item in value]
        if len(names) != len(set(names)):
            raise serializers.ValidationError("Duplicate keypoint names are not allowed.")

        return value
    
class ClassicalSetupResponseSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    horse_id = serializers.UUIDField(allow_null=True)
    horse_name = serializers.CharField(allow_null=True)
    gait = serializers.CharField(allow_blank=True, allow_null=True)
    tracking_mode = serializers.CharField()
    status = serializers.CharField()
    progress = serializers.IntegerField()
    current_step = serializers.CharField(allow_blank=True, allow_null=True)

    manual_start_frame = serializers.IntegerField(allow_null=True)
    manual_keypoints_norm = SelectedKeypointSerializer(many=True)
    manual_keyframes_norm = ClassicalKeyframeSerializer(many=True, required=False)

    fps = serializers.FloatField(allow_null=True)
    total_frames = serializers.IntegerField(allow_null=True)
    original_filename = serializers.CharField(allow_blank=True, allow_null=True)
    default_keypoints = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=True,
    )

class ClassicalTrackingInitSerializer(serializers.Serializer):
    start_frame = serializers.IntegerField(min_value=0, required=False)
    selected_keypoints = SelectedKeypointSerializer(many=True, required=False)

    keyframes = ClassicalKeyframeSerializer(many=True, required=False)

    def validate(self, attrs):
        has_new_shape = "keyframes" in attrs and attrs.get("keyframes") is not None
        has_old_shape = (
            "start_frame" in attrs and
            "selected_keypoints" in attrs and
            attrs.get("selected_keypoints") is not None
        )

        if has_new_shape and has_old_shape:
            raise serializers.ValidationError(
                "Use either {keyframes: [...]} or {start_frame, selected_keypoints}, not both."
            )

        if not has_new_shape and not has_old_shape:
            raise serializers.ValidationError(
                "Provide either keyframes or start_frame with selected_keypoints."
            )

        if has_new_shape:
            keyframes = attrs["keyframes"]
            if len(keyframes) < 2:
                raise serializers.ValidationError({
                    "keyframes": "At least two manual keyframes are required."
                })

            frame_indices = [item["frame_index"] for item in keyframes]
            if len(frame_indices) != len(set(frame_indices)):
                raise serializers.ValidationError({
                    "keyframes": "Duplicate frame indices are not allowed."
                })

            if frame_indices != sorted(frame_indices):
                raise serializers.ValidationError({
                    "keyframes": "Keyframes must be sorted by frame_index."
                })

        if has_old_shape:
            selected = attrs["selected_keypoints"]
            if not selected:
                raise serializers.ValidationError({
                    "selected_keypoints": "At least one keypoint must be selected."
                })

            names = [item["name"] for item in selected]
            if len(names) != len(set(names)):
                raise serializers.ValidationError({
                    "selected_keypoints": "Duplicate keypoint names are not allowed."
                })

        return attrs


class ClassicalSetupSerializer(serializers.Serializer):
    manual_start_frame = serializers.IntegerField(min_value=0, required=False)
    manual_keypoints_norm = SelectedKeypointSerializer(many=True, required=False)
    manual_keyframes_norm = ClassicalKeyframeSerializer(many=True, required=False)

    def validate(self, attrs):
        has_multi = "manual_keyframes_norm" in attrs and attrs.get("manual_keyframes_norm") is not None
        has_single = (
            "manual_start_frame" in attrs and
            "manual_keypoints_norm" in attrs and
            attrs.get("manual_keypoints_norm") is not None
        )

        if has_multi and has_single:
            raise serializers.ValidationError(
                "Use either manual_keyframes_norm or manual_start_frame with manual_keypoints_norm, not both."
            )

        if not has_multi and not has_single:
            raise serializers.ValidationError(
                "Provide either manual_keyframes_norm or manual_start_frame with manual_keypoints_norm."
            )

        if has_multi:
            keyframes = attrs["manual_keyframes_norm"]
            if len(keyframes) < 2:
                raise serializers.ValidationError({
                    "manual_keyframes_norm": "At least two manual keyframes are required."
                })

            frame_indices = [item["frame_index"] for item in keyframes]
            if len(frame_indices) != len(set(frame_indices)):
                raise serializers.ValidationError({
                    "manual_keyframes_norm": "Duplicate frame indices are not allowed."
                })

            if frame_indices != sorted(frame_indices):
                raise serializers.ValidationError({
                    "manual_keyframes_norm": "Keyframes must be sorted by frame_index."
                })

        if has_single:
            keypoints = attrs["manual_keypoints_norm"]
            if not keypoints:
                raise serializers.ValidationError({
                    "manual_keypoints_norm": "At least one keypoint must be selected."
                })

            names = [item["name"] for item in keypoints]
            if len(names) != len(set(names)):
                raise serializers.ValidationError({
                    "manual_keypoints_norm": "Duplicate keypoint names are not allowed."
                })

        return attrs





class AnalysisSessionUploadSerializer(serializers.ModelSerializer):
    tracking_mode = serializers.ChoiceField(choices=AnalysisSession.TRACKING_MODE_CHOICES)

    class Meta:
        model = AnalysisSession
        fields = ["video", "tracking_mode"]

    def create(self, validated_data):
        user = self.context["request"].user
        tracking_mode = validated_data.get("tracking_mode", "yolo26")

        if tracking_mode == "classical":
            init_status = "awaiting_setup"
            init_step = "Waiting for classical setup"
        else:
            init_status = "uploaded"
            init_step = "Upload complete"

        return AnalysisSession.objects.create(
            user=user,
            status=init_status,
            progress=0,
            current_step=init_step,
            manual_keypoints_norm=[],
            **validated_data,
        )



class SessionUploadSerializer(serializers.ModelSerializer):
    classical_submode = serializers.ChoiceField(
        choices=["markerless", "markers"],
        required=False,
        allow_null=True,
    )

    class Meta:
        model = AnalysisSession
        fields = [
            "id",
            "video",
            "horse_name",
            "gait",
            "notes",
            "tracking_mode",
            "classical_submode",
        ]

    def validate(self, attrs):
        tracking_mode = attrs.get("tracking_mode", "yolo26")
        classical_submode = attrs.get("classical_submode")

        if tracking_mode == "classical":
            if classical_submode not in {"markerless", "markers"}:
                raise serializers.ValidationError(
                    {"classical_submode": "Choose 'markerless' or 'markers' for classical tracking."}
                )
        else:
            attrs["classical_submode"] = None

        return attrs
    
class MarkerPointSerializer(serializers.Serializer):
    name = serializers.CharField()
    point = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
        required=False,
        allow_null=True,
    )
    visible = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        visible = attrs.get("visible", True)
        point = attrs.get("point", None)

        if visible and point is None:
            raise serializers.ValidationError("Visible markers must include a point.")
        if not visible:
            attrs["point"] = None
        return attrs


class MarkerKeyframeSerializer(serializers.Serializer):
    frame_index = serializers.IntegerField(min_value=0)
    selected_keypoints = MarkerPointSerializer(many=True)


class SaveMarkerSetupSerializer(serializers.Serializer):
    manual_keyframes = MarkerKeyframeSerializer(many=True)

    def validate_manual_keyframes(self, value):
        if len(value) < 2:
            raise serializers.ValidationError("At least two keyframes are required for marker tracking.")

        frame_indices = [item["frame_index"] for item in value]
        if len(frame_indices) != len(set(frame_indices)):
            raise serializers.ValidationError("Duplicate frame_index values are not allowed.")

        ordered = sorted(frame_indices)
        if ordered != frame_indices:
            raise serializers.ValidationError("manual_keyframes must be sorted by frame_index.")

        first_names = [kp["name"] for kp in value[0]["selected_keypoints"]]
        if len(first_names) != len(set(first_names)):
            raise serializers.ValidationError("Duplicate marker names are not allowed.")

        for item in value[1:]:
            names = [kp["name"] for kp in item["selected_keypoints"]]
            if names != first_names:
                raise serializers.ValidationError(
                    "All keyframes must contain the same marker names in the same order."
                )

        return value    