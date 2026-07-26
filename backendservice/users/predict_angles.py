from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from ultralytics import YOLO


TUBER_COXAE = 0
HIP = 1
STIFLE = 2
HOCK = 3
HIND_FETLOCK = 4
HIND_CORONET = 5
WITHER = 6
SHOULDER = 7
ELBOW = 8
KNEE = 9
FORE_FETLOCK = 10
FORE_CORONET = 11


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


def _safe_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return list(value)


def joint_angle_deg(p_prox, p_joint, p_dist):
    p_prox = np.asarray(p_prox, dtype=float)
    p_joint = np.asarray(p_joint, dtype=float)
    p_dist = np.asarray(p_dist, dtype=float)

    v1 = p_prox - p_joint
    v2 = p_dist - p_joint

    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return np.nan

    v1_u = v1 / n1
    v2_u = v2 / n2

    dot = np.clip(np.dot(v1_u, v2_u), -1.0, 1.0)
    angle_rad = np.arccos(dot)
    return float(np.degrees(angle_rad))


def segment_angle_vs_vertical(p_prox, p_dist):
    p_prox = np.asarray(p_prox, dtype=float)
    p_dist = np.asarray(p_dist, dtype=float)

    v = p_dist - p_prox
    n = np.linalg.norm(v)
    if n < 1e-6:
        return np.nan

    v_u = v / n
    v_vert = np.array([0.0, 1.0])

    dot = np.clip(np.dot(v_u, v_vert), -1.0, 1.0)
    angle_rad = np.arccos(dot)
    return float(np.degrees(angle_rad))


def estimate_orientation(kpts_xy):
    k = np.asarray(kpts_xy, dtype=float)

    wx, wy = k[WITHER]
    tx, ty = k[TUBER_COXAE]

    if np.any(np.isnan([wx, wy, tx, ty])):
        return "unknown"

    dx = wx - tx

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

    p_prox = np.asarray(p_prox, dtype=float)
    p_dist = np.asarray(p_dist, dtype=float)

    dx = p_dist[0] - p_prox[0]

    if orientation == "left_to_right":
        sign = np.sign(dx)
    elif orientation == "right_to_left":
        sign = -np.sign(dx)
    else:
        sign = 0.0

    if sign == 0.0:
        return 0.0

    return float(unsigned * sign)


def compute_joint_angles(kpts_xy):
    k = np.asarray(kpts_xy, dtype=float)
    return {
        "hip_angle_deg": joint_angle_deg(k[TUBER_COXAE], k[HIP], k[STIFLE]),
        "stifle_angle_deg": joint_angle_deg(k[HIP], k[STIFLE], k[HOCK]),
        "hock_angle_deg": joint_angle_deg(k[STIFLE], k[HOCK], k[HIND_FETLOCK]),
        "hind_fetlock_angle_deg": joint_angle_deg(k[HOCK], k[HIND_FETLOCK], k[HIND_CORONET]),
        "shoulder_angle_deg": joint_angle_deg(k[WITHER], k[SHOULDER], k[ELBOW]),
        "elbow_angle_deg": joint_angle_deg(k[SHOULDER], k[ELBOW], k[KNEE]),
        "knee_angle_deg": joint_angle_deg(k[ELBOW], k[KNEE], k[FORE_FETLOCK]),
        "fore_fetlock_angle_deg": joint_angle_deg(k[KNEE], k[FORE_FETLOCK], k[FORE_CORONET]),
    }


def compute_limb_protraction(kpts_xy, orientation):
    k = np.asarray(kpts_xy, dtype=float)

    hind_signed = signed_limb_angle_vs_vertical(k[HIP], k[HIND_CORONET], orientation)
    fore_signed = signed_limb_angle_vs_vertical(k[SHOULDER], k[FORE_CORONET], orientation)

    hind_unsigned = segment_angle_vs_vertical(k[HIP], k[HIND_CORONET])
    fore_unsigned = segment_angle_vs_vertical(k[SHOULDER], k[FORE_CORONET])

    return {
        "hind_protraction_signed_deg": hind_signed,
        "fore_protraction_signed_deg": fore_signed,
        "hind_protraction_deg": hind_unsigned,
        "fore_protraction_deg": fore_unsigned,
    }


def _extract_first_detection(result) -> Optional[Dict[str, Any]]:
    if result.keypoints is None or len(result.keypoints) == 0:
        return None

    kpts_norm = result.keypoints.xyn[0].cpu().numpy()[:, :2]

    bbox_norm = []
    if result.boxes is not None and len(result.boxes) > 0 and getattr(result.boxes, "xyxyn", None) is not None:
        bbox_norm = result.boxes.xyxyn[0].cpu().numpy().tolist()

    orientation = estimate_orientation(kpts_norm)
    visible_side = visible_side_to_anatomical(orientation)
    angles = compute_joint_angles(kpts_norm)
    protraction = compute_limb_protraction(kpts_norm, orientation)

    out = {
        "orientation": orientation,
        "visible_side": visible_side,
        "keypoints_norm": kpts_norm.tolist(),
        "bbox_xyxy_norm": _safe_list(bbox_norm),
    }

    for key, value in angles.items():
        out[key] = _safe_float(value)

    for key, value in protraction.items():
        out[key] = _safe_float(value)

    return out


def analyze_image(
    image_path: str,
    model_path: str,
    imgsz: int = 640,
    save_annotated: bool = False,
    output_dir: str = "output",
) -> Optional[Dict[str, Any]]:
    model = YOLO(model_path)
    result = model(image_path, imgsz=imgsz, verbose=False)[0]

    parsed = _extract_first_detection(result)
    if parsed is None:
        return None

    parsed["image_id"] = Path(image_path).stem

    if save_annotated:
        out_dir = Path(output_dir)
        out_dir.mkdir(exist_ok=True)
        annotated = result.plot()
        out_file = out_dir / f"{Path(image_path).stem}_pose.jpg"
        cv2.imwrite(str(out_file), annotated)
        parsed["annotated_image_path"] = str(out_file)

    return parsed


def analyze_video(
    video_path: str,
    model_path: str,
    imgsz: int = 640,
    save_annotated_video: bool = False,
    output_dir: str = "output",
    stride: int = 1,
) -> Dict[str, Any]:
    model = YOLO(model_path)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    if fps <= 0:
        fps = 30.0

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    writer = None
    annotated_video_path = None

    if save_annotated_video:
        out_dir = Path(output_dir)
        out_dir.mkdir(exist_ok=True)
        annotated_video_path = str(out_dir / f"{Path(video_path).stem}_annotated.mp4")
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(annotated_video_path, fourcc, fps, (width, height))

    frames: List[Dict[str, Any]] = []
    orientation_counts = {"left_to_right": 0, "right_to_left": 0, "unknown": 0}
    visible_side_counts = {"left": 0, "right": 0, "unknown": 0}

    frame_index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if stride > 1 and frame_index % stride != 0:
            frame_index += 1
            continue

        result = model(frame, imgsz=imgsz, verbose=False)[0]
        parsed = _extract_first_detection(result)

        if parsed is not None:
            parsed["frame_index"] = frame_index
            parsed["timestamp_sec"] = float(frame_index / fps)
            frames.append(parsed)

            orientation_counts[parsed["orientation"]] = orientation_counts.get(parsed["orientation"], 0) + 1
            visible_side_counts[parsed["visible_side"]] = visible_side_counts.get(parsed["visible_side"], 0) + 1

        if writer is not None:
            annotated = result.plot()
            writer.write(annotated)

        frame_index += 1

    cap.release()
    if writer is not None:
        writer.release()

    orientation = max(orientation_counts, key=orientation_counts.get) if frames else "unknown"
    visible_side = max(visible_side_counts, key=visible_side_counts.get) if frames else "unknown"

    return {
        "video_path": video_path,
        "fps": float(fps),
        "processed_frame_count": len(frames),
        "source_frame_count": int(frame_index),
        "orientation": orientation,
        "visible_side": visible_side,
        "frames": frames,
        "annotated_video_path": annotated_video_path,
    }