import os
import shutil
import subprocess
import uuid
import cv2

from django.core.files import File
from django.db import transaction
from ultralytics import YOLO

from .models import Analysis, AngleFrame
from .predict_angles import (
    estimate_orientation,
    visible_side_to_anatomical,
    compute_joint_angles,
    compute_limb_protraction,
)

MODEL_PATH = "/Users/addicted/Desktop/Equine/PFERD/runs/pose/horse_12kpt_yolo26n-3/weights/best.pt"


def process_analysis(analysis_id: int):
    analysis = Analysis.objects.get(id=analysis_id)
    analysis.status = "processing"
    analysis.error_message = ""
    analysis.save(update_fields=["status", "error_message", "updated_at"])

    cap = None
    writer = None
    temp_output_path = None
    final_output_path = None

    try:
        model = YOLO(MODEL_PATH)

        video_path = analysis.video.path
        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

        analysis.fps = fps
        analysis.total_frames = total_frames
        analysis.save(update_fields=["fps", "total_frames", "updated_at"])

        annotated_dir = os.path.join("media", "annotated_videos")
        os.makedirs(annotated_dir, exist_ok=True)

        base_name = uuid.uuid4().hex
        temp_output_path = os.path.join(annotated_dir, f"{base_name}_raw.mp4")
        final_output_path = os.path.join(annotated_dir, f"{base_name}.mp4")

        writer = cv2.VideoWriter(
            temp_output_path,
            cv2.VideoWriter_fourcc(*"mp4v"),
            min(fps, 30.0),
            (frame_width, frame_height),
        )

        if not writer.isOpened():
            raise RuntimeError("OpenCV VideoWriter failed to open.")

        frame_rows = []
        first_orientation = "unknown"
        first_visible_side = "unknown"
        frame_index = 0

        while True:
            ok, frame = cap.read()
            if not ok:
                break

            results = model(
                frame,
                imgsz=640,
                verbose=False,
                conf=0.6,
                iou=0.5,
                max_det=5,
            )[0]

            annotated_frame = results.plot()
            writer.write(annotated_frame)

            if results.keypoints is None or results.keypoints.xyn is None or len(results.keypoints.xyn) == 0:
                frame_index += 1
                continue

            kpts_norm = results.keypoints.xyn[0].cpu().numpy()[:, :2]
            kpts_list = kpts_norm.tolist()

            bbox_list = []
            if results.boxes is not None and len(results.boxes) > 0:
                bbox_list = results.boxes.xyxyn[0].cpu().numpy().tolist()

            orientation = estimate_orientation(kpts_norm)
            visible_side = visible_side_to_anatomical(orientation)
            joint_angles = compute_joint_angles(kpts_norm)
            protraction = compute_limb_protraction(kpts_norm, orientation)

            if first_orientation == "unknown":
                first_orientation = orientation
                first_visible_side = visible_side

            frame_rows.append(
                AngleFrame(
                    analysis=analysis,
                    frame_index=frame_index,
                    timestamp_sec=frame_index / fps,
                    keypoints_norm=kpts_list,
                    bbox_xyxy_norm=bbox_list,
                    **joint_angles,
                    **protraction,
                )
            )

            frame_index += 1

        writer.release()
        writer = None
        cap.release()
        cap = None

        output_to_save = temp_output_path

        ffmpeg_path = shutil.which("ffmpeg")
        if ffmpeg_path and os.path.exists(temp_output_path):
            ffmpeg_cmd = [
                ffmpeg_path,
                "-y",
                "-i", temp_output_path,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-profile:v", "baseline",
                "-level", "3.0",
                "-an",
                final_output_path,
            ]
            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)

            if result.returncode == 0 and os.path.exists(final_output_path):
                output_to_save = final_output_path
            else:
                analysis.error_message = f"ffmpeg failed, using raw video instead: {result.stderr}"

        with transaction.atomic():
            AngleFrame.objects.filter(analysis=analysis).delete()
            AngleFrame.objects.bulk_create(frame_rows, batch_size=500)

            if not os.path.exists(output_to_save):
                raise RuntimeError(f"Annotated output file missing: {output_to_save}")
            
            # if analysis.annotated_video:
            #     analysis.annotated_video.delete(save=False)

            with open(output_to_save, "rb") as f:
                filename = os.path.basename(output_to_save)
                analysis.annotated_video.save(filename, File(f), save=False)

            analysis.orientation = first_orientation
            analysis.visible_side = first_visible_side
            analysis.status = "done"
            analysis.save()

            if output_to_save == final_output_path and os.path.exists(temp_output_path):
                os.remove(temp_output_path)

    except Exception as e:
        analysis.status = "failed"
        analysis.error_message = repr(e)
        analysis.save(update_fields=["status", "error_message", "updated_at"])

    finally:
        if cap is not None:
            cap.release()
        if writer is not None:
            writer.release()
            writer = None

        if cap is not None:
            cap.release()
            cap = None

        output_to_save = temp_output_path

      