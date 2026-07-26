import base64
from collections import defaultdict
from pathlib import Path

import cv2
from django.http import HttpResponse, request
from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action, api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.views import TokenObtainPairView

from .tasks_classical import process_analysis_session_classical

from .biomechanics_33 import KPT_ORDER
from .models import Horse, AnalysisSession, SessionAngleFrame
from .serializers import (
    AnalysisSessionSerializer,
    AnalysisSessionUploadSerializer,
    ClassicalSetupResponseSerializer,
    ClassicalTrackingInitSerializer,
    HorseHistoryPointSerializer,
    HorseSerializer,
    HorseSessionListSerializer,
    SecureTokenSerializer,
    SessionAngleFrameSerializer,
    SessionListSerializer,
    SessionResultsSerializer,
    UserSerializer,
)
from .serializers import (
    SessionUploadSerializer,
    SaveMarkerSetupSerializer,
)

from .tasks import process_analysis_session

User = get_user_model()

DEFAULT_CLASSICAL_KEYPOINTS = list(KPT_ORDER) if KPT_ORDER else [
    "wither",
    "shoulder",
    "elbow",
    "carpus",
    "fore_fetlock",
    "hip",
    "stifle",
    "hock",
    "hind_fetlock",
]


MARKER_NAMES = [
    "wither",
    "shoulder",
    "elbow",
    "knee",
    "frontfetlock",
    "frontcoronet",
    "tubercoxae",
    "hip",
    "stifle",
    "hock",
    "hindfetlock",
    "hindcoronet",
]

def get_user_session_or_response(session_id, user):
    if not user or not user.is_authenticated:
        return None, Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    session = AnalysisSession.objects.select_related("user").filter(id=session_id).first()
    if not session:
        return None, Response(
            {"detail": f"AnalysisSession {session_id} does not exist."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if session.user_id != user.id:
        return None, Response(
            {
                "detail": "Session exists but does not belong to the authenticated user.",
                "session_id": str(session.id),
                "session_user_id": str(session.user_id),
                "request_user_id": str(user.id),
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return session, None


class CreateUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


class SecureTokenView(TokenObtainPairView):
    serializer_class = SecureTokenSerializer


# class SessionUploadView(APIView):
#     permission_classes = [IsAuthenticated]

#     def post(self, request):
#         video = request.FILES.get("video")
#         horse_name = (request.data.get("horse_name") or "").strip()
#         gait = (request.data.get("gait") or "").strip()
#         notes = (request.data.get("notes") or "").strip()
#         breed = (request.data.get("breed") or "").strip()
#         tracking_mode = (request.data.get("tracking_mode") or "yolo26").strip().lower()

#         if not video:
#             return Response({"detail": "Video is required."}, status=status.HTTP_400_BAD_REQUEST)
#         if not horse_name:
#             return Response({"detail": "Horse name is required."}, status=status.HTTP_400_BAD_REQUEST)
#         if not gait:
#             return Response({"detail": "Gait is required."}, status=status.HTTP_400_BAD_REQUEST)
#         if tracking_mode not in {"yolo26", "classical"}:
#             return Response({"detail": "Invalid tracking mode."}, status=status.HTTP_400_BAD_REQUEST)

#         with transaction.atomic():
#             horse, _ = Horse.objects.get_or_create(
#                 owner=request.user,
#                 name=horse_name,
#                 defaults={"breed": breed},
#             )

#             if breed and not horse.breed:
#                 horse.breed = breed
#                 horse.save(update_fields=["breed"])

#             horse_id = request.data.get("horse_id")

#             horse = Horse.objects.get(id=horse_id, user=request.user)    

#             session = AnalysisSession.objects.create(
#                 user=request.user,
#                 horse=horse,
#                 horse_name=horse.name,
#                 gait=gait,
#                 notes=notes,
#                 video=video,
#                 original_filename=video.name,
#                 tracking_mode=tracking_mode,
#                 status="queued" if tracking_mode == "yolo26" else "awaiting_setup",
#                 progress=0,
#                 current_step="Queued for processing" if tracking_mode == "yolo26" else "Waiting for classical setup",
#                 manual_start_frame=None,
#                 manual_keypoints_norm=[],
#                 manual_keyframes_norm=[],
#             )

#             if tracking_mode == "yolo26":
#                 task = process_analysis_session.delay(str(session.id))
#                 session.celery_task_id = task.id
#                 session.save(update_fields=["celery_task_id"])

#         return Response(
#             {
#                 "session_id": str(session.id),
#                 "horse_id": str(horse.id),
#                 "horse_name": horse.name,
#                 "tracking_mode": tracking_mode,
#                 "status": session.status,
#                 "progress": session.progress,
#                 "current_step": session.current_step,
#             },
#             status=status.HTTP_201_CREATED,
#         )



class SessionUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        video = request.FILES.get("video")
        horse_name = (request.data.get("horse_name") or "").strip()
        gait = (request.data.get("gait") or "").strip()
        notes = (request.data.get("notes") or "").strip()
        breed = (request.data.get("breed") or "").strip()
        tracking_mode = (request.data.get("tracking_mode") or "yolo26").strip().lower()

        if not video:
            return Response({"detail": "Video is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not horse_name:
            return Response({"detail": "Horse name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not gait:
            return Response({"detail": "Gait is required."}, status=status.HTTP_400_BAD_REQUEST)
        if tracking_mode not in {"yolo26", "classical"}:
            return Response({"detail": "Invalid tracking mode."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            horse, _ = Horse.objects.get_or_create(
                user=request.user,
                name=horse_name,
                defaults={"breed": breed},
            )

            if breed and not horse.breed:
                horse.breed = breed
                horse.save(update_fields=["breed"])

            session = AnalysisSession.objects.create(
                user=request.user,
                horse=horse,
                horse_name=horse.name,
                gait=gait,
                notes=notes,
                video=video,
                original_filename=video.name,
                tracking_mode=tracking_mode,
                status="queued" if tracking_mode == "yolo26" else "awaiting_setup",
                progress=0,
                current_step="Queued for processing" if tracking_mode == "yolo26" else "Waiting for classical setup",
                manual_start_frame=None,
                manual_keypoints_norm=[],
                manual_keyframes_norm=[],
            )

            if tracking_mode == "yolo26":
                task = process_analysis_session.delay(str(session.id))
                session.celery_task_id = task.id
                session.save(update_fields=["celery_task_id"])

        return Response(
            {
                "session_id": str(session.id),
                "horse_id": str(horse.id),
                "horse_name": horse.name,
                "tracking_mode": tracking_mode,
                "status": session.status,
                "progress": session.progress,
                "current_step": session.current_step,
            },
            status=status.HTTP_201_CREATED,
        )
    
class SessionStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, session_id):
        session = get_object_or_404(
            AnalysisSession.objects.select_related("user"),
            id=session_id,
            user=request.user,
        )
        return Response(
            {
                "session_id": str(session.id),
                "status": session.status,
                "progress": session.progress,
                "current_step": session.current_step,
                "original_filename": session.original_filename,
                "horse_name": getattr(session, "horse_name", None),
                "error_message": session.error_message,
                "tracking_mode": session.tracking_mode,
                "classical_submode": session.classical_submode,
            }
        )


class HorseListView(generics.ListAPIView):
    serializer_class = HorseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Horse.objects.filter(owner=self.request.user).prefetch_related("sessions").order_by("name")


class HorseDetailView(generics.RetrieveAPIView):
    serializer_class = HorseSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_url_kwarg = "horse_id"

    def get_queryset(self):
        return Horse.objects.filter(owner=self.request.user).prefetch_related("sessions")


class SessionListView(generics.ListAPIView):
    serializer_class = SessionListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = (
            AnalysisSession.objects
            .filter(user=self.request.user)
            .select_related("user")
            .order_by("-created_at")
        )

        status_value = self.request.query_params.get("status")

        if status_value:
            queryset = queryset.filter(status=status_value)
    

        return queryset


class HorseSessionListView(generics.ListAPIView):
    serializer_class = SessionListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            AnalysisSession.objects
            .filter(user=self.request.user, horse_id=self.kwargs["horse_id"])
            .select_related("horse")
            .order_by("-created_at")
        )


class SessionResultsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, session_id):
        session = get_object_or_404(
            AnalysisSession.objects.select_related("user"),
            id=session_id,
            user=request.user,
        )
        serializer = SessionResultsSerializer(session, context={"request": request})
        return Response(serializer.data)


class SessionFramesView(generics.ListAPIView):
    serializer_class = SessionAngleFrameSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            SessionAngleFrame.objects
            .filter(session_id=self.kwargs["session_id"], session__user=self.request.user)
            .order_by("frame_index")
        )


class AnalysisSessionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        return AnalysisSession.objects.filter(user=self.request.user).order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "frames":
            return SessionAngleFrameSerializer
        return AnalysisSessionSerializer

    def get_serializer_context(self):
        return {"request": self.request}

    @action(detail=True, methods=["get"])
    def frames(self, request, pk=None):
        session = self.get_object()
        serializer = SessionAngleFrameSerializer(session.frames.all(), many=True)
        return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def classical_setup(request, session_id):
    session, error_response = get_user_session_or_response(session_id, request.user)
    if error_response:
        return error_response

    data = {
        "session_id": session.id,
        "horse_name": session.horse_name,
        "gait": session.gait,
        "tracking_mode": session.tracking_mode or "classical",
        "status": session.status,
        "progress": session.progress,
        "current_step": session.current_step,
        "manual_start_frame": session.manual_start_frame,
        "manual_keypoints_norm": session.manual_keypoints_norm or [],
        "manual_keyframes_norm": getattr(session, "manual_keyframes_norm", []) or [],
        "fps": session.fps,
        "total_frames": session.total_frames,
        "original_filename": session.original_filename,
        "default_keypoints": DEFAULT_CLASSICAL_KEYPOINTS,
    }

    serializer = ClassicalSetupResponseSerializer(data)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def classical_frame(request, session_id):
    session, error_response = get_user_session_or_response(session_id, request.user)
    if error_response:
        return error_response

    if not session.video:
        return Response(
            {"detail": "This session has no uploaded video."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    video_path = session.video.path
    if not Path(video_path).exists():
        return Response(
            {"detail": f"Video file does not exist on disk: {video_path}"},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        frame_index = int(request.query_params.get("frame", 0))
    except (TypeError, ValueError):
        return Response(
            {"detail": "Invalid frame query parameter."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return Response(
            {"detail": f"Could not open video: {video_path}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)

        if total_frames > 0:
            frame_index = max(0, min(frame_index, total_frames - 1))
        else:
            frame_index = max(0, frame_index)

        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, frame = cap.read()
        if not ok or frame is None:
            return Response(
                {"detail": "Could not read the requested frame."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        if not ok:
            return Response(
                {"detail": "Could not encode frame."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        jpeg_bytes = encoded.tobytes()
        response = HttpResponse(jpeg_bytes, content_type="image/jpeg")
        response["X-Frame-Index"] = str(frame_index)
        response["X-Total-Frames"] = str(total_frames)
        response["X-FPS"] = str(fps)
        response["Cache-Control"] = "no-store"
        return response

    finally:
        cap.release()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def classical_tracking_init(request, session_id):
    session, error_response = get_user_session_or_response(session_id, request.user)
    if error_response:
        return error_response

    if session.status == "processing":
        return Response(
            {"detail": "Session is already processing."},
            status=status.HTTP_409_CONFLICT,
        )

    serializer = ClassicalTrackingInitSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    validated = serializer.validated_data

    session.tracking_mode = "classical"
    session.status = "queued"
    session.progress = 0
    session.current_step = "Queued for classical tracking"
    session.error_message = ""

    update_fields = [
        "tracking_mode",
        "status",
        "progress",
        "current_step",
        "error_message",
        "updated_at",
    ]

    if "keyframes" in validated and validated.get("keyframes") is not None:
        keyframes = validated["keyframes"]

        session.manual_keyframes_norm = keyframes

        first_keyframe = keyframes[0]
        session.manual_start_frame = first_keyframe["frame_index"]
        session.manual_keypoints_norm = first_keyframe["selected_keypoints"]

        update_fields.extend([
            "manual_keyframes_norm",
            "manual_start_frame",
            "manual_keypoints_norm",
        ])
    else:
        session.manual_start_frame = validated["start_frame"]
        session.manual_keypoints_norm = validated["selected_keypoints"]
        session.manual_keyframes_norm = [
            {
                "frame_index": validated["start_frame"],
                "selected_keypoints": validated["selected_keypoints"],
            }
        ]

        update_fields.extend([
            "manual_start_frame",
            "manual_keypoints_norm",
            "manual_keyframes_norm",
        ])

    session.save(update_fields=update_fields)

    task = process_analysis_session.delay(str(session.id))
    session.celery_task_id = task.id
    session.save(update_fields=["celery_task_id"])

    return Response(
        {
            "detail": "Classical tracking started.",
            "session": AnalysisSessionSerializer(session).data,
        },
        status=status.HTTP_202_ACCEPTED,
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_yolo_tracking(request, session_id):
    session, error_response = get_user_session_or_response(session_id, request.user)
    if error_response:
        return error_response

    if session.status == "processing":
        return Response(
            {"detail": "Session is already processing."},
            status=status.HTTP_409_CONFLICT,
        )

    session.tracking_mode = "yolo26"
    session.manual_start_frame = None
    session.manual_keypoints_norm = []
    session.status = "queued"
    session.progress = 0
    session.current_step = "Queued for YOLO26 analysis"
    session.error_message = ""
    session.save(
        update_fields=[
            "tracking_mode",
            "manual_start_frame",
            "manual_keypoints_norm",
            "status",
            "progress",
            "current_step",
            "error_message",
            "updated_at",
        ]
    )

    task = process_analysis_session.delay(str(session.id))
    session.celery_task_id = task.id
    session.save(update_fields=["celery_task_id"])

    return Response(
        {
            "detail": "YOLO26 analysis started.",
            "session": AnalysisSessionSerializer(session).data,
        },
        status=status.HTTP_202_ACCEPTED,
    )


class HorseHistoryView(generics.GenericAPIView):
    serializer_class = HorseHistoryPointSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        horse_id = self.kwargs["horse_id"]

        sessions = list(
            AnalysisSession.objects.filter(
                horse_id=horse_id,
                user=request.user,
                status="done",
            ).order_by("created_at")
        )

        session_ids = [s.id for s in sessions]

        frames = (
            SessionAngleFrame.objects
            .filter(session_id__in=session_ids)
            .order_by("session_id", "frame_index")
        )

        frames_by_session = defaultdict(list)
        for frame in frames:
            frames_by_session[frame.session_id].append(frame)

        points = []

        for session in sessions:
            session_frames = frames_by_session.get(session.id, [])

            fore_fetlock = [
                f.fore_fetlock_angle_deg
                for f in session_frames
                if isinstance(f.fore_fetlock_angle_deg, (int, float))
            ]
            hind_fetlock = [
                f.hind_fetlock_angle_deg
                for f in session_frames
                if isinstance(f.hind_fetlock_angle_deg, (int, float))
            ]

            fetlock_fore_rom = max(fore_fetlock) - min(fore_fetlock) if len(fore_fetlock) >= 2 else None
            fetlock_hind_rom = max(hind_fetlock) - min(hind_fetlock) if len(hind_fetlock) >= 2 else None

            protraction_si = session.symmetry_index
            poll_stability = None

            points.append(
                {
                    "date": session.created_at.date(),
                    "fetlockForeRom": round(fetlock_fore_rom, 2) if fetlock_fore_rom is not None else None,
                    "fetlockHindRom": round(fetlock_hind_rom, 2) if fetlock_hind_rom is not None else None,
                    "protractionSI": round(protraction_si, 2) if isinstance(protraction_si, (int, float)) else None,
                    "pollStability": poll_stability,
                }
            )

        serializer = self.get_serializer(points, many=True)
        return Response(serializer.data)


class HorseSessionsView(generics.ListAPIView):
    serializer_class = HorseSessionListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            AnalysisSession.objects
            .filter(horse_id=self.kwargs["horse_id"], user=self.request.user)
            .select_related("horse")
            .order_by("-created_at")
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def create_analysis_session(request):
    serializer = AnalysisSessionUploadSerializer(
        data=request.data,
        context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    session = serializer.save()

    if session.tracking_mode == "yolo26":
        session.current_step = "Queued for YOLO26 analysis"
        session.manual_start_frame = None
        session.manual_keypoints_norm = []
        session.manual_keyframes_norm = []
        session.save(
            update_fields=[
                "current_step",
                "manual_start_frame",
                "manual_keypoints_norm",
                "manual_keyframes_norm",
                "updated_at",
            ]
        )
        task = process_analysis_session.delay(str(session.id))
        session.celery_task_id = task.id
        session.save(update_fields=["celery_task_id"])
    else:
        session.current_step = "Awaiting classical tracking initialization"
        session.manual_start_frame = None
        session.manual_keypoints_norm = []
        session.manual_keyframes_norm = []
        session.save(
            update_fields=[
                "current_step",
                "manual_start_frame",
                "manual_keypoints_norm",
                "manual_keyframes_norm",
                "updated_at",
            ]
        )

    return Response(
        {
            "detail": "Upload complete.",
            "session": AnalysisSessionSerializer(session).data,
        },
        status=status.HTTP_201_CREATED,
    )



def _open_video_or_400(session):
    cap = cv2.VideoCapture(session.video.path)
    if not cap.isOpened():
        return None, Response({"detail": "Could not open session video."}, status=400)
    return cap, None


def _frame_to_base64_jpeg(frame, quality=90):
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("Could not encode frame image.")
    return base64.b64encode(buf.tobytes()).decode("utf-8")


# @api_view(["POST"])
# @permission_classes([IsAuthenticated])
# def upload_session(request):
#     serializer = SessionUploadSerializer(data=request.data)
#     serializer.is_valid(raise_exception=True)

#     session = serializer.save(
#         user=request.user,
#         status="uploaded",
#         progress=0,
#         current_step="Upload complete",
#     )

#     return Response(
#         {
#             "session": {
#                 "id": session.id,
#                 "tracking_mode": session.tracking_mode,
#                 "classical_submode": session.classical_submode,
#             }
#         },
#         status=status.HTTP_201_CREATED,
#     )

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_session(request):
    serializer = SessionUploadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    horse_name = (request.data.get("horse_name") or "").strip()
    breed = (request.data.get("breed") or "").strip()
    tracking_mode = (request.data.get("tracking_mode") or "yolo26").strip().lower()
    classical_submode = (request.data.get("classical_submode") or "").strip().lower() or None

    if not horse_name:
        return Response({"detail": "Horse name is required."}, status=status.HTTP_400_BAD_REQUEST)

    if tracking_mode not in {"yolo26", "classical"}:
        return Response({"detail": "Invalid tracking mode."}, status=status.HTTP_400_BAD_REQUEST)

    if tracking_mode == "classical" and classical_submode not in {"markerless", "markers"}:
        return Response({"detail": "Classical submode is required."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        horse, _ = Horse.objects.get_or_create(
            user=request.user,
            name=horse_name,
            defaults={"breed": breed},
        )

        if breed and not horse.breed:
            horse.breed = breed
            horse.save(update_fields=["breed"])

        session = serializer.save(
            user=request.user,
            horse=horse,
            horse_name=horse.name,
            tracking_mode=tracking_mode,
            classical_submode=classical_submode,
            status="queued" if tracking_mode == "yolo26" else "awaiting_setup",
            progress=0,
            current_step="Queued for processing" if tracking_mode == "yolo26" else "Waiting for classical setup",
        )

    return Response(
        {
            "session": {
                "id": str(session.id),
                "tracking_mode": session.tracking_mode,
                "classical_submode": session.classical_submode,
                "horse_id": str(horse.id),
                "horse_name": horse.name,
                "status": session.status,
            }
        },
        status=status.HTTP_201_CREATED,
    )

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def marker_setup_metadata(request, session_id):
    session = get_object_or_404(AnalysisSession, id=session_id, user=request.user)

    if session.tracking_mode != "classical" or session.classical_submode != "markers":
        return Response({"detail": "This session is not a classical markers session."}, status=400)

    cap, error_response = _open_video_or_400(session)
    if error_response:
        return error_response

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cap.release()

    if fps <= 0 or total_frames < 2 or width <= 0 or height <= 0:
        return Response({"detail": "Invalid video metadata."}, status=400)

    if session.fps != fps or session.total_frames != total_frames:
        session.fps = fps
        session.total_frames = total_frames
        session.save(update_fields=["fps", "total_frames", "updated_at"])

    return Response(
        {
            "session_id": session.id,
            "fps": fps,
            "total_frames": total_frames,
            "width": width,
            "height": height,
            "marker_names": MARKER_NAMES,
            "saved_keyframes": session.manual_keyframes_norm or [],
        }
    )



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def marker_setup_frame(request, session_id):
    session = get_object_or_404(AnalysisSession, id=session_id, user=request.user)

    if session.tracking_mode != "classical" or session.classical_submode != "markers":
        return Response({"detail": "This session is not a classical markers session."}, status=400)

    try:
        frame_index = int(request.query_params.get("frame", "0"))
    except ValueError:
        return Response({"detail": "frame must be an integer."}, status=400)

    cap, error_response = _open_video_or_400(session)
    if error_response:
        return error_response

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    if frame_index < 0 or frame_index >= total_frames:
        cap.release()
        return Response({"detail": "frame is out of range."}, status=400)

    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None:
        return Response({"detail": f"Could not read frame {frame_index}."}, status=400)

    frame_b64 = _frame_to_base64_jpeg(frame)

    return Response(
        {
            "frame_index": frame_index,
            "width": width,
            "height": height,
            "image_base64": frame_b64,
            "mime_type": "image/jpeg",
        }
    )


# @api_view(["POST"])
# @permission_classes([IsAuthenticated])
# def marker_setup_save(request, session_id):
#     session = get_object_or_404(AnalysisSession, id=session_id, user=request.user)

#     if session.tracking_mode != "classical" or session.classical_submode != "markers":
#         return Response({"detail": "This session is not a classical markers session."}, status=400)

#     serializer = SaveMarkerSetupSerializer(data=request.data)
#     serializer.is_valid(raise_exception=True)

#     cap, error_response = _open_video_or_400(session)
#     if error_response:
#         return error_response

#     total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
#     width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
#     height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
#     fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
#     cap.release()

#     if fps <= 0 or total_frames < 2 or width <= 0 or height <= 0:
#         return Response({"detail": "Invalid video metadata."}, status=400)

#     incoming = serializer.validated_data["manual_keyframes"]
#     normalized_keyframes = []

#     for item in incoming:
#         frame_index = item["frame_index"]
#         if frame_index < 0 or frame_index >= total_frames:
#             return Response(
#                 {"detail": f"frame_index {frame_index} is out of range."},
#                 status=400,
#             )

#         selected_keypoints_norm = []
#         for kp in item["selected_keypoints"]:
#             name = kp["name"]
#             visible = kp.get("visible", True)
#             point = kp.get("point", None)

#             if not visible or point is None:
#                 return Response(
#                     {"detail": f"Marker '{name}' is invisible/null. Current backend requires visible points in all keyframes."},
#                     status=400,
#                 )

#             x_px = float(point[0])
#             y_px = float(point[1])

#             x_norm = x_px / float(width)
#             y_norm = y_px / float(height)

#             selected_keypoints_norm.append(
#                 {
#                     "name": name,
#                     "point": [x_norm, y_norm],
#                 }
#             )

#         normalized_keyframes.append(
#             {
#                 "frameindex": frame_index,
#                 "selectedkeypoints": selected_keypoints_norm,
#             }
#         )

#     session.fps = fps
#     session.total_frames = total_frames
#     session.manual_start_frame = normalized_keyframes[0]["frameindex"]
#     session.manual_keyframes_norm = normalized_keyframes
#     session.manual_keypoints_norm = normalized_keyframes[0]["selectedkeypoints"]
#     session.save(
#         update_fields=[
#             "fps",
#             "total_frames",
#             "manual_start_frame",
#             "manual_keyframes_norm",
#             "manual_keypoints_norm",
#             "updated_at",
#         ]
#     )

#     return Response(
#         {
#             "detail": "Marker setup saved.",
#             "session_id": session.id,
#             "manual_keyframe_count": len(normalized_keyframes),
#         }
#     )

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def marker_setup_save(request, session_id):
    session = get_object_or_404(AnalysisSession, id=session_id, user=request.user)

    manual_keyframes = request.data.get("manual_keyframes", [])

    if not isinstance(manual_keyframes, list) or len(manual_keyframes) < 2:
        return Response(
            {"detail": "At least two manual_keyframes are required."},
            status=400,
        )

    cleaned_keyframes = []

    for idx, item in enumerate(manual_keyframes):
        if not isinstance(item, dict):
            return Response(
                {"detail": f"manual_keyframes[{idx}] must be an object."},
                status=400,
            )

        frame_index = item.get("frame_index")
        selected_keypoints = item.get("selected_keypoints", [])

        if frame_index is None:
            return Response(
                {"detail": f"manual_keyframes[{idx}].frame_index is required."},
                status=400,
            )

        if not isinstance(selected_keypoints, list) or len(selected_keypoints) == 0:
            return Response(
                {"detail": f"manual_keyframes[{idx}].selected_keypoints is required."},
                status=400,
            )

        cleaned_points = []

        for kp_idx, kp in enumerate(selected_keypoints):
            if not isinstance(kp, dict):
                return Response(
                    {"detail": f"manual_keyframes[{idx}].selected_keypoints[{kp_idx}] must be an object."},
                    status=400,
                )

            name = kp.get("name")
            point = kp.get("point")

            if not name:
                return Response(
                    {"detail": f"manual_keyframes[{idx}].selected_keypoints[{kp_idx}].name is required."},
                    status=400,
                )

            if (
                not isinstance(point, list)
                or len(point) != 2
                or point[0] is None
                or point[1] is None
            ):
                return Response(
                    {"detail": f"manual_keyframes[{idx}].selected_keypoints[{kp_idx}].point must be [x, y]."},
                    status=400,
                )

            cleaned_points.append(
                {
                    "name": name,
                    "point": [float(point[0]), float(point[1])],
                    "original_index": kp.get("original_index"),
                }
            )

        cleaned_keyframes.append(
            {
                "frame_index": int(frame_index),
                "selected_keypoints": cleaned_points,
            }
        )

    session.manual_keyframes_norm = cleaned_keyframes
    session.manual_start_frame = cleaned_keyframes[0]["frame_index"]
    session.save(update_fields=["manual_keyframes_norm", "manual_start_frame"])

    return Response(
        {
            "detail": "Marker setup saved.",
            "manual_keyframes_norm": session.manual_keyframes_norm,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def marker_setup_start(request, session_id):
    session = get_object_or_404(AnalysisSession, id=session_id, user=request.user)

    if session.tracking_mode != "classical" or session.classical_submode != "markers":
        return Response({"detail": "This session is not a classical markers session."}, status=400)

    if not session.manual_keyframes_norm or len(session.manual_keyframes_norm) < 2:
        return Response({"detail": "At least two marker keyframes are required before starting."}, status=400)

    session.status = "processing"
    session.progress = 1
    session.current_step = "Queued marker tracking"
    session.error_message = ""
    session.save(update_fields=["status", "progress", "current_step", "error_message", "updated_at"])

    process_analysis_session_classical.delay(session.id)

    return Response(
        {
            "detail": "Marker tracking started.",
            "session_id": session.id,
        }
    )