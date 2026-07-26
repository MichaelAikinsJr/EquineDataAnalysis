import os
import shutil
import subprocess
import tempfile
import math

import cv2
import numpy as np
from celery import shared_task
from django.core.files import File
from django.db import transaction

from .biomechanics_33 import build_narrative_report_33, compute_sequence_metrics_33
from .curve_metrics_33 import compute_normalized_curves_33
from .models import AnalysisSession, SessionAngleFrame
from .tracking_classical import ClassicalKeypointTracker, LKConfig


DEFAULT_COLORS = [
    (0, 0, 255),
    (0, 255, 0),
    (0, 255, 255),
    (255, 0, 0),
    (255, 0, 255),
    (255, 255, 0),
    (0, 165, 255),
    (128, 0, 255),
    (0, 128, 255),
    (128, 255, 0),
]


CLASSICAL_ANGLE_TRIPLETS = [
    {
        "key": "classical_shoulder_angle_deg",
        "label": "Shoulder",
        "triplet": ["wither", "shoulder", "elbow"],
    },
    {
        "key": "classical_elbow_angle_deg",
        "label": "Elbow",
        "triplet": ["shoulder", "elbow", "knee"],
    },
    {
        "key": "classical_knee_angle_deg",
        "label": "Knee",
        "triplet": ["elbow", "knee", "front_fetlock"],
    },
    {
        "key": "classical_fore_fetlock_angle_deg",
        "label": "Fore Fetlock",
        "triplet": ["knee", "front_fetlock", "front_coronet"],
    },
    {
        "key": "classical_hip_angle_deg",
        "label": "Hip",
        "triplet": ["tuber_coxae", "hip", "stifle"],
    },
    {
        "key": "classical_stifle_angle_deg",
        "label": "Stifle",
        "triplet": ["hip", "stifle", "hock"],
    },
    {
        "key": "classical_hock_angle_deg",
        "label": "Hock",
        "triplet": ["stifle", "hock", "rear_fetlock"],
    },
    {
        "key": "classical_hind_fetlock_angle_deg",
        "label": "Hind Fetlock",
        "triplet": ["hock", "rear_fetlock", "rear_coronet"],
    },
]


ANATOMICAL_EDGE_NAMES = [
    ("wither", "shoulder"),
    ("shoulder", "elbow"),
    ("elbow", "knee"),
    ("knee", "front_fetlock"),
    ("front_fetlock", "front_coronet"),
    ("tuber_coxae", "hip"),
    ("hip", "stifle"),
    ("stifle", "hock"),
    ("hock", "rear_fetlock"),
    ("rear_fetlock", "rear_coronet"),
]


DIRECTION_CONFLICT_THRESHOLD_PX = 18.0


def _points_to_float32_array(points, context="points"):
    if points is None:
        raise RuntimeError(f"{context} is missing.")

    if not isinstance(points, (list, tuple, np.ndarray)):
        raise RuntimeError(f"{context} must be a list-like collection of [x, y] points.")

    cleaned = []
    for idx, pt in enumerate(points):
        if not isinstance(pt, (list, tuple, np.ndarray)) or len(pt) != 2:
            raise RuntimeError(f"{context}[{idx}] must be [x, y], got {pt!r}")

        try:
            x = float(pt[0])
            y = float(pt[1])
        except (TypeError, ValueError):
            raise RuntimeError(f"{context}[{idx}] must contain numeric x/y values, got {pt!r}")

        if not np.isfinite(x) or not np.isfinite(y):
            raise RuntimeError(f"{context}[{idx}] contains non-finite values, got {pt!r}")

        cleaned.append([x, y])

    arr = np.asarray(cleaned, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] != 2:
        raise RuntimeError(f"{context} must resolve to an array of shape (N, 2), got shape {arr.shape!r}")

    return arr


def _coerce_points_px_array(points, expected_len=None, context="points_px", allow_none=True, allow_nan=True):
    if points is None:
        raise RuntimeError(f"{context} is missing.")

    if not isinstance(points, (list, tuple, np.ndarray)):
        raise RuntimeError(
            f"{context} must be a list-like collection, got {type(points).__name__}"
        )

    cleaned = []
    for idx, pt in enumerate(points):
        if pt is None:
            if not allow_none:
                raise RuntimeError(f"{context}[{idx}] must be [x, y], got None")
            cleaned.append([np.nan, np.nan])
            continue

        if not isinstance(pt, (list, tuple, np.ndarray)) or len(pt) != 2:
            raise RuntimeError(f"{context}[{idx}] must be [x, y] or None, got {pt!r}")

        x_raw, y_raw = pt[0], pt[1]

        if x_raw is None or y_raw is None:
            if not allow_none:
                raise RuntimeError(f"{context}[{idx}] contains None, got {pt!r}")
            cleaned.append([np.nan, np.nan])
            continue

        try:
            x = float(x_raw)
            y = float(y_raw)
        except (TypeError, ValueError):
            raise RuntimeError(
                f"{context}[{idx}] must contain numeric x/y values, got {pt!r}"
            )

        if not allow_nan and (not np.isfinite(x) or not np.isfinite(y)):
            raise RuntimeError(f"{context}[{idx}] contains non-finite values, got {pt!r}")

        cleaned.append([x, y])

    arr = np.asarray(cleaned, dtype=np.float32)

    if arr.ndim != 2 or arr.shape[1] != 2:
        raise RuntimeError(f"{context} must resolve to shape (N, 2), got {arr.shape!r}")

    if expected_len is not None and arr.shape[0] != expected_len:
        raise RuntimeError(
            f"{context} must contain {expected_len} points, got {arr.shape[0]}"
        )

    if not allow_nan and not np.isfinite(arr).all():
        raise RuntimeError(f"{context} contains non-finite values.")

    return arr


def _json_float(value):
    value = float(value)
    return value if np.isfinite(value) else None


def _points_array_to_json_list(points_arr, expected_len=None, context="points_arr"):
    arr = _coerce_points_px_array(
        points_arr,
        expected_len=expected_len,
        context=context,
        allow_none=True,
        allow_nan=True,
    )
    out = []
    for pt in arr:
        out.append([_json_float(pt[0]), _json_float(pt[1])])
    return out


def _json_sanitize(value):
    if isinstance(value, dict):
        return {k: _json_sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_sanitize(v) for v in value]
    if isinstance(value, np.ndarray):
        return [_json_sanitize(v) for v in value.tolist()]
    if isinstance(value, (np.floating, float)):
        v = float(value)
        return v if np.isfinite(v) else None
    if isinstance(value, (np.integer, int)):
        return int(value)
    return value


def _is_valid_pt(pt):
    return pt is not None and len(pt) == 2 and np.isfinite(pt[0]) and np.isfinite(pt[1])


def _clip_pt(pt, width, height):
    x = int(np.clip(round(float(pt[0])), 0, width - 1))
    y = int(np.clip(round(float(pt[1])), 0, height - 1))
    return (x, y)


def _bbox_from_points_px(points_px, width, height):
    valid = np.asarray([p for p in points_px if _is_valid_pt(p)], dtype=np.float32)
    if len(valid) == 0:
        return []
    x1 = float(np.min(valid[:, 0])) / float(width)
    y1 = float(np.min(valid[:, 1])) / float(height)
    x2 = float(np.max(valid[:, 0])) / float(width)
    y2 = float(np.max(valid[:, 1])) / float(height)
    return [x1, y1, x2, y2]


def _compute_angle_deg(a, b, c):
    if a is None or b is None or c is None:
        return None

    ax, ay = float(a[0]), float(a[1])
    bx, by = float(b[0]), float(b[1])
    cx, cy = float(c[0]), float(c[1])

    if not np.isfinite([ax, ay, bx, by, cx, cy]).all():
        return None

    ux, uy = ax - bx, ay - by
    vx, vy = cx - bx, cy - by

    nu = math.hypot(ux, uy)
    nv = math.hypot(vx, vy)

    if nu < 1e-8 or nv < 1e-8:
        return None

    cos_theta = (ux * vx + uy * vy) / (nu * nv)
    cos_theta = max(-1.0, min(1.0, cos_theta))
    return float(math.degrees(math.acos(cos_theta)))


def _build_label_to_point(labels, points_px, status):
    out = {}
    for i, name in enumerate(labels):
        if i >= len(points_px) or i >= len(status):
            continue
        if int(status[i]) != 1:
            continue
        pt = points_px[i]
        if _is_valid_pt(pt):
            out[name] = [float(pt[0]), float(pt[1])]
    return out


def _available_classical_angle_specs(labels):
    selected = set(labels)
    return [
        spec for spec in CLASSICAL_ANGLE_TRIPLETS
        if all(name in selected for name in spec["triplet"])
    ]


def _compute_classical_angle_metrics(labels, points_px, status):
    label_to_point = _build_label_to_point(labels, points_px, status)
    metrics = {}

    for spec in _available_classical_angle_specs(labels):
        a_name, b_name, c_name = spec["triplet"]
        metrics[spec["key"]] = _compute_angle_deg(
            label_to_point.get(a_name),
            label_to_point.get(b_name),
            label_to_point.get(c_name),
        )

    return metrics


def _make_temp_avi_writer(width, height, fps):
    fd, avi_path = tempfile.mkstemp(suffix=".avi")
    os.close(fd)

    writer = None
    for code in ["MJPG", "XVID", "mp4v"]:
        fourcc = cv2.VideoWriter_fourcc(*code)
        candidate = cv2.VideoWriter(avi_path, fourcc, fps, (width, height))
        if candidate.isOpened():
            writer = candidate
            break
        candidate.release()

    if writer is None:
        if os.path.exists(avi_path):
            os.remove(avi_path)
        raise RuntimeError("Could not create AVI video writer.")

    return writer, avi_path


def _transcode_avi_to_mp4(src_path):
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not on PATH.")

    fd, mp4_path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)

    cmd = [
        "ffmpeg", "-y", "-i", src_path,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-an",
        mp4_path,
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        if os.path.exists(mp4_path):
            os.remove(mp4_path)
        raise RuntimeError(f"ffmpeg transcoding failed: {e.stderr.decode(errors='ignore')[:800]}")

    return mp4_path


def _draw_cross(img, pt, color, size=8, thickness=2):
    x, y = pt
    cv2.line(img, (x - size, y), (x + size, y), color, thickness, cv2.LINE_AA)
    cv2.line(img, (x, y - size), (x, y + size), color, thickness, cv2.LINE_AA)


def _build_edges_from_labels(labels):
    name_to_idx = {name: i for i, name in enumerate(labels)}
    edges = []

    for a_name, b_name in ANATOMICAL_EDGE_NAMES:
        if a_name in name_to_idx and b_name in name_to_idx:
            edges.append((name_to_idx[a_name], name_to_idx[b_name]))

    return edges


def _draw_dynamic_overlay(frame, points_px, status, labels):
    annotated = frame.copy()
    height, width = annotated.shape[:2]

    edges = _build_edges_from_labels(labels)
    for i, j in edges:
        if i >= len(points_px) or j >= len(points_px):
            continue
        if not status[i] or not status[j]:
            continue
        if not _is_valid_pt(points_px[i]) or not _is_valid_pt(points_px[j]):
            continue
        p1 = _clip_pt(points_px[i], width, height)
        p2 = _clip_pt(points_px[j], width, height)
        cv2.line(annotated, p1, p2, (15, 118, 110), 3, cv2.LINE_AA)

    for i, pt in enumerate(points_px):
        if i >= len(labels):
            continue
        if not status[i]:
            continue
        if not _is_valid_pt(pt):
            continue

        p = _clip_pt(pt, width, height)
        color = DEFAULT_COLORS[i % len(DEFAULT_COLORS)]
        _draw_cross(annotated, p, color, size=9, thickness=2)

        cv2.putText(
            annotated,
            labels[i],
            (min(width - 220, p[0] + 10), max(20, p[1] - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            color,
            2,
            cv2.LINE_AA,
        )

    return annotated


def _extract_selected_keypoints(selected_keypoints):
    if not isinstance(selected_keypoints, list) or not selected_keypoints:
        raise RuntimeError("selected_keypoints must be a non-empty list.")

    labels = []
    raw_points = []

    for idx, item in enumerate(selected_keypoints):
        if not isinstance(item, dict):
            raise RuntimeError(f"Keypoint entry {idx} is not an object: {item!r}")

        name = str(item.get("name", "")).strip()
        point = item.get("point")

        if not name:
            raise RuntimeError(f"Keypoint entry {idx} is missing a name.")

        labels.append(name)
        raw_points.append(point)

    if len(labels) != len(set(labels)):
        raise RuntimeError("Duplicate keypoint names are not allowed within one keyframe.")

    points = _points_to_float32_array(raw_points, context="selected_keypoints")
    return labels, points


def _extract_manual_keyframes(raw):
    if not isinstance(raw, list) or not raw:
        return []

    out = []
    for item_idx, item in enumerate(raw):
        if not isinstance(item, dict):
            raise RuntimeError("Each manual keyframe must be an object.")

        frame_index = item.get("frame_index")
        selected_keypoints = item.get("selected_keypoints")

        if frame_index is None:
            raise RuntimeError(f"Manual keyframe {item_idx} must include frame_index.")

        try:
            frame_index = int(frame_index)
        except (TypeError, ValueError):
            raise RuntimeError(f"Manual keyframe {item_idx} frame_index must be an integer.")

        if frame_index < 0:
            raise RuntimeError("Manual keyframe frame_index must be >= 0.")

        labels, points = _extract_selected_keypoints(selected_keypoints)
        out.append({
            "frame_index": frame_index,
            "labels": labels,
            "points_norm": points,
        })

    out.sort(key=lambda item: item["frame_index"])

    frame_indices = [item["frame_index"] for item in out]
    if len(frame_indices) != len(set(frame_indices)):
        raise RuntimeError("Duplicate manual keyframe frame indices are not allowed.")

    return out


def _sort_keypoints_by_labels(selected_keypoints, canonical_labels):
    order_map = {name: idx for idx, name in enumerate(canonical_labels)}

    for item in selected_keypoints:
        if not isinstance(item, dict):
            raise RuntimeError(f"Invalid keypoint entry during sorting: {item!r}")
        name = str(item.get("name", "")).strip()
        if name not in order_map:
            raise RuntimeError(f"Unknown keypoint label '{name}' in manual keyframe.")

    return sorted(selected_keypoints, key=lambda item: order_map[item["name"]])


def _normalize_manual_keyframes(raw):
    if not isinstance(raw, list) or not raw:
        return []

    if not isinstance(raw[0], dict):
        raise RuntimeError("Each manual keyframe must be an object.")

    first_selected = raw[0].get("selected_keypoints") or []
    canonical_labels, _ = _extract_selected_keypoints(first_selected)

    normalized = []
    seen_frames = set()

    for item in raw:
        if not isinstance(item, dict):
            raise RuntimeError("Each manual keyframe must be an object.")

        frame_index = item.get("frame_index")
        selected_keypoints = item.get("selected_keypoints") or []

        try:
            frame_index = int(frame_index)
        except (TypeError, ValueError):
            raise RuntimeError("Each manual keyframe frame_index must be an integer.")

        if frame_index < 0:
            raise RuntimeError("Manual keyframe frame_index must be >= 0.")

        if frame_index in seen_frames:
            raise RuntimeError("Duplicate manual keyframe frame indices are not allowed.")
        seen_frames.add(frame_index)

        sorted_points = _sort_keypoints_by_labels(selected_keypoints, canonical_labels)
        labels, points = _extract_selected_keypoints(sorted_points)

        normalized.append({
            "frame_index": frame_index,
            "labels": labels,
            "points_norm": points,
        })

    normalized.sort(key=lambda item: item["frame_index"])
    return normalized


def _frame_model_kwargs(session, metrics):
    return {
        "session": session,
        "frame_index": metrics["frame_index"],
        "timestamp_sec": metrics["timestamp_sec"],
        "keypoints_norm": _json_sanitize(metrics["keypoints_norm"]),
        "bbox_xyxy_norm": _json_sanitize(metrics["bbox_xyxy_norm"]),
        "frame_quality_score": metrics.get("frame_quality_score"),
        "orientation": metrics.get("orientation", "unknown"),
        "visible_side": metrics.get("visible_side", "unknown"),
        "metrics_json": _json_sanitize(metrics),
        "tracking_source": metrics.get("tracking_source", "classical"),
        "keypoint_confidences": _json_sanitize(metrics.get("keypoint_confidences", [])),
        "keypoint_tracking_meta": _json_sanitize(metrics.get("keypoint_tracking_meta", {})),
        "left_hip_angle_deg": metrics.get("classical_hip_angle_deg"),
        "left_stifle_angle_deg": metrics.get("classical_stifle_angle_deg"),
        "left_hock_angle_deg": metrics.get("classical_hock_angle_deg"),
        "left_hind_fetlock_angle_deg": metrics.get("classical_hind_fetlock_angle_deg"),
        "left_shoulder_angle_deg": metrics.get("classical_shoulder_angle_deg"),
        "left_elbow_angle_deg": metrics.get("classical_elbow_angle_deg"),
        "left_knee_angle_deg": metrics.get("classical_knee_angle_deg"),
        "left_fore_fetlock_angle_deg": metrics.get("classical_fore_fetlock_angle_deg"),
    }


def _make_tracker():
    return ClassicalKeypointTracker(
        LKConfig(
            win_size=(31, 31),
            max_level=4,
            criteria=(
                cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT,
                30,
                0.01,
            ),
            min_eig_threshold=1e-6,
            fb_max_error_px=7.0,
            patch_error_max=40.0,
            max_jump_px=32.0,
            use_ecc_global_warp=False,
            keep_lost_for_frames=8,
        )
    )


def _read_frame(cap, frame_index):
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(frame_index))
    ok, frame = cap.read()
    if not ok or frame is None:
        raise RuntimeError(f"Could not read frame {frame_index}")
    return frame


def _track_segment_direction(cap, width, height, start_frame, end_frame, labels, points_norm, direction):
    tracker = _make_tracker()

    points_norm = _points_to_float32_array(
        points_norm,
        context=f"segment points_norm start={start_frame} end={end_frame}",
    )

    start_img = _read_frame(cap, start_frame)
    prev_gray = tracker.to_gray(start_img)
    prev_pts = tracker.norm_to_px(points_norm, width, height).astype(np.float32)
    prev_pts = _coerce_points_px_array(
        prev_pts,
        expected_len=len(labels),
        context=f"segment start prev_pts frame={start_frame}",
        allow_none=False,
        allow_nan=True,
    )
    tracker.initialize_templates(prev_gray, prev_pts)

    status0 = np.array([1 if np.all(np.isfinite(pt)) else 0 for pt in prev_pts], dtype=np.uint8)

    results = {
        start_frame: {
            "points_px": prev_pts.copy(),
            "status": status0.copy(),
            "meta": {
                "match_score": np.where(status0 == 1, 1.0, 0.0).astype(np.float32),
                "anchor_match_score": np.where(status0 == 1, 1.0, 0.0).astype(np.float32),
                "err": np.full((len(prev_pts),), np.nan, dtype=np.float32),
                "fb_error": np.full((len(prev_pts),), np.nan, dtype=np.float32),
                "jump": np.full((len(prev_pts),), np.nan, dtype=np.float32),
            },
            "tracking_source": "manual",
        }
    }

    step = 1 if direction == "forward" else -1
    frame_range = range(start_frame + step, end_frame + step, step)

    for frame_index in frame_range:
        frame = _read_frame(cap, frame_index)
        gray = tracker.to_gray(frame)

        tracked = tracker.track_points_once(prev_gray, gray, prev_pts)
        curr_pts = _coerce_points_px_array(
            tracked["next_pts"],
            expected_len=len(labels),
            context=f"tracked.next_pts frame={frame_index}",
            allow_none=True,
            allow_nan=True,
        )
        status = np.asarray(tracked["status"], dtype=np.uint8).reshape(-1)

        if len(curr_pts) != len(labels) or len(status) != len(labels):
            raise RuntimeError(
                f"Tracked point count mismatch at frame {frame_index}: "
                f"expected {len(labels)}, got points={len(curr_pts)}, status={len(status)}"
            )

        results[frame_index] = {
            "points_px": curr_pts.copy(),
            "status": status.copy(),
            "meta": {
                "match_score": np.asarray(
                    tracked.get("match_score", np.full((len(curr_pts),), np.nan)),
                    dtype=np.float32,
                ).reshape(-1),
                "anchor_match_score": np.asarray(
                    tracked.get("anchor_match_score", np.full((len(curr_pts),), np.nan)),
                    dtype=np.float32,
                ).reshape(-1),
                "err": np.asarray(
                    tracked.get("err", np.full((len(curr_pts),), np.nan)),
                    dtype=np.float32,
                ).reshape(-1),
                "fb_error": np.asarray(
                    tracked.get("fb_error", np.full((len(curr_pts),), np.nan)),
                    dtype=np.float32,
                ).reshape(-1),
                "jump": np.asarray(
                    tracked.get("jump", np.full((len(curr_pts),), np.nan)),
                    dtype=np.float32,
                ).reshape(-1),
            },
            "tracking_source": "classical",
        }

        prev_gray = gray
        prev_pts = curr_pts.copy()

    return results


def _norm_points_to_list(points_px, width, height, expected_len=None, context="points_px"):
    points_px_arr = _coerce_points_px_array(
        points_px,
        expected_len=expected_len,
        context=context,
        allow_none=True,
        allow_nan=True,
    )
    norm = _make_tracker().px_to_norm(points_px_arr, width, height)
    return _points_array_to_json_list(
        norm,
        expected_len=expected_len,
        context=f"{context}->norm",
    )


def _meta_list_or_none(values):
    out = []
    for v in values:
        out.append(None if not np.isfinite(v) else float(v))
    return out


def _build_metrics_for_frame(frame_index, fps, width, height, labels, points_px, status, meta, tracking_source):
    points_px = _coerce_points_px_array(
        points_px,
        expected_len=len(labels),
        context=f"frame {frame_index} points_px",
        allow_none=True,
        allow_nan=True,
    )
    status = np.asarray(status, dtype=np.uint8).reshape(-1)

    if len(points_px) != len(labels) or len(status) != len(labels):
        raise RuntimeError(
            f"Frame {frame_index} has inconsistent point/status lengths: "
            f"labels={len(labels)}, points={len(points_px)}, status={len(status)}"
        )

    valid_pts = points_px[status == 1] if np.any(status == 1) else np.empty((0, 2), dtype=np.float32)
    bbox_xyxy_norm = _bbox_from_points_px(valid_pts, width, height) if len(valid_pts) else []
    classical_angles = _compute_classical_angle_metrics(labels, points_px, status)

    return {
        "frame_index": frame_index,
        "timestamp_sec": frame_index / fps,
        "keypoints_norm": _norm_points_to_list(
            points_px,
            width,
            height,
            expected_len=len(labels),
            context=f"frame {frame_index} points_px",
        ),
        "bbox_xyxy_norm": bbox_xyxy_norm,
        "tracking_source": tracking_source,
        "frame_quality_score": float(np.mean(status)) if len(status) else 0.0,
        "keypoint_tracking_meta": {
            "status": status.astype(int).tolist(),
            "match_score": _meta_list_or_none(meta.get("match_score", np.full((len(points_px),), np.nan))),
            "anchor_match_score": _meta_list_or_none(meta.get("anchor_match_score", np.full((len(points_px),), np.nan))),
            "lk_error": _meta_list_or_none(meta.get("err", np.full((len(points_px),), np.nan))),
            "fb_error": _meta_list_or_none(meta.get("fb_error", np.full((len(points_px),), np.nan))),
            "jump_px": _meta_list_or_none(meta.get("jump", np.full((len(points_px),), np.nan))),
            "labels": list(labels),
        },
        **classical_angles,
    }


def _fuse_segment_frame(frame_index, start_frame, end_frame, labels, forward_item, backward_item):
    forward_pts = _coerce_points_px_array(
        forward_item["points_px"],
        expected_len=len(labels),
        context=f"forward points frame={frame_index}",
        allow_none=True,
        allow_nan=True,
    )
    backward_pts = _coerce_points_px_array(
        backward_item["points_px"],
        expected_len=len(labels),
        context=f"backward points frame={frame_index}",
        allow_none=True,
        allow_nan=True,
    )
    forward_status = np.asarray(forward_item["status"], dtype=np.uint8).reshape(-1)
    backward_status = np.asarray(backward_item["status"], dtype=np.uint8).reshape(-1)

    n = len(labels)
    if len(forward_pts) != n or len(backward_pts) != n or len(forward_status) != n or len(backward_status) != n:
        raise RuntimeError(
            f"Fusion shape mismatch at frame {frame_index}: "
            f"labels={n}, forward_pts={len(forward_pts)}, backward_pts={len(backward_pts)}, "
            f"forward_status={len(forward_status)}, backward_status={len(backward_status)}"
        )

    fused_pts = np.full((n, 2), np.nan, dtype=np.float32)
    fused_status = np.zeros((n,), dtype=np.uint8)

    forward_match = np.asarray(
        forward_item["meta"].get("match_score", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    backward_match = np.asarray(
        backward_item["meta"].get("match_score", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    forward_anchor = np.asarray(
        forward_item["meta"].get("anchor_match_score", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    backward_anchor = np.asarray(
        backward_item["meta"].get("anchor_match_score", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    forward_err = np.asarray(
        forward_item["meta"].get("err", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    backward_err = np.asarray(
        backward_item["meta"].get("err", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    forward_fb = np.asarray(
        forward_item["meta"].get("fb_error", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    backward_fb = np.asarray(
        backward_item["meta"].get("fb_error", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    forward_jump = np.asarray(
        forward_item["meta"].get("jump", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)
    backward_jump = np.asarray(
        backward_item["meta"].get("jump", np.full((n,), np.nan)),
        dtype=np.float32,
    ).reshape(-1)

    match_score = np.full((n,), np.nan, dtype=np.float32)
    anchor_match_score = np.full((n,), np.nan, dtype=np.float32)
    err = np.full((n,), np.nan, dtype=np.float32)
    fb_error = np.full((n,), np.nan, dtype=np.float32)
    jump = np.full((n,), np.nan, dtype=np.float32)
    bidirectional_error = np.full((n,), np.nan, dtype=np.float32)

    span = end_frame - start_frame
    if span <= 0:
        raise RuntimeError("Invalid manual keyframe segment span.")

    wf = (end_frame - frame_index) / span
    wb = (frame_index - start_frame) / span

    for i in range(n):
        f_ok = int(forward_status[i]) == 1 and _is_valid_pt(forward_pts[i])
        b_ok = int(backward_status[i]) == 1 and _is_valid_pt(backward_pts[i])

        if frame_index == start_frame:
            if f_ok:
                fused_pts[i] = forward_pts[i]
                fused_status[i] = 1
                match_score[i] = forward_match[i]
                anchor_match_score[i] = forward_anchor[i]
                err[i] = forward_err[i]
                fb_error[i] = forward_fb[i]
                jump[i] = forward_jump[i]
            continue

        if frame_index == end_frame:
            if b_ok:
                fused_pts[i] = backward_pts[i]
                fused_status[i] = 1
                match_score[i] = backward_match[i]
                anchor_match_score[i] = backward_anchor[i]
                err[i] = backward_err[i]
                fb_error[i] = backward_fb[i]
                jump[i] = backward_jump[i]
            continue

        if f_ok and b_ok:
            dist = float(np.hypot(
                forward_pts[i][0] - backward_pts[i][0],
                forward_pts[i][1] - backward_pts[i][1],
            ))
            bidirectional_error[i] = dist

            if dist <= DIRECTION_CONFLICT_THRESHOLD_PX:
                fused_pts[i] = (wf * forward_pts[i] + wb * backward_pts[i]).astype(np.float32)
                fused_status[i] = 1
                match_score[i] = np.nanmean([forward_match[i], backward_match[i]])
                anchor_match_score[i] = np.nanmean([forward_anchor[i], backward_anchor[i]])
                err[i] = np.nanmean([forward_err[i], backward_err[i]])
                fb_error[i] = np.nanmean([forward_fb[i], backward_fb[i]])
                jump[i] = np.nanmean([forward_jump[i], backward_jump[i]])
            else:
                fused_status[i] = 0
        elif f_ok:
            fused_pts[i] = forward_pts[i]
            fused_status[i] = 1
            match_score[i] = forward_match[i]
            anchor_match_score[i] = forward_anchor[i]
            err[i] = forward_err[i]
            fb_error[i] = forward_fb[i]
            jump[i] = forward_jump[i]
        elif b_ok:
            fused_pts[i] = backward_pts[i]
            fused_status[i] = 1
            match_score[i] = backward_match[i]
            anchor_match_score[i] = backward_anchor[i]
            err[i] = backward_err[i]
            fb_error[i] = backward_fb[i]
            jump[i] = backward_jump[i]

    meta = {
        "match_score": match_score,
        "anchor_match_score": anchor_match_score,
        "err": err,
        "fb_error": fb_error,
        "jump": jump,
        "bidirectional_error": bidirectional_error,
    }
    return fused_pts, fused_status, meta


def _run_single_seed_classical(session, cap, fps, total_frames, width, height, writer):
    start_frame = int(session.manual_start_frame or 0)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    ok, start_img = cap.read()
    if not ok:
        raise RuntimeError("Could not read manual start frame")

    labels, manual_points_norm = _extract_selected_keypoints(session.manual_keypoints_norm or [])

    tracker = _make_tracker()
    prev_pts = tracker.norm_to_px(manual_points_norm, width, height).astype(np.float32)
    prev_pts = _coerce_points_px_array(
        prev_pts,
        expected_len=len(labels),
        context=f"single-seed prev_pts frame={start_frame}",
        allow_none=False,
        allow_nan=True,
    )
    prev_gray = tracker.to_gray(start_img)
    tracker.initialize_templates(prev_gray, prev_pts)

    frame_rows = []
    frame_metrics_rows = []
    frame_index = start_frame

    status0 = np.array([1 if np.all(np.isfinite(pt)) else 0 for pt in prev_pts], dtype=np.uint8)
    start_bbox = _bbox_from_points_px(prev_pts[status0 == 1], width, height)
    classical_angles0 = _compute_classical_angle_metrics(labels, prev_pts, status0)

    start_metrics = {
        "frame_index": frame_index,
        "timestamp_sec": frame_index / fps,
        "keypoints_norm": _norm_points_to_list(
            prev_pts,
            width,
            height,
            expected_len=len(labels),
            context=f"single-seed start frame={frame_index}",
        ),
        "bbox_xyxy_norm": start_bbox,
        "tracking_source": "manual",
        "frame_quality_score": float(np.mean(status0)) if len(status0) else 0.0,
        "keypoint_tracking_meta": {
            "status": status0.astype(int).tolist(),
            "match_score": [1.0 if s else 0.0 for s in status0],
            "anchor_match_score": [1.0 if s else 0.0 for s in status0],
            "lk_error": [None for _ in status0],
            "fb_error": [None for _ in status0],
            "jump_px": [None for _ in status0],
            "labels": list(labels),
        },
        **classical_angles0,
    }

    frame_metrics_rows.append(start_metrics)
    frame_rows.append(SessionAngleFrame(**_frame_model_kwargs(session, start_metrics)))
    writer.write(_draw_dynamic_overlay(start_img, prev_pts, status0, labels))

    session.progress = 15
    session.current_step = "Running patch tracking"
    session.save(update_fields=["progress", "current_step", "updated_at"])

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame_index += 1
        gray = tracker.to_gray(frame)

        tracked = tracker.track_points_once(prev_gray, gray, prev_pts)
        curr_pts = _coerce_points_px_array(
            tracked["next_pts"],
            expected_len=len(labels),
            context=f"single-seed tracked.next_pts frame={frame_index}",
            allow_none=True,
            allow_nan=True,
        )
        status = np.asarray(tracked["status"], dtype=np.uint8).reshape(-1)

        if len(curr_pts) != len(labels) or len(status) != len(labels):
            raise RuntimeError(
                f"Tracked point count mismatch at frame {frame_index}: "
                f"expected {len(labels)}, got points={len(curr_pts)}, status={len(status)}"
            )

        valid_pts = curr_pts[status == 1] if np.any(status == 1) else np.empty((0, 2), dtype=np.float32)
        bbox_xyxy_norm = _bbox_from_points_px(valid_pts, width, height) if len(valid_pts) else []

        classical_angles = _compute_classical_angle_metrics(labels, curr_pts, status)

        metrics = {
            "frame_index": frame_index,
            "timestamp_sec": frame_index / fps,
            "keypoints_norm": _norm_points_to_list(
                curr_pts,
                width,
                height,
                expected_len=len(labels),
                context=f"single-seed frame={frame_index}",
            ),
            "bbox_xyxy_norm": bbox_xyxy_norm,
            "tracking_source": "classical",
            "frame_quality_score": float(np.mean(status)) if len(status) else 0.0,
            "keypoint_tracking_meta": {
                "status": status.astype(int).tolist(),
                "match_score": [
                    None if not np.isfinite(v) else float(v)
                    for v in tracked.get("match_score", np.full((len(curr_pts),), np.nan))
                ],
                "anchor_match_score": [
                    None if not np.isfinite(v) else float(v)
                    for v in tracked.get("anchor_match_score", np.full((len(curr_pts),), np.nan))
                ],
                "lk_error": [
                    None if not np.isfinite(v) else float(v)
                    for v in tracked.get("err", np.full((len(curr_pts),), np.nan))
                ],
                "fb_error": [
                    None if not np.isfinite(v) else float(v)
                    for v in tracked.get("fb_error", np.full((len(curr_pts),), np.nan))
                ],
                "jump_px": [
                    None if not np.isfinite(v) else float(v)
                    for v in tracked.get("jump", np.full((len(curr_pts),), np.nan))
                ],
                "labels": list(labels),
            },
            **classical_angles,
        }

        frame_metrics_rows.append(metrics)
        frame_rows.append(SessionAngleFrame(**_frame_model_kwargs(session, metrics)))
        writer.write(_draw_dynamic_overlay(frame, curr_pts, status, labels))

        prev_gray = gray
        prev_pts = curr_pts.copy()

        if total_frames > 0 and frame_index % 25 == 0:
            progress = min(85, int((frame_index / total_frames) * 70) + 15)
            session.progress = progress
            session.current_step = f"Running patch tracking ({frame_index}/{total_frames})"
            session.save(update_fields=["progress", "current_step", "updated_at"])

    return {
        "frame_rows": frame_rows,
        "frame_metrics_rows": frame_metrics_rows,
        "labels": labels,
        "tracking_start_frame": start_frame,
    }


def _run_segmented_classical(session, cap, fps, total_frames, width, height, writer):
    manual_keyframes = _normalize_manual_keyframes(getattr(session, "manual_keyframes_norm", []) or [])
    if len(manual_keyframes) < 2:
        raise RuntimeError("At least two manual keyframes are required for segmented classical tracking.")

    all_labels = manual_keyframes[0]["labels"]
    all_label_set = set(all_labels)

    for item in manual_keyframes[1:]:
        if set(item["labels"]) != all_label_set:
            raise RuntimeError("All manual keyframes must contain the same keypoint names.")
        if item["labels"] != all_labels:
            raise RuntimeError("All manual keyframes must contain the same label order after normalization.")

    frame_metrics_by_index = {}

    segment_count = len(manual_keyframes) - 1
    for seg_idx, (left, right) in enumerate(zip(manual_keyframes[:-1], manual_keyframes[1:]), start=1):
        start_frame = int(left["frame_index"])
        end_frame = int(right["frame_index"])

        if end_frame <= start_frame:
            raise RuntimeError("Manual keyframes must be strictly increasing.")

        session.progress = min(70, 10 + int((seg_idx - 1) / max(segment_count, 1) * 60))
        session.current_step = f"Running segmented classical tracking ({seg_idx}/{segment_count})"
        session.save(update_fields=["progress", "current_step", "updated_at"])

        forward_results = _track_segment_direction(
            cap=cap,
            width=width,
            height=height,
            start_frame=start_frame,
            end_frame=end_frame,
            labels=left["labels"],
            points_norm=left["points_norm"],
            direction="forward",
        )

        backward_results = _track_segment_direction(
            cap=cap,
            width=width,
            height=height,
            start_frame=end_frame,
            end_frame=start_frame,
            labels=right["labels"],
            points_norm=right["points_norm"],
            direction="backward",
        )

        for frame_index in range(start_frame, end_frame + 1):
            if frame_index in frame_metrics_by_index and frame_index != start_frame:
                continue

            if frame_index == start_frame:
                forward_item = forward_results[start_frame]
                metrics = _build_metrics_for_frame(
                    frame_index=frame_index,
                    fps=fps,
                    width=width,
                    height=height,
                    labels=left["labels"],
                    points_px=forward_item["points_px"],
                    status=forward_item["status"],
                    meta=forward_item["meta"],
                    tracking_source="manual",
                )
                frame_metrics_by_index[frame_index] = metrics
                continue

            if frame_index == end_frame:
                backward_item = backward_results[end_frame]
                metrics = _build_metrics_for_frame(
                    frame_index=frame_index,
                    fps=fps,
                    width=width,
                    height=height,
                    labels=right["labels"],
                    points_px=backward_item["points_px"],
                    status=backward_item["status"],
                    meta=backward_item["meta"],
                    tracking_source="manual",
                )
                frame_metrics_by_index[frame_index] = metrics
                continue

            forward_item = forward_results[frame_index]
            backward_item = backward_results[frame_index]

            fused_pts, fused_status, fused_meta = _fuse_segment_frame(
                frame_index=frame_index,
                start_frame=start_frame,
                end_frame=end_frame,
                labels=all_labels,
                forward_item=forward_item,
                backward_item=backward_item,
            )

            metrics = _build_metrics_for_frame(
                frame_index=frame_index,
                fps=fps,
                width=width,
                height=height,
                labels=all_labels,
                points_px=fused_pts,
                status=fused_status,
                meta=fused_meta,
                tracking_source="classical",
            )
            frame_metrics_by_index[frame_index] = metrics

    sorted_frame_indices = sorted(frame_metrics_by_index.keys())
    frame_metrics_rows = [frame_metrics_by_index[idx] for idx in sorted_frame_indices]
    frame_rows = [SessionAngleFrame(**_frame_model_kwargs(session, m)) for m in frame_metrics_rows]

    session.progress = 82
    session.current_step = "Rendering classical overlay"
    session.save(update_fields=["progress", "current_step", "updated_at"])

    tracker = _make_tracker()
    for frame_idx in sorted_frame_indices:
        frame = _read_frame(cap, frame_idx)
        metrics = frame_metrics_by_index[frame_idx]

        labels = metrics["keypoint_tracking_meta"]["labels"]
        points_norm = _coerce_points_px_array(
            metrics.get("keypoints_norm", []),
            expected_len=len(labels),
            context=f"metrics.keypoints_norm frame={frame_idx}",
            allow_none=True,
            allow_nan=True,
        )
        status = np.asarray(metrics["keypoint_tracking_meta"]["status"], dtype=np.uint8).reshape(-1)

        if len(points_norm) != len(labels) or len(status) != len(labels):
            raise RuntimeError(
                f"Overlay shape mismatch at frame {frame_idx}: "
                f"labels={len(labels)}, points={len(points_norm)}, status={len(status)}"
            )

        points_px = tracker.norm_to_px(points_norm, width, height).astype(np.float32)
        points_px = _coerce_points_px_array(
            points_px,
            expected_len=len(labels),
            context=f"overlay points_px frame={frame_idx}",
            allow_none=False,
            allow_nan=True,
        )
        writer.write(_draw_dynamic_overlay(frame, points_px, status, labels))

    return {
        "frame_rows": frame_rows,
        "frame_metrics_rows": frame_metrics_rows,
        "labels": all_labels,
        "tracking_start_frame": manual_keyframes[0]["frame_index"],
    }


@shared_task
def process_analysis_session_classical(session_id):
    session = AnalysisSession.objects.get(id=session_id, user__isnull=False)

    temp_video_path = None
    mp4_path = None
    writer = None
    cap = None

    try:
        session.tracking_mode = "classical"
        session.status = "processing"
        session.progress = 5
        session.current_step = (
            "Opening video for marker tracking"
            if getattr(session, "classical_submode", None) == "markers"
            else "Opening video"
        )
        session.error_message = ""
        session.save(
            update_fields=[
                "tracking_mode",
                "status",
                "progress",
                "current_step",
                "error_message",
                "updated_at",
            ]
        )

        cap = cv2.VideoCapture(session.video.path)
        if not cap.isOpened():
            raise RuntimeError("Could not open video")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

        session.fps = fps
        session.total_frames = total_frames
        session.save(update_fields=["fps", "total_frames", "updated_at"])

        writer, temp_video_path = _make_temp_avi_writer(width, height, fps)

        manual_keyframes = _extract_manual_keyframes(
            getattr(session, "manual_keyframes_norm", []) or []
        )

        if len(manual_keyframes) >= 2:
            run_result = _run_segmented_classical(
                session=session,
                cap=cap,
                fps=fps,
                total_frames=total_frames,
                width=width,
                height=height,
                writer=writer,
            )
        else:
            run_result = _run_single_seed_classical(
                session=session,
                cap=cap,
                fps=fps,
                total_frames=total_frames,
                width=width,
                height=height,
                writer=writer,
            )

        frame_rows = run_result["frame_rows"]
        frame_metrics_rows = run_result["frame_metrics_rows"]
        labels = run_result["labels"]
        tracking_start_frame = run_result["tracking_start_frame"]

        cap.release()
        cap = None
        writer.release()
        writer = None

        session.progress = 88
        session.current_step = "Computing gait metrics"
        session.save(update_fields=["progress", "current_step", "updated_at"])

        summary = compute_sequence_metrics_33(frame_metrics_rows)
        summary["tracking_mode"] = "classical"
        summary["tracking_start_frame"] = tracking_start_frame
        summary["classical_labels"] = labels
        summary["available_angle_series"] = _available_classical_angle_specs(labels)

        try:
            summary["normalized_curves"] = compute_normalized_curves_33(
                frame_metrics_rows,
                fps=fps,
            )
        except Exception:
            summary["normalized_curves"] = {}

        summary = _json_sanitize(summary)
        narrative = build_narrative_report_33(session, summary)

        session.progress = 94
        session.current_step = "Encoding classical overlay"
        session.save(update_fields=["progress", "current_step", "updated_at"])

        mp4_path = _transcode_avi_to_mp4(temp_video_path)

        with transaction.atomic():
            SessionAngleFrame.objects.filter(session=session).delete()
            if frame_rows:
                SessionAngleFrame.objects.bulk_create(frame_rows, batch_size=500)

            annotated_name = f"classical_{session.id}.mp4"
            with open(mp4_path, "rb") as f:
                session.annotated_video.save(annotated_name, File(f), save=False)

            session.summary_metrics = summary
            session.narrative_report = narrative
            session.total_frames = len(frame_metrics_rows)
            session.status = "done"
            session.progress = 100
            session.current_step = (
                "Marker tracking complete"
                if getattr(session, "classical_submode", None) == "markers"
                else "Classical tracking complete"
            )
            session.error_message = ""
            session.save()

    except Exception as exc:
        if cap is not None:
            cap.release()
        if writer is not None:
            writer.release()

        session.tracking_mode = "classical"
        session.status = "failed"
        session.progress = 0
        session.current_step = (
            "Marker tracking failed"
            if getattr(session, "classical_submode", None) == "markers"
            else "Classical tracking failed"
        )
        session.error_message = str(exc)
        session.save(
            update_fields=[
                "tracking_mode",
                "status",
                "progress",
                "current_step",
                "error_message",
                "updated_at",
            ]
        )
        raise

    finally:
        if temp_video_path and os.path.exists(temp_video_path):
            try:
                os.remove(temp_video_path)
            except OSError:
                pass

        if mp4_path and os.path.exists(mp4_path):
            try:
                os.remove(mp4_path)
            except OSError:
                pass