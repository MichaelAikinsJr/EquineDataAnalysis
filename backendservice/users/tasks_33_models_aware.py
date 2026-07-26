import os
import shutil
import subprocess
import uuid
from collections import defaultdict
from dataclasses import dataclass

import cv2
import numpy as np
from celery import shared_task
from django.core.files import File
from django.db import transaction
from ultralytics import YOLO

from .biomechanics_33 import compute_frame_metrics_33, compute_sequence_metrics_33, build_narrative_report_33, KPT_ORDER
from .models import AnalysisSession, SessionAngleFrame

MODEL_PATH = "/Users/addicted/Desktop/Equine/PFERD/runs/pose/horse_33kpt_yolo26s-3/weights/best.pt"
USE_TRACK = True
CONF_THRES = 0.50
MAX_DET = 5
ALPHA = 0.45

SKELETON = [
    (0, 1), (1, 2), (2, 3), (3, 4), (4, 5),
    (6, 7), (7, 8), (8, 9), (9, 10), (10, 11),
    (12, 13), (13, 14), (14, 15), (15, 16), (16, 17),
    (6, 18), (18, 19), (19, 20), (20, 21), (21, 22),
    (0, 6), (12, 6),
    (6, 23), (23, 24), (23, 25),
    (24, 26), (25, 27),
    (26, 28), (27, 29), (28, 29),
    (0, 30), (12, 30), (30, 31), (31, 32),
]

@dataclass
class TrackState:
    pts: np.ndarray | None = None
    conf: np.ndarray | None = None
    last_frame: int = -1


def smooth_points(prev_pts, curr_pts, prev_conf, curr_conf, alpha=0.45):
    if prev_pts is None:
        return curr_pts.copy(), curr_conf.copy() if curr_conf is not None else None
    out = curr_pts.copy()
    for k in range(len(curr_pts)):
        cconf = curr_conf[k] if curr_conf is not None else 1.0
        pconf = prev_conf[k] if prev_conf is not None else 1.0
        if np.isnan(curr_pts[k]).any():
            out[k] = prev_pts[k]
            continue
        if np.isnan(prev_pts[k]).any():
            continue
        a = alpha if cconf >= CONF_THRES else min(0.15, alpha)
        if pconf < CONF_THRES and cconf >= CONF_THRES:
            a = 0.7
        out[k] = a * curr_pts[k] + (1 - a) * prev_pts[k]
    return out, curr_conf.copy() if curr_conf is not None else None


