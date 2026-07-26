# tasks.py
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

from .tasks_33_models_aware import process_analysis_session_33

from .tasks_classical import process_analysis_session_classical
from .biomechanics_33 import (
    KPT_ORDER,
    build_narrative_report_33,
    compute_frame_metrics_33,
    compute_sequence_metrics_33,
)
from .curve_metrics_33 import compute_normalized_curves_33
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
    pts_px: np.ndarray | None = None
    pts_norm: np.ndarray | None = None
    conf: np.ndarray | None = None
    last_frame: int = -1


def _frame_model_kwargs(session, metrics):
    return {
        "session": session,
        "frame_index": metrics["frame_index"],
        "timestamp_sec": metrics["timestamp_sec"],
        "keypoints_norm": metrics["keypoints_norm"],
        "bbox_xyxy_norm": metrics.get("bbox_xyxy_norm", []),
        "frame_quality_score": metrics.get("frame_quality_score"),
        "orientation": metrics.get("orientation", "unknown"),
        "visible_side": metrics.get("visible_side", "unknown"),
        "metrics_json": metrics,
        "tracking_source": metrics.get("tracking_source", "yolo26"),
        "keypoint_confidences": metrics.get("keypoint_confidences", []),
        "keypoint_tracking_meta": metrics.get("keypoint_tracking_meta", {}),
    }


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
            cv2.putText(
                canvas,
                f"ID {track_id}",
                (int(anchor[0]), int(anchor[1]) - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2,
            )

    return canvas

@shared_task
def process_analysis_session(session_id):
    session = AnalysisSession.objects.get(id=session_id, user__isnull=False)
    if getattr(session, "tracking_mode", "yolo26") == "classical":
        return process_analysis_session_classical(session_id)
    return process_analysis_session_33(session_id)

# @shared_task
# def process_analysis_session(session_id):
#     session = AnalysisSession.objects.get(id=session_id, user__isnull=False)
#     if getattr(session, "tracking_mode", "yolo26") == "classical":
#         return process_analysis_session_classical(str(session_id))
#     return process_analysis_session_33(str(session_id))