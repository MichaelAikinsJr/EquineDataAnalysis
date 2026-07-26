from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


class TrackStatus(IntEnum):
    LOST = 0
    TRACKED = 1
    HELD = 2
    MANUAL = 3


class ProposalSource(IntEnum):
    NONE = 0
    LK = 1
    VELOCITY = 2
    GRAPH = 3
    MANUAL = 4


@dataclass
class LKConfig:
    win_size: tuple = (31, 31)
    max_level: int = 4
    criteria: tuple = (
        cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT,
        30,
        0.01,
    )
    min_eig_threshold: float = 1e-6

    patch_radius: int = 18
    search_radius: int = 40
    min_match_score: float = 0.58
    anchor_min_match_score: float = 0.48
    fb_max_error_px: float = 8.0
    patch_error_max: float = 45.0
    max_jump_px: float = 34.0
    update_template_alpha: float = 0.02
    smooth_alpha: float = 0.20
    keep_lost_for_frames: int = 6

    use_ecc_global_warp: bool = False
    use_lk_fallback: bool = True
    use_clahe: bool = True
    use_gradient_channel: bool = False

    max_graph_residual: float = 0.35
    enable_graph_gate: bool = True
    enable_velocity_gate: bool = True
    enable_redetect: bool = True


@dataclass
class JointRuntime:
    lost_count: int = 0
    last_velocity: Optional[np.ndarray] = None
    last_confidence: float = 0.0
    status: int = int(TrackStatus.LOST)
    source: int = int(ProposalSource.NONE)
    graph_residual: float = np.inf
    template_updated: bool = False


class ClassicalKeypointTracker:
    def __init__(
        self,
        config: Optional[LKConfig] = None,
        labels: Optional[List[str]] = None,
        edges: Optional[List[Tuple[str, str]]] = None,
    ):
        self.cfg = config or LKConfig()
        self.labels = labels or []
        self.edges = edges or []
        self.lost_counts: Optional[np.ndarray] = None
        self.anchor_templates: List[Optional[np.ndarray]] = []
        self.adaptive_templates: List[Optional[np.ndarray]] = []
        self.prev_valid_mask: Optional[np.ndarray] = None
        self.runtime: List[JointRuntime] = []
        self.name_to_idx: Dict[str, int] = {}
        self.edge_map: Dict[int, List[int]] = {}
        self.initial_edge_lengths: Dict[Tuple[int, int], float] = {}
        self.initial_offsets: Dict[Tuple[int, int], np.ndarray] = {}

    @staticmethod
    def norm_to_px(points_norm: List[Optional[List[float]]], w: int, h: int) -> np.ndarray:
        pts = []
        for p in points_norm:
            if p is None or len(p) != 2:
                pts.append([np.nan, np.nan])
            else:
                pts.append([float(p[0]) * w, float(p[1]) * h])
        return np.asarray(pts, dtype=np.float32)

    @staticmethod
    def px_to_norm(points_px: np.ndarray, w: int, h: int) -> List[Optional[List[float]]]:
        out = []
        for x, y in points_px:
            if np.isnan(x) or np.isnan(y):
                out.append(None)
            else:
                out.append([float(x / w), float(y / h)])
        return out

    def to_gray(self, frame: np.ndarray) -> np.ndarray:
        gray = frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if self.cfg.use_clahe:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)
        return gray

    def estimate_global_warp(self, prev_gray: np.ndarray, next_gray: np.ndarray):
        if not self.cfg.use_ecc_global_warp:
            return None
        warp = np.eye(2, 3, dtype=np.float32)
        try:
            criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 1e-4)
            cv2.findTransformECC(prev_gray, next_gray, warp, cv2.MOTION_AFFINE, criteria)
            return warp
        except cv2.error:
            return None

    def _ensure_state(self, n: int):
        if self.lost_counts is None or len(self.lost_counts) != n:
            self.lost_counts = np.zeros((n,), dtype=np.int32)
        if len(self.anchor_templates) != n:
            self.anchor_templates = [None] * n
        if len(self.adaptive_templates) != n:
            self.adaptive_templates = [None] * n
        if self.prev_valid_mask is None or len(self.prev_valid_mask) != n:
            self.prev_valid_mask = np.zeros((n,), dtype=bool)
        if len(self.runtime) != n:
            self.runtime = [JointRuntime() for _ in range(n)]

    def _build_graph(self):
        self.edge_map = {i: [] for i in range(len(self.labels))}
        self.name_to_idx = {name: i for i, name in enumerate(self.labels)}
        for a, b in self.edges:
            if a in self.name_to_idx and b in self.name_to_idx:
                ia, ib = self.name_to_idx[a], self.name_to_idx[b]
                self.edge_map[ia].append(ib)
                self.edge_map[ib].append(ia)

    def _compute_initial_geometry(self, start_pts: np.ndarray):
        self._build_graph()
        for i, nbrs in self.edge_map.items():
            for j in nbrs:
                if i < j and np.all(np.isfinite(start_pts[i])) and np.all(np.isfinite(start_pts[j])):
                    d = float(np.linalg.norm(start_pts[i] - start_pts[j]))
                    self.initial_edge_lengths[(i, j)] = d
                    self.initial_edge_lengths[(j, i)] = d
                    self.initial_offsets[(i, j)] = (start_pts[i] - start_pts[j]).astype(np.float32)
                    self.initial_offsets[(j, i)] = (start_pts[j] - start_pts[i]).astype(np.float32)

    def _extract_patch(
        self,
        gray: np.ndarray,
        center_xy: np.ndarray,
        radius: Optional[int] = None,
    ) -> Optional[np.ndarray]:
        r = int(radius if radius is not None else self.cfg.patch_radius)
        h, w = gray.shape[:2]
        x = int(round(float(center_xy[0])))
        y = int(round(float(center_xy[1])))

        x1 = x - r
        y1 = y - r
        x2 = x + r + 1
        y2 = y + r + 1

        if x1 < 0 or y1 < 0 or x2 > w or y2 > h:
            return None

        patch = gray[y1:y2, x1:x2].copy()
        if patch.size == 0:
            return None

        patch = cv2.GaussianBlur(patch, (3, 3), 0)

        if self.cfg.use_gradient_channel:
            gx = cv2.Sobel(patch, cv2.CV_32F, 1, 0, ksize=3)
            gy = cv2.Sobel(patch, cv2.CV_32F, 0, 1, ksize=3)
            mag = cv2.magnitude(gx, gy)
            patch = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

        return patch

    def initialize_templates(self, start_gray: np.ndarray, start_pts: np.ndarray):
        self._ensure_state(len(start_pts))
        self._compute_initial_geometry(start_pts)
        for i, pt in enumerate(start_pts):
            if np.all(np.isfinite(pt)):
                patch = self._extract_patch(start_gray, pt)
                self.anchor_templates[i] = patch.copy() if patch is not None else None
                self.adaptive_templates[i] = patch.copy() if patch is not None else None
                self.prev_valid_mask[i] = patch is not None
                self.runtime[i].status = int(TrackStatus.MANUAL)
                self.runtime[i].source = int(ProposalSource.MANUAL)
            else:
                self.anchor_templates[i] = None
                self.adaptive_templates[i] = None
                self.prev_valid_mask[i] = False

    def _match_template_at_prediction(
        self,
        gray: np.ndarray,
        predicted_xy: np.ndarray,
        template_img: Optional[np.ndarray],
    ) -> Tuple[np.ndarray, float]:
        if template_img is None:
            return predicted_xy.astype(np.float32), float("nan")

        r = self.cfg.patch_radius
        sr = self.cfg.search_radius
        h, w = gray.shape[:2]
        x = int(round(float(predicted_xy[0])))
        y = int(round(float(predicted_xy[1])))

        tpl_h, tpl_w = template_img.shape[:2]
        x1 = x - sr - r
        y1 = y - sr - r
        x2 = x + sr + r + 1
        y2 = y + sr + r + 1

        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(w, x2)
        y2 = min(h, y2)

        search = gray[y1:y2, x1:x2]
        if search.shape[0] < tpl_h or search.shape[1] < tpl_w:
            return predicted_xy.astype(np.float32), float("nan")

        search_proc = cv2.GaussianBlur(search, (3, 3), 0)

        if self.cfg.use_gradient_channel:
            gx = cv2.Sobel(search_proc, cv2.CV_32F, 1, 0, ksize=3)
            gy = cv2.Sobel(search_proc, cv2.CV_32F, 0, 1, ksize=3)
            search_proc = cv2.normalize(cv2.magnitude(gx, gy), None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

        result = cv2.matchTemplate(search_proc, template_img, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result)

        best_x = x1 + max_loc[0] + tpl_w // 2
        best_y = y1 + max_loc[1] + tpl_h // 2

        return np.array([best_x, best_y], dtype=np.float32), float(max_val)

    def _smooth_point(self, prev_pt: np.ndarray, curr_pt: np.ndarray) -> np.ndarray:
        a = float(self.cfg.smooth_alpha)
        return ((1.0 - a) * prev_pt + a * curr_pt).astype(np.float32)

    def _predict_velocity(self, idx: int, prev_pt: np.ndarray) -> np.ndarray:
        vel = self.runtime[idx].last_velocity
        if vel is None or not np.all(np.isfinite(vel)):
            return prev_pt.copy()
        return (prev_pt + vel).astype(np.float32)

    def _graph_predict(
        self,
        idx: int,
        prev_pts: np.ndarray,
        accepted_pts: np.ndarray,
        accepted_mask: np.ndarray,
    ) -> np.ndarray:
        preds = []

        if self.runtime[idx].last_velocity is not None and np.all(np.isfinite(self.runtime[idx].last_velocity)):
            preds.append(prev_pts[idx] + self.runtime[idx].last_velocity)

        for nb in self.edge_map.get(idx, []):
            if accepted_mask[nb] and np.all(np.isfinite(accepted_pts[nb])):
                offset = self.initial_offsets.get((idx, nb))
                if offset is not None:
                    preds.append(accepted_pts[nb] + offset)

        if not preds:
            return prev_pts[idx].copy()

        return np.mean(np.vstack(preds), axis=0).astype(np.float32)

    def _graph_residual(
        self,
        idx: int,
        candidate_pt: np.ndarray,
        accepted_pts: np.ndarray,
        accepted_mask: np.ndarray,
    ) -> float:
        residuals = []
        for nb in self.edge_map.get(idx, []):
            if not accepted_mask[nb] or not np.all(np.isfinite(accepted_pts[nb])):
                continue
            base_len = self.initial_edge_lengths.get((idx, nb))
            if base_len is None or base_len < 1e-6:
                continue
            curr_len = float(np.linalg.norm(candidate_pt - accepted_pts[nb]))
            residuals.append(abs(curr_len - base_len) / (base_len + 1e-6))

        if not residuals:
            return 0.0
        return float(np.mean(residuals))

    def track_points_once(
        self,
        prev_gray: np.ndarray,
        next_gray: np.ndarray,
        prev_pts: np.ndarray,
    ) -> Dict[str, Any]:
        n = len(prev_pts)
        self._ensure_state(n)

        valid_mask = ~np.isnan(prev_pts[:, 0]) & ~np.isnan(prev_pts[:, 1])

        next_pts_all = prev_pts.copy()
        fb_error_all = np.full((n,), np.inf, dtype=np.float32)
        status_all = np.zeros((n,), dtype=np.uint8)
        err_all = np.full((n,), np.inf, dtype=np.float32)
        match_score_all = np.full((n,), np.nan, dtype=np.float32)
        anchor_match_score_all = np.full((n,), np.nan, dtype=np.float32)
        jump_all = np.full((n,), np.inf, dtype=np.float32)
        graph_res_all = np.full((n,), np.inf, dtype=np.float32)
        source_all = np.full((n,), int(ProposalSource.NONE), dtype=np.int32)
        status_code_all = np.full((n,), int(TrackStatus.LOST), dtype=np.int32)
        template_updated_all = np.zeros((n,), dtype=np.uint8)

        if not np.any(valid_mask):
            return {
                "next_pts": next_pts_all,
                "status": status_all,
                "status_code": status_code_all,
                "proposal_source": source_all,
                "err": err_all,
                "fb_error": fb_error_all,
                "match_score": match_score_all,
                "anchor_match_score": anchor_match_score_all,
                "jump": jump_all,
                "graph_residual": graph_res_all,
                "template_updated": template_updated_all,
            }

        pts0 = prev_pts[valid_mask].reshape(-1, 1, 2).astype(np.float32)

        initial = None
        flags = 0
        warp = self.estimate_global_warp(prev_gray, next_gray)
        if warp is not None:
            pts0_xy = pts0.reshape(-1, 2)
            ones = np.ones((pts0_xy.shape[0], 1), dtype=np.float32)
            pts0_h = np.concatenate([pts0_xy, ones], axis=1)
            pred = pts0_h @ warp.T
            initial = pred.reshape(-1, 1, 2).astype(np.float32)
            flags = cv2.OPTFLOW_USE_INITIAL_FLOW

        pts1, st_f, err_f = cv2.calcOpticalFlowPyrLK(
            prev_gray,
            next_gray,
            pts0,
            initial,
            winSize=self.cfg.win_size,
            maxLevel=self.cfg.max_level,
            criteria=self.cfg.criteria,
            flags=flags,
            minEigThreshold=self.cfg.min_eig_threshold,
        )

        if pts1 is None or st_f is None:
            return {
                "next_pts": next_pts_all,
                "status": status_all,
                "status_code": status_code_all,
                "proposal_source": source_all,
                "err": err_all,
                "fb_error": fb_error_all,
                "match_score": match_score_all,
                "anchor_match_score": anchor_match_score_all,
                "jump": jump_all,
                "graph_residual": graph_res_all,
                "template_updated": template_updated_all,
            }

        pts0_back, st_b, _ = cv2.calcOpticalFlowPyrLK(
            next_gray,
            prev_gray,
            pts1,
            None,
            winSize=self.cfg.win_size,
            maxLevel=self.cfg.max_level,
            criteria=self.cfg.criteria,
            minEigThreshold=self.cfg.min_eig_threshold,
        )

        if pts0_back is None or st_b is None:
            return {
                "next_pts": next_pts_all,
                "status": status_all,
                "status_code": status_code_all,
                "proposal_source": source_all,
                "err": err_all,
                "fb_error": fb_error_all,
                "match_score": match_score_all,
                "anchor_match_score": anchor_match_score_all,
                "jump": jump_all,
                "graph_residual": graph_res_all,
                "template_updated": template_updated_all,
            }

        pts0_xy = pts0.reshape(-1, 2)
        pts1_xy = pts1.reshape(-1, 2)
        pts0_back_xy = pts0_back.reshape(-1, 2)

        st_f = st_f.reshape(-1) == 1
        st_b = st_b.reshape(-1) == 1
        err_f_flat = np.zeros((len(pts0_xy),), dtype=np.float32) if err_f is None else err_f.reshape(-1).astype(np.float32)

        fb_error = np.linalg.norm(pts0_xy - pts0_back_xy, axis=1)
        lk_jump = np.linalg.norm(pts1_xy - pts0_xy, axis=1)
        valid_indices = np.where(valid_mask)[0]

        accepted_pts = prev_pts.copy()
        accepted_mask = np.zeros((n,), dtype=bool)

        for local_idx, global_idx in enumerate(valid_indices):
            prev_pt = prev_pts[global_idx].astype(np.float32)
            lk_pt = pts1_xy[local_idx].astype(np.float32)

            fb_error_all[global_idx] = fb_error[local_idx]
            err_all[global_idx] = err_f_flat[local_idx]

            lk_ok = (
                st_f[local_idx]
                and st_b[local_idx]
                and np.isfinite(fb_error[local_idx])
                and fb_error[local_idx] <= self.cfg.fb_max_error_px
                and np.isfinite(err_f_flat[local_idx])
                and err_f_flat[local_idx] <= self.cfg.patch_error_max
                and np.isfinite(lk_jump[local_idx])
                and lk_jump[local_idx] <= self.cfg.max_jump_px
            )

            candidates = []
            if lk_ok:
                candidates.append((ProposalSource.LK, lk_pt))
            if self.cfg.enable_velocity_gate:
                candidates.append((ProposalSource.VELOCITY, self._predict_velocity(global_idx, prev_pt)))
            if self.cfg.enable_redetect:
                candidates.append((ProposalSource.GRAPH, self._graph_predict(global_idx, prev_pts, accepted_pts, accepted_mask)))

            best_score = -np.inf
            best_source = ProposalSource.NONE
            best_anchor = np.nan
            best_adapt = np.nan
            best_graph_res = np.inf
            best_pt = None

            for source, proposal in candidates:
                adaptive_pt, adaptive_score = self._match_template_at_prediction(
                    next_gray,
                    proposal,
                    self.adaptive_templates[global_idx],
                )
                anchor_pt, anchor_score = self._match_template_at_prediction(
                    next_gray,
                    proposal,
                    self.anchor_templates[global_idx],
                )

                if np.isfinite(adaptive_score) and np.isfinite(anchor_score):
                    measured_pt = 0.7 * adaptive_pt + 0.3 * anchor_pt
                    score = 0.7 * float(adaptive_score) + 0.3 * float(anchor_score)
                elif np.isfinite(adaptive_score):
                    measured_pt = adaptive_pt
                    score = float(adaptive_score)
                elif np.isfinite(anchor_score):
                    measured_pt = anchor_pt
                    score = float(anchor_score)
                else:
                    measured_pt = proposal
                    score = -np.inf

                jump = float(np.linalg.norm(measured_pt - prev_pt))
                graph_res = self._graph_residual(global_idx, measured_pt, accepted_pts, accepted_mask) if self.cfg.enable_graph_gate else 0.0
                graph_ok = (not self.cfg.enable_graph_gate) or (graph_res <= self.cfg.max_graph_residual)
                template_ok = (
                    np.isfinite(score)
                    and score >= self.cfg.min_match_score
                    and jump <= self.cfg.max_jump_px
                    and graph_ok
                )

                if template_ok and score > best_score:
                    best_pt = measured_pt
                    best_score = score
                    best_source = source
                    best_anchor = anchor_score
                    best_adapt = adaptive_score
                    best_graph_res = graph_res

            if best_pt is None:
                self.runtime[global_idx].lost_count += 1
                if self.runtime[global_idx].lost_count <= self.cfg.keep_lost_for_frames:
                    next_pts_all[global_idx] = prev_pt
                    status_all[global_idx] = 1
                    status_code_all[global_idx] = int(TrackStatus.HELD)
                    source_all[global_idx] = int(ProposalSource.NONE)
                    self.runtime[global_idx].status = int(TrackStatus.HELD)
                else:
                    next_pts_all[global_idx] = np.array([np.nan, np.nan], dtype=np.float32)
                    status_all[global_idx] = 0
                    status_code_all[global_idx] = int(TrackStatus.LOST)
                    source_all[global_idx] = int(ProposalSource.NONE)
                    self.runtime[global_idx].status = int(TrackStatus.LOST)
                continue

            smoothed_pt = self._smooth_point(prev_pt, best_pt)
            next_pts_all[global_idx] = smoothed_pt
            status_all[global_idx] = 1
            status_code_all[global_idx] = int(TrackStatus.TRACKED)
            source_all[global_idx] = int(best_source)
            self.runtime[global_idx].lost_count = 0
            self.runtime[global_idx].status = int(TrackStatus.TRACKED)
            self.runtime[global_idx].source = int(best_source)
            self.runtime[global_idx].last_velocity = (smoothed_pt - prev_pt).astype(np.float32)
            self.runtime[global_idx].last_confidence = float(best_score)
            self.runtime[global_idx].graph_residual = float(best_graph_res)

            match_score_all[global_idx] = float(best_adapt) if np.isfinite(best_adapt) else np.nan
            anchor_match_score_all[global_idx] = float(best_anchor) if np.isfinite(best_anchor) else np.nan
            jump_all[global_idx] = float(np.linalg.norm(smoothed_pt - prev_pt))
            graph_res_all[global_idx] = float(best_graph_res)

            new_patch = self._extract_patch(next_gray, smoothed_pt)
            template_updated = 0
            if (
                new_patch is not None
                and np.isfinite(best_adapt)
                and np.isfinite(best_anchor)
                and best_adapt >= self.cfg.min_match_score
                and best_anchor >= self.cfg.anchor_min_match_score
                and jump_all[global_idx] <= self.cfg.max_jump_px
                and (not self.cfg.enable_graph_gate or best_graph_res <= self.cfg.max_graph_residual)
            ):
                old_patch = self.adaptive_templates[global_idx]
                if old_patch is not None and old_patch.shape == new_patch.shape:
                    self.adaptive_templates[global_idx] = cv2.addWeighted(
                        new_patch,
                        self.cfg.update_template_alpha,
                        old_patch,
                        1.0 - self.cfg.update_template_alpha,
                        0.0,
                    )
                else:
                    self.adaptive_templates[global_idx] = new_patch.copy()
                template_updated = 1

            template_updated_all[global_idx] = template_updated
            self.runtime[global_idx].template_updated = bool(template_updated)
            accepted_pts[global_idx] = smoothed_pt
            accepted_mask[global_idx] = True

        return {
            "next_pts": next_pts_all,
            "status": status_all,
            "status_code": status_code_all,
            "proposal_source": source_all,
            "err": err_all,
            "fb_error": fb_error_all,
            "match_score": match_score_all,
            "anchor_match_score": anchor_match_score_all,
            "jump": jump_all,
            "graph_residual": graph_res_all,
            "template_updated": template_updated_all,
        }