def draw_pose(frame, pts, conf, track_id=None):
    canvas = frame.copy()
    for i, j in SKELETON:
        p1, p2 = pts[i], pts[j]
        if np.isnan(p1).any() or np.isnan(p2).any():
            continue
        c1 = conf[i] if conf is not None else 1.0
        c2 = conf[j] if conf is not None else 1.0
        if c1 < CONF_THRES or c2 < CONF_THRES:
            continue
        cv2.line(canvas, (int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1])), (0, 255, 0), 2)
    for x, y in pts:
        if np.isnan(x) or np.isnan(y):
            continue
        cv2.circle(canvas, (int(x), int(y)), 4, (0, 0, 255), -1)
    if track_id is not None:
        visible = pts[~np.isnan(pts).any(axis=1)]
        if len(visible):
            anchor = visible[0]
            cv2.putText(canvas, f"ID {track_id}", (int(anchor[0]), int(anchor[1]) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    return canvas


def _frame_model_kwargs(session, metrics):
    data = {
        "session": session,
        "frame_index": metrics["frame_index"],
        "timestamp_sec": metrics["timestamp_sec"],
        "keypoints_norm": metrics["keypoints_norm"],
        "bbox_xyxy_norm": metrics["bbox_xyxy_norm"],
    }
    optional_keys = [
        "frame_quality_score", "orientation", "visible_side",
        "left_hip_angle_deg", "left_stifle_angle_deg", "left_hock_angle_deg", "left_hind_fetlock_angle_deg",
        "left_shoulder_angle_deg", "left_elbow_angle_deg", "left_knee_angle_deg", "left_fore_fetlock_angle_deg",
        "right_hip_angle_deg", "right_stifle_angle_deg", "right_hock_angle_deg", "right_hind_fetlock_angle_deg",
        "right_shoulder_angle_deg", "right_elbow_angle_deg", "right_knee_angle_deg", "right_fore_fetlock_angle_deg",
        "left_hind_protraction_signed_deg", "left_fore_protraction_signed_deg", "right_hind_protraction_signed_deg", "right_fore_protraction_signed_deg",
        "left_hind_protraction_deg", "left_fore_protraction_deg", "right_hind_protraction_deg", "right_fore_protraction_deg",
        "poll_y_norm", "wither_y_norm", "pelvis_mid_y_norm", "head_mid_y_norm",
        "left_pelvis_y_norm", "right_pelvis_y_norm", "pelvis_roll_diff_norm", "tail_base_y_norm",
        "metrics_json",
    ]
    model_fields = {f.name for f in SessionAngleFrame._meta.get_fields() if hasattr(f, "attname")}
    for key in optional_keys:
        if key in model_fields:
            data[key] = metrics.get(key)
    if "metrics_json" in model_fields:
        data["metrics_json"] = metrics
    return data


@shared_task
def process_analysis_session_33(session_id):
    session = AnalysisSession.objects.get(id=session_id, user__isnull=False)
    session.status = "processing"
    session.progress = 5
    session.current_step = "Loading 33-keypoint model"
    session.error_message = ""
    session.save(update_fields=["status", "progress", "current_step", "error_message", "updated_at"])

    cap = None
    writer = None
    temp_output_path = None
    final_output_path = None

    try:
        model = YOLO(MODEL_PATH)
        video_path = session.video.path
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        if fps <= 0:
            fps = 30.0
        source_total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

        session.fps = fps
        session.total_frames = source_total_frames
        session.save(update_fields=["fps", "total_frames", "updated_at"])

        annotated_dir = os.path.join("media", "annotated_videos")
        os.makedirs(annotated_dir, exist_ok=True)
        base_name = uuid.uuid4().hex
        temp_output_path = os.path.join(annotated_dir, f"{base_name}_raw.mp4")
        final_output_path = os.path.join(annotated_dir, f"{base_name}.mp4")
        writer = cv2.VideoWriter(temp_output_path, cv2.VideoWriter_fourcc(*"mp4v"), min(fps, 30.0), (frame_width, frame_height))
        if not writer.isOpened():
            raise RuntimeError("OpenCV VideoWriter failed to open.")

        frame_rows = []
        frame_metrics_rows = []
        rendered_frames = 0
        states = defaultdict(TrackState)
        session.progress = 25
        session.current_step = "Running 33-keypoint pose analysis"
        session.save(update_fields=["progress", "current_step", "updated_at"])

        if USE_TRACK:
            results_stream = model.track(source=video_path, stream=True, save=False, persist=True, conf=CONF_THRES, iou=0.5, max_det=MAX_DET, task="pose")
        else:
            results_stream = model.predict(source=video_path, stream=True, save=False, conf=CONF_THRES, iou=0.5, max_det=MAX_DET, task="pose")

        frame_index = 0
        for result in results_stream:
            frame = result.orig_img.copy()
            if result.keypoints is None or result.keypoints.xy is None or len(result.keypoints.xy) == 0:
                writer.write(frame)
                frame_index += 1
                continue

            all_pts = result.keypoints.xy.cpu().numpy()
            all_pts_norm = result.keypoints.xyn.cpu().numpy()
            all_conf = result.keypoints.conf.cpu().numpy() if result.keypoints.conf is not None else np.ones((len(all_pts), len(KPT_ORDER)), dtype=np.float32)
            track_ids = None
            if USE_TRACK and result.boxes is not None and getattr(result.boxes, "id", None) is not None:
                track_ids = result.boxes.id.int().cpu().tolist()

            obj_idx = 0
            pts = all_pts[obj_idx].astype(np.float32)
            pts[np.isclose(pts[:, 0], 0) & np.isclose(pts[:, 1], 0)] = np.nan
            conf = all_conf[obj_idx]
            key = track_ids[obj_idx] if track_ids is not None and obj_idx < len(track_ids) else obj_idx
            prev_state = states[key]
            smooth_pts, smooth_conf = smooth_points(prev_state.pts, pts, prev_state.conf, conf, alpha=ALPHA)
            states[key] = TrackState(pts=smooth_pts.copy(), conf=smooth_conf.copy(), last_frame=frame_index)
            frame = draw_pose(frame, smooth_pts, smooth_conf, track_id=key if USE_TRACK else None)

            bbox_list = []
            if result.boxes is not None and len(result.boxes) > 0 and getattr(result.boxes, "xyxyn", None) is not None:
                bbox_list = result.boxes.xyxyn[obj_idx].cpu().numpy().tolist()

            metrics = compute_frame_metrics_33(all_pts_norm[obj_idx][:, :2], bbox_xyxy_norm=bbox_list, frame_index=frame_index, timestamp_sec=frame_index / fps)
            frame_metrics_rows.append(metrics)
            frame_rows.append(SessionAngleFrame(**_frame_model_kwargs(session, metrics)))
            rendered_frames += 1

            stale_keys = [k for k, s in states.items() if frame_index - s.last_frame > 30]
            for k in stale_keys:
                del states[k]
            writer.write(frame)
            frame_index += 1

            if source_total_frames > 0 and frame_index % 25 == 0:
                progress = min(85, int((frame_index / source_total_frames) * 60) + 25)
                session.progress = progress
                session.current_step = f"Processing frame {frame_index} of {source_total_frames}"
                session.save(update_fields=["progress", "current_step", "updated_at"])

        writer.release()
        writer = None
        cap.release()
        cap = None

        output_to_save = temp_output_path
        ffmpeg_path = shutil.which("ffmpeg")
        session.progress = 90
        session.current_step = "Encoding annotated video"
        session.save(update_fields=["progress", "current_step", "updated_at"])

        if ffmpeg_path and os.path.exists(temp_output_path):
            ffmpeg_cmd = [ffmpeg_path, "-y", "-i", temp_output_path, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-profile:v", "baseline", "-level", "3.0", "-an", final_output_path]
            ffmpeg_result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            if ffmpeg_result.returncode == 0 and os.path.exists(final_output_path):
                output_to_save = final_output_path
            else:
                session.error_message = f"ffmpeg failed, using raw video instead: {ffmpeg_result.stderr[:1000]}"

        summary = compute_sequence_metrics_33(frame_metrics_rows)
        narrative = build_narrative_report_33(session, summary)

        with transaction.atomic():
            SessionAngleFrame.objects.filter(session=session).delete()
            if frame_rows:
                SessionAngleFrame.objects.bulk_create(frame_rows, batch_size=500)
            if not os.path.exists(output_to_save):
                raise RuntimeError(f"Annotated output file missing: {output_to_save}")
            with open(output_to_save, "rb") as f:
                filename = os.path.basename(output_to_save)
                session.annotated_video.save(filename, File(f), save=False)

            session.orientation = summary.get("orientation", "unknown")
            session.visible_side = summary.get("visible_side", "unknown")
            session.quality_score = summary.get("quality_score")
            session.symmetry_index = summary.get("fore_protraction_asymmetry_deg")
            session.narrative_report = narrative

            session_fields = {f.name for f in AnalysisSession._meta.get_fields() if hasattr(f, "attname")}
            for key in ["poll_rom_norm", "wither_rom_norm", "pelvis_rom_norm", "pelvis_roll_mean_abs_norm", "fore_protraction_asymmetry_deg", "hind_protraction_asymmetry_deg"]:
                if key in session_fields:
                    setattr(session, key, summary.get(key))
            if "summary_metrics" in session_fields:
                session.summary_metrics = summary

            session.total_frames = rendered_frames
            session.status = "done"
            session.progress = 100
            session.current_step = "Analysis complete"
            session.save()

        if output_to_save == final_output_path and temp_output_path and os.path.exists(temp_output_path):
            os.remove(temp_output_path)
    except Exception as e:
        session.status = "failed"
        session.progress = 100
        session.current_step = "Analysis failed"
        session.error_message = repr(e)
        session.save(update_fields=["status", "progress", "current_step", "error_message", "updated_at"])
        raise
    finally:
        if cap is not None:
            cap.release()
        if writer is not None:
            writer.release()
        for path in [temp_output_path, final_output_path]:
            if path and os.path.exists(path):
                try:
                    annotated_path = getattr(session.annotated_video, "path", None)
                except Exception:
                    annotated_path = None
                if session.status != "done" or path != annotated_path:
                    try:
                        os.remove(path)
                    except OSError:
                        pass
