from django.urls import path
from .views import (
    SessionFramesView,
    SessionUploadView,
    SessionStatusView,
    SessionResultsView,
    SessionListView,
    HorseListView,
    HorseDetailView,
    HorseSessionsView,
    HorseHistoryView,
    classical_setup,
    classical_frame,
    classical_tracking_init,
    create_analysis_session,
    marker_setup_frame,
    marker_setup_metadata,
    marker_setup_save,
    marker_setup_start,
    start_yolo_tracking,
    upload_session,
)

urlpatterns = [
    path("sessions/upload/", upload_session, name="upload-session"),

    path("sessions/<uuid:session_id>/markers/setup/metadata/", marker_setup_metadata, name="marker-setup-metadata"),
    path("sessions/<uuid:session_id>/markers/setup/frame/", marker_setup_frame, name="marker-setup-frame"),
    path("sessions/<uuid:session_id>/markers/setup/save/", marker_setup_save, name="marker-setup-save"),
    path("sessions/<uuid:session_id>/markers/setup/start/", marker_setup_start, name="marker-setup-start"),

    path("sessions/upload/", SessionUploadView.as_view(), name="session-upload"),
    path("sessions/", SessionListView.as_view(), name="session-list"),
    path("sessions/<uuid:session_id>/status/", SessionStatusView.as_view(), name="session-status"),
    path("sessions/<uuid:session_id>/results/", SessionResultsView.as_view(), name="session-results"),
    path("sessions/<uuid:session_id>/frames/", SessionFramesView.as_view(), name="session-frames"),

    path("sessions/<uuid:session_id>/classical-setup/", classical_setup, name="classical-setup"),
    path("sessions/<uuid:session_id>/classical-frame/", classical_frame, name="classical-frame"),
    path("sessions/<uuid:session_id>/classical-init/", classical_tracking_init, name="classical-tracking-init"),

    path("horses/", HorseListView.as_view(), name="horse-list"),
    path("horses/<uuid:horse_id>/", HorseDetailView.as_view(), name="horse-detail"),
    path("horses/<uuid:horse_id>/sessions/", HorseSessionsView.as_view(), name="horse-sessions"),
    path("horses/<uuid:horse_id>/history/", HorseHistoryView.as_view(), name="horse-history"),

    path("analysis-sessions/", create_analysis_session, name="create-analysis-session"),
    path("analysis-sessions/<uuid:session_id>/start-yolo/", start_yolo_tracking, name="start-yolo-tracking"),
]