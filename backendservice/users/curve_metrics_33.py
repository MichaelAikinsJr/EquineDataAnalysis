# analysis/curve_metrics_33.py

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.signal import find_peaks, savgol_filter


# ===== Your real 33-keypoint indices from KPT_ORDER =====
LEFT_HIND_DISTAL_IDX = 5       # "rear_coronet"
LEFT_FORE_DISTAL_IDX = 11      # "front_coronet"
RIGHT_HIND_DISTAL_IDX = 17     # "R_rear_coronet"
RIGHT_FORE_DISTAL_IDX = 22     # "R_front_coronet"


FORE_FIELDS = {
    "shoulder": {
        "left": "left_shoulder_angle_deg",
        "right": "right_shoulder_angle_deg",
    },
    "elbow": {
        "left": "left_elbow_angle_deg",
        "right": "right_elbow_angle_deg",
    },
    "knee": {
        "left": "left_knee_angle_deg",
        "right": "right_knee_angle_deg",
    },
    "fetlock": {
        "left": "left_fore_fetlock_angle_deg",
        "right": "right_fore_fetlock_angle_deg",
    },
    "protraction": {
        "left": "left_fore_protraction_deg",
        "right": "right_fore_protraction_deg",
    },
    "protraction_signed": {
        "left": "left_fore_protraction_signed_deg",
        "right": "right_fore_protraction_signed_deg",
    },
}

HIND_FIELDS = {
    "hip": {
        "left": "left_hip_angle_deg",
        "right": "right_hip_angle_deg",
    },
    "stifle": {
        "left": "left_stifle_angle_deg",
        "right": "right_stifle_angle_deg",
    },
    "hock": {
        "left": "left_hock_angle_deg",
        "right": "right_hock_angle_deg",
    },
    "fetlock": {
        "left": "left_hind_fetlock_angle_deg",
        "right": "right_hind_fetlock_angle_deg",
    },
    "protraction": {
        "left": "left_hind_protraction_deg",
        "right": "right_hind_protraction_deg",
    },
    "protraction_signed": {
        "left": "left_hind_protraction_signed_deg",
        "right": "right_hind_protraction_signed_deg",
    },
}


def _is_valid_number(x) -> bool:
    if x is None:
        return False
    try:
        x = float(x)
        return not (math.isnan(x) or math.isinf(x))
    except Exception:
        return False


def _safe_float(x) -> Optional[float]:
    return float(x) if _is_valid_number(x) else None


def _extract_keypoint_xy(keypoints_norm, idx: int) -> Tuple[Optional[float], Optional[float]]:
    if not isinstance(keypoints_norm, list):
        return None, None
    if idx < 0 or idx >= len(keypoints_norm):
        return None, None

    pt = keypoints_norm[idx]
    if not isinstance(pt, (list, tuple)) or len(pt) < 2:
        return None, None

    x = _safe_float(pt[0])
    y = _safe_float(pt[1])
    return x, y


def _interpolate_nans(arr: np.ndarray) -> np.ndarray:
    arr = np.asarray(arr, dtype=float)
    if arr.size == 0:
        return arr

    finite_mask = np.isfinite(arr)
    if finite_mask.all():
        return arr
    if not finite_mask.any():
        return np.full_like(arr, np.nan, dtype=float)

    idx = np.arange(arr.size)
    arr[~finite_mask] = np.interp(idx[~finite_mask], idx[finite_mask], arr[finite_mask])
    return arr


# def _smooth_signal(arr: np.ndarray, window: int = 11, polyorder: int = 2) -> np.ndarray:
#     arr = np.asarray(arr, dtype=float)
#     if arr.size < 5:
#         return arr

#     arr = _interpolate_nans(arr)

#     window = min(window, len(arr))
#     if window % 2 == 0:
#         window -= 1
#     if window < 5:
#         return arr

#     polyorder = min(polyorder, window - 1)
#     return savgol_filter(arr, window_length=window, polyorder=polyorder, mode="interp")


def _smooth_signal(values, window=11, polyorder=2):
    arr = np.asarray(values, dtype=float)

    finite = np.isfinite(arr)
    if finite.sum() < max(polyorder + 2, 5):
        return arr

    x = np.arange(len(arr))
    arr_filled = arr.copy()
    arr_filled[~finite] = np.interp(x[~finite], x[finite], arr[finite])

    if window > len(arr_filled):
        window = len(arr_filled) if len(arr_filled) % 2 == 1 else len(arr_filled) - 1

    if window < polyorder + 2:
        return arr_filled

    return savgol_filter(arr_filled, window_length=window, polyorder=polyorder, mode="interp")


def _resample_cycle_to_percent(values: List[float], n_points: int = 101) -> Optional[List[float]]:
    if not values or len(values) < 2:
        return None

    arr = np.asarray(values, dtype=float)
    if np.sum(np.isfinite(arr)) < max(2, len(arr) // 2):
        return None

    arr = _interpolate_nans(arr)

    x_old = np.linspace(0.0, 100.0, num=len(arr))
    x_new = np.linspace(0.0, 100.0, num=n_points)
    y_new = np.interp(x_new, x_old, arr)
    return y_new.tolist()


def _summarize_cycles(cycles_101: List[List[float]]) -> Dict:
    if not cycles_101:
        return {
            "cycles": [],
            "mean": [],
            "std": [],
            "summary": {},
        }

    arr = np.asarray(cycles_101, dtype=float)
    mean = np.nanmean(arr, axis=0)
    std = np.nanstd(arr, axis=0)

    return {
        "cycles": arr.tolist(),
        "mean": mean.tolist(),
        "std": std.tolist(),
        "summary": {
            "p0": float(mean[0]),
            "p25": float(mean[25]),
            "p50": float(mean[50]),
            "p75": float(mean[75]),
            "p100": float(mean[100]),
            "max": float(np.nanmax(mean)),
            "min": float(np.nanmin(mean)),
            "rom": float(np.nanmax(mean) - np.nanmin(mean)),
            "num_cycles": int(arr.shape[0]),
        },
    }


def _extract_signal_from_rows(frame_metrics_rows: List[Dict], field_name: str) -> np.ndarray:
    vals = []
    for row in frame_metrics_rows:
        vals.append(_safe_float(row.get(field_name)))
    return np.asarray(vals, dtype=float)


def _extract_distal_y_signal(frame_metrics_rows: List[Dict], keypoint_idx: int) -> np.ndarray:
    ys = []
    for row in frame_metrics_rows:
        keypoints_norm = row.get("keypoints_norm", [])
        _, y = _extract_keypoint_xy(keypoints_norm, keypoint_idx)
        ys.append(np.nan if y is None else y)
    return np.asarray(ys, dtype=float)


def _filter_quality_rows(frame_metrics_rows: List[Dict], min_quality: float = 0.2) -> List[Dict]:
    filtered = []
    for row in frame_metrics_rows:
        q = row.get("frame_quality_score")
        if q is None or float(q) >= min_quality:
            filtered.append(row)
    return filtered


def detect_stride_events_from_keypoints(
    frame_metrics_rows: List[Dict],
    keypoint_idx: int,
    fps: float,
    min_stride_sec: float = 0.30,
    prominence: float = 0.0025,
) -> List[int]:
    y = _extract_distal_y_signal(frame_metrics_rows, keypoint_idx)
    if len(y) < 10:
        return []

    y = _smooth_signal(y, window=11, polyorder=2)
    if np.sum(np.isfinite(y)) < 10:
        return []

    # In image coordinates, lower hoof/coronet often means larger y.
    # We detect local maxima in the smoothed y signal as contact-like events.
    signal = _interpolate_nans(y.copy())

    min_distance = max(3, int(fps * min_stride_sec))
    peaks, _ = find_peaks(signal, distance=min_distance, prominence=prominence)

    return [int(p) for p in peaks.tolist()]


def _extract_cycles_from_field(
    frame_metrics_rows: List[Dict],
    event_frames: List[int],
    field_name: str,
    max_jump_deg: float = 40.0,
    min_cycle_len: int = 6,
) -> List[List[float]]:
    signal = _extract_signal_from_rows(frame_metrics_rows, field_name)
    cycles = []

    if len(event_frames) < 2:
        return cycles

    for i in range(len(event_frames) - 1):
        s = event_frames[i]
        e = event_frames[i + 1]
        if e <= s:
            continue

        cycle = signal[s:e + 1]
        if len(cycle) < min_cycle_len:
            continue

        finite = np.isfinite(cycle)
        if finite.sum() < max(4, int(0.7 * len(cycle))):
            continue

        cycle_filled = _interpolate_nans(cycle.copy())
        diffs = np.abs(np.diff(cycle_filled))
        if len(diffs) > 0 and np.nanmax(diffs) > max_jump_deg:
            continue

        resampled = _resample_cycle_to_percent(cycle_filled.tolist(), n_points=101)
        if resampled is not None:
            cycles.append(resampled)

    return cycles


def _build_joint_side_payload(
    frame_metrics_rows: List[Dict],
    event_frames: List[int],
    field_name: str,
) -> Dict:
    cycles = _extract_cycles_from_field(frame_metrics_rows, event_frames, field_name)
    return _summarize_cycles(cycles)


def compute_normalized_curves_33(frame_metrics_rows: List[Dict], fps: float) -> Dict:
    rows = _filter_quality_rows(frame_metrics_rows, min_quality=0.2)

    right_fore_events = detect_stride_events_from_keypoints(rows, RIGHT_FORE_DISTAL_IDX, fps=fps)
    left_fore_events = detect_stride_events_from_keypoints(rows, LEFT_FORE_DISTAL_IDX, fps=fps)
    right_hind_events = detect_stride_events_from_keypoints(rows, RIGHT_HIND_DISTAL_IDX, fps=fps)
    left_hind_events = detect_stride_events_from_keypoints(rows, LEFT_HIND_DISTAL_IDX, fps=fps)

    result = {
        "x_percent": list(range(101)),
        "events": {
            "right_fore": right_fore_events,
            "left_fore": left_fore_events,
            "right_hind": right_hind_events,
            "left_hind": left_hind_events,
        },
        "fore": {},
        "hind": {},
    }

    for joint_name, sides in FORE_FIELDS.items():
        result["fore"][joint_name] = {
            "left": _build_joint_side_payload(rows, left_fore_events, sides["left"]),
            "right": _build_joint_side_payload(rows, right_fore_events, sides["right"]),
        }

    for joint_name, sides in HIND_FIELDS.items():
        result["hind"][joint_name] = {
            "left": _build_joint_side_payload(rows, left_hind_events, sides["left"]),
            "right": _build_joint_side_payload(rows, right_hind_events, sides["right"]),
        }

    return result