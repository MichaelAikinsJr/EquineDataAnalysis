from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

import numpy as np

KPT_ORDER = [
    "tuber_coxae", "hip", "stifle", "hock", "rear_fetlock", "rear_coronet",
    "wither", "shoulder", "elbow", "knee", "front_fetlock", "front_coronet",
    "R_tuber_coxae", "R_hip", "R_stifle", "R_hock", "R_rear_fetlock", "R_rear_coronet",
    "R_shoulder", "R_elbow", "R_knee", "R_front_fetlock", "R_front_coronet",
    "poll", "temple", "R_temple", "cheek", "R_cheek", "chin", "R_chin",
    "tail_1", "tail_2", "tail_3",
]
IDX = {name: i for i, name in enumerate(KPT_ORDER)}

LEFT_HIND = ["tuber_coxae", "hip", "stifle", "hock", "rear_fetlock", "rear_coronet"]
LEFT_FORE = ["wither", "shoulder", "elbow", "knee", "front_fetlock", "front_coronet"]
RIGHT_HIND = ["R_tuber_coxae", "R_hip", "R_stifle", "R_hock", "R_rear_fetlock", "R_rear_coronet"]
RIGHT_FORE = ["wither", "R_shoulder", "R_elbow", "R_knee", "R_front_fetlock", "R_front_coronet"]


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if np.isnan(value) or np.isinf(value):
        return None
    return value


def _point(k: np.ndarray, name: str) -> np.ndarray:
    return np.asarray(k[IDX[name]], dtype=float)


def _valid_point(p: np.ndarray) -> bool:
    return p.shape[0] >= 2 and not np.isnan(p[:2]).any()


def midpoint(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if not _valid_point(a) or not _valid_point(b):
        return np.array([np.nan, np.nan], dtype=float)
    return (a[:2] + b[:2]) / 2.0


def joint_angle_deg(p_prox, p_joint, p_dist):
    p_prox = np.asarray(p_prox, dtype=float)
    p_joint = np.asarray(p_joint, dtype=float)
    p_dist = np.asarray(p_dist, dtype=float)
    if not (_valid_point(p_prox) and _valid_point(p_joint) and _valid_point(p_dist)):
        return np.nan
    v1 = p_prox[:2] - p_joint[:2]
    v2 = p_dist[:2] - p_joint[:2]
    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return np.nan
    dot = np.clip(np.dot(v1 / n1, v2 / n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(dot)))


def segment_angle_vs_vertical(p_prox, p_dist):
    p_prox = np.asarray(p_prox, dtype=float)
    p_dist = np.asarray(p_dist, dtype=float)
    if not (_valid_point(p_prox) and _valid_point(p_dist)):
        return np.nan
    v = p_dist[:2] - p_prox[:2]
    n = np.linalg.norm(v)
    if n < 1e-6:
        return np.nan
    vert = np.array([0.0, 1.0])
    dot = np.clip(np.dot(v / n, vert), -1.0, 1.0)
    return float(np.degrees(np.arccos(dot)))


def estimate_orientation(kpts_xy):
    k = np.asarray(kpts_xy, dtype=float)
    wither = _point(k, "wither")
    pelvis_mid = midpoint(_point(k, "tuber_coxae"), _point(k, "R_tuber_coxae"))
    if not (_valid_point(wither) and _valid_point(pelvis_mid)):
        return "unknown"
    dx = wither[0] - pelvis_mid[0]
    if dx > 0.01:
        return "left_to_right"
    if dx < -0.01:
        return "right_to_left"
    return "unknown"


def visible_side_to_anatomical(orientation):
    if orientation == "left_to_right":
        return "right"
    if orientation == "right_to_left":
        return "left"
    return "unknown"


def signed_limb_angle_vs_vertical(p_prox, p_dist, orientation):
    unsigned = segment_angle_vs_vertical(p_prox, p_dist)
    if np.isnan(unsigned):
        return np.nan
    dx = float(np.asarray(p_dist)[0] - np.asarray(p_prox)[0])
    if orientation == "left_to_right":
        sign = np.sign(dx)
    elif orientation == "right_to_left":
        sign = -np.sign(dx)
    else:
        sign = 0.0
    return 0.0 if sign == 0 else float(unsigned * sign)


def compute_joint_angles_33(kpts_xy):
    k = np.asarray(kpts_xy, dtype=float)
    return {
        "left_hip_angle_deg": joint_angle_deg(_point(k, "tuber_coxae"), _point(k, "hip"), _point(k, "stifle")),
        "left_stifle_angle_deg": joint_angle_deg(_point(k, "hip"), _point(k, "stifle"), _point(k, "hock")),
        "left_hock_angle_deg": joint_angle_deg(_point(k, "stifle"), _point(k, "hock"), _point(k, "rear_fetlock")),
        "left_hind_fetlock_angle_deg": joint_angle_deg(_point(k, "hock"), _point(k, "rear_fetlock"), _point(k, "rear_coronet")),
        "left_shoulder_angle_deg": joint_angle_deg(_point(k, "wither"), _point(k, "shoulder"), _point(k, "elbow")),
        "left_elbow_angle_deg": joint_angle_deg(_point(k, "shoulder"), _point(k, "elbow"), _point(k, "knee")),
        "left_knee_angle_deg": joint_angle_deg(_point(k, "elbow"), _point(k, "knee"), _point(k, "front_fetlock")),
        "left_fore_fetlock_angle_deg": joint_angle_deg(_point(k, "knee"), _point(k, "front_fetlock"), _point(k, "front_coronet")),
        "right_hip_angle_deg": joint_angle_deg(_point(k, "R_tuber_coxae"), _point(k, "R_hip"), _point(k, "R_stifle")),
        "right_stifle_angle_deg": joint_angle_deg(_point(k, "R_hip"), _point(k, "R_stifle"), _point(k, "R_hock")),
        "right_hock_angle_deg": joint_angle_deg(_point(k, "R_stifle"), _point(k, "R_hock"), _point(k, "R_rear_fetlock")),
        "right_hind_fetlock_angle_deg": joint_angle_deg(_point(k, "R_hock"), _point(k, "R_rear_fetlock"), _point(k, "R_rear_coronet")),
        "right_shoulder_angle_deg": joint_angle_deg(_point(k, "wither"), _point(k, "R_shoulder"), _point(k, "R_elbow")),
        "right_elbow_angle_deg": joint_angle_deg(_point(k, "R_shoulder"), _point(k, "R_elbow"), _point(k, "R_knee")),
        "right_knee_angle_deg": joint_angle_deg(_point(k, "R_elbow"), _point(k, "R_knee"), _point(k, "R_front_fetlock")),
        "right_fore_fetlock_angle_deg": joint_angle_deg(_point(k, "R_knee"), _point(k, "R_front_fetlock"), _point(k, "R_front_coronet")),
    }


def compute_limb_protraction_33(kpts_xy, orientation):
    k = np.asarray(kpts_xy, dtype=float)
    return {
        "left_hind_protraction_signed_deg": signed_limb_angle_vs_vertical(_point(k, "hip"), _point(k, "rear_coronet"), orientation),
        "left_fore_protraction_signed_deg": signed_limb_angle_vs_vertical(_point(k, "shoulder"), _point(k, "front_coronet"), orientation),
        "right_hind_protraction_signed_deg": signed_limb_angle_vs_vertical(_point(k, "R_hip"), _point(k, "R_rear_coronet"), orientation),
        "right_fore_protraction_signed_deg": signed_limb_angle_vs_vertical(_point(k, "R_shoulder"), _point(k, "R_front_coronet"), orientation),
        "left_hind_protraction_deg": segment_angle_vs_vertical(_point(k, "hip"), _point(k, "rear_coronet")),
        "left_fore_protraction_deg": segment_angle_vs_vertical(_point(k, "shoulder"), _point(k, "front_coronet")),
        "right_hind_protraction_deg": segment_angle_vs_vertical(_point(k, "R_hip"), _point(k, "R_rear_coronet")),
        "right_fore_protraction_deg": segment_angle_vs_vertical(_point(k, "R_shoulder"), _point(k, "R_front_coronet")),
    }


def compute_trunk_metrics_33(kpts_xy):
    k = np.asarray(kpts_xy, dtype=float)
    pelvis_mid = midpoint(_point(k, "tuber_coxae"), _point(k, "R_tuber_coxae"))
    head_mid = midpoint(_point(k, "chin"), _point(k, "R_chin"))
    return {
        "poll_y_norm": _safe_float(_point(k, "poll")[1]),
        "wither_y_norm": _safe_float(_point(k, "wither")[1]),
        "pelvis_mid_y_norm": _safe_float(pelvis_mid[1]),
        "head_mid_y_norm": _safe_float(head_mid[1]),
        "left_pelvis_y_norm": _safe_float(_point(k, "tuber_coxae")[1]),
        "right_pelvis_y_norm": _safe_float(_point(k, "R_tuber_coxae")[1]),
        "pelvis_roll_diff_norm": _safe_float(_point(k, "tuber_coxae")[1] - _point(k, "R_tuber_coxae")[1]) if _valid_point(_point(k, "tuber_coxae")) and _valid_point(_point(k, "R_tuber_coxae")) else None,
        "tail_base_y_norm": _safe_float(_point(k, "tail_1")[1]),
    }


def compute_frame_quality_33(metrics: Dict[str, Any]) -> Optional[float]:
    angle_keys = [k for k in metrics if k.endswith("_angle_deg")]
    valid = [metrics[k] for k in angle_keys if metrics[k] is not None]
    if not angle_keys:
        return None
    return round(len(valid) / len(angle_keys) * 100.0, 1)


# def compute_frame_metrics_33(kpts_xy, bbox_xyxy_norm=None, frame_index=None, timestamp_sec=None):
#     k = np.asarray(kpts_xy, dtype=float)
#     orientation = estimate_orientation(k)
#     visible_side = visible_side_to_anatomical(orientation)
#     joint_angles = compute_joint_angles_33(k)
#     protraction = compute_limb_protraction_33(k, orientation)
#     trunk = compute_trunk_metrics_33(k)
#     metrics = {
#         "frame_index": frame_index,
#         "timestamp_sec": timestamp_sec,
#         "orientation": orientation,
#         "visible_side": visible_side,
#         "keypoints_norm": k.tolist(),
#         "bbox_xyxy_norm": list(bbox_xyxy_norm) if bbox_xyxy_norm is not None else [],
#     }
#     for src in (joint_angles, protraction, trunk):
#         for key, value in src.items():
#             metrics[key] = _safe_float(value)
#     metrics["frame_quality_score"] = compute_frame_quality_33(metrics)
#     return metrics
def compute_frame_metrics_33(kpts_xy, bbox_xyxy_norm=None, frame_index=None, timestamp_sec=None):
    k_list = list(kpts_xy)

    if len(k_list) != 33:
        raise ValueError(f"Expected 33 keypoints, got {len(k_list)}")

    k = np.array(
        [
            p if (p is not None and len(p) == 2) else [np.nan, np.nan]
            for p in k_list
        ],
        dtype=float,
    )

    orientation = estimate_orientation(k)
    visible_side = visible_side_to_anatomical(orientation)
    joint_angles = compute_joint_angles_33(k)
    protraction = compute_limb_protraction_33(k, orientation)
    trunk = compute_trunk_metrics_33(k)

    keypoints_json = [
        [None, None] if np.isnan(p[0]) or np.isnan(p[1]) else [float(p[0]), float(p[1])]
        for p in k
    ]

    metrics = {
        "frame_index": frame_index,
        "timestamp_sec": timestamp_sec,
        "orientation": orientation,
        "visible_side": visible_side,
        "keypoints_norm": keypoints_json,
        "bbox_xyxy_norm": list(bbox_xyxy_norm) if bbox_xyxy_norm is not None else [],
    }

    for src in (joint_angles, protraction, trunk):
        for key, value in src.items():
            metrics[key] = _safe_float(value)

    metrics["frame_quality_score"] = compute_frame_quality_33(metrics)
    return metrics

def _numeric_series(rows, attr: str) -> List[float]:
    vals = []
    for row in rows:
        v = row.get(attr) if isinstance(row, dict) else getattr(row, attr, None)
        if v is None:
            continue
        try:
            v = float(v)
        except (TypeError, ValueError):
            continue
        if np.isnan(v) or np.isinf(v):
            continue
        vals.append(v)
    return vals


def _categorical_series(rows, attr: str) -> List[str]:
    vals = []
    for row in rows:
        v = row.get(attr) if isinstance(row, dict) else getattr(row, attr, None)
        if v is None:
            continue
        vals.append(str(v))
    return vals


def _rom(values: List[float]) -> Optional[float]:
    return round(max(values) - min(values), 3) if values else None


def _mean_abs_diff(a: List[float], b: List[float]) -> Optional[float]:
    n = min(len(a), len(b))
    if n == 0:
        return None
    return round(float(np.mean(np.abs(np.array(a[:n]) - np.array(b[:n])))), 4)


def _majority_or_unknown(values):
    cleaned = [v for v in values if v and v != "unknown"]
    if not cleaned:
        return "unknown"
    return Counter(cleaned).most_common(1)[0][0]


def compute_sequence_metrics_33(frame_rows):
    orientation = _majority_or_unknown(_categorical_series(frame_rows, "orientation"))
    visible_side = _majority_or_unknown(_categorical_series(frame_rows, "visible_side"))

    summary = {
        "orientation": orientation,
        "visible_side": visible_side,
        "quality_score": round(float(np.mean(_numeric_series(frame_rows, "frame_quality_score"))), 1)
        if _numeric_series(frame_rows, "frame_quality_score") else None,
        "poll_rom_norm": _rom(_numeric_series(frame_rows, "poll_y_norm")),
        "wither_rom_norm": _rom(_numeric_series(frame_rows, "wither_y_norm")),
        "pelvis_rom_norm": _rom(_numeric_series(frame_rows, "pelvis_mid_y_norm")),
        "pelvis_roll_mean_abs_norm": round(
            float(np.mean(np.abs(_numeric_series(frame_rows, "pelvis_roll_diff_norm")))), 4
        ) if _numeric_series(frame_rows, "pelvis_roll_diff_norm") else None,
        "fore_protraction_asymmetry_deg": _mean_abs_diff(
            _numeric_series(frame_rows, "left_fore_protraction_deg"),
            _numeric_series(frame_rows, "right_fore_protraction_deg"),
        ),
        "hind_protraction_asymmetry_deg": _mean_abs_diff(
            _numeric_series(frame_rows, "left_hind_protraction_deg"),
            _numeric_series(frame_rows, "right_hind_protraction_deg"),
        ),
    }

    rom_angle_keys = [
        "left_hip_angle_deg", "left_stifle_angle_deg", "left_hock_angle_deg", "left_hind_fetlock_angle_deg",
        "left_shoulder_angle_deg", "left_elbow_angle_deg", "left_knee_angle_deg", "left_fore_fetlock_angle_deg",
        "right_hip_angle_deg", "right_stifle_angle_deg", "right_hock_angle_deg", "right_hind_fetlock_angle_deg",
        "right_shoulder_angle_deg", "right_elbow_angle_deg", "right_knee_angle_deg", "right_fore_fetlock_angle_deg",
    ]

    for key in rom_angle_keys:
        summary[key.replace("_angle_deg", "_rom_deg")] = _rom(_numeric_series(frame_rows, key))

    return summary


def build_narrative_report_33(session_like, summary: Dict[str, Any]) -> str:
    horse_name = getattr(getattr(session_like, "horse", None), "name", "Unknown horse")
    gait = getattr(session_like, "gait", "unknown")
    parts = [
        f"Horse: {horse_name}.",
        f"Gait: {gait}.",
        f"Visible side: {summary.get('visible_side') or 'unknown'}.",
        f"Orientation: {summary.get('orientation') or 'unknown'}.",
    ]
    q = summary.get("quality_score")
    if q is not None:
        parts.append(f"Overall frame quality score was {q}/100.")
    fore_ai = summary.get("fore_protraction_asymmetry_deg")
    hind_ai = summary.get("hind_protraction_asymmetry_deg")
    if fore_ai is not None:
        parts.append(
            f"Forelimb protraction asymmetry averaged {round(fore_ai, 2)} degrees; this {'suggests review for forelimb asymmetry' if fore_ai > 8 else 'does not exceed the current heuristic review threshold'}.")
    if hind_ai is not None:
        parts.append(
            f"Hindlimb protraction asymmetry averaged {round(hind_ai, 2)} degrees; this {'suggests review for hindlimb asymmetry' if hind_ai > 8 else 'does not exceed the current heuristic review threshold'}.")
    poll_rom = summary.get("poll_rom_norm")
    pelvis_rom = summary.get("pelvis_rom_norm")
    if poll_rom is not None and pelvis_rom is not None:
        parts.append(f"Poll vertical range was {round(poll_rom, 4)} normalized units and pelvis vertical range was {round(pelvis_rom, 4)} normalized units.")
    parts.append("These outputs are decision-support heuristics derived from 2D pose and should be interpreted alongside clinical assessment.")
    return " ".join(parts)
