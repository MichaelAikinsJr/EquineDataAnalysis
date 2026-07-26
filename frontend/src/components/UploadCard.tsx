import { useRef, useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  FileVideo,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";
import api from "../api";

type UploadState = "idle" | "uploading" | "done" | "error";
type TrackingMode = "yolo26" | "classical";
type ClassicalSubmode = "markerless" | "markers";

export default function UploadCard() {
  const [isDragging, setIsDragging] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState("");
  const [selectedHorse, setSelectedHorse] = useState("");
  const [gait, setGait] = useState("Trot");
  const [notes, setNotes] = useState("");
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("yolo26");
  const [classicalSubmode, setClassicalSubmode] =
    useState<ClassicalSubmode>("markerless");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Please upload a valid video file.");
      setState("error");
      return;
    }

    try {
      setError("");
      setFilename(file.name);
      setState("uploading");
      setProgress(0);

      const formData = new FormData();
      formData.append("video", file);
      formData.append("horse_name", selectedHorse);
      formData.append("gait", gait);
      formData.append("notes", notes);
      formData.append("tracking_mode", trackingMode);

      if (trackingMode === "classical") {
        formData.append("classical_submode", classicalSubmode);
      }

      const res = await api.post("/api/sessions/upload/", formData, {
        onUploadProgress: (event) => {
          if (event.total) {
            const percent = Math.round((event.loaded * 100) / event.total);
            setProgress(percent);
          }
        },
      });

      const session =
        res.data.session ??
        {
          id: res.data.session_id,
          tracking_mode: trackingMode,
          classical_submode: trackingMode === "classical" ? classicalSubmode : null,
        };

      const sessionId = session.id;
      const mode = session.tracking_mode as TrackingMode;
      const submode = (session.classical_submode ?? null) as ClassicalSubmode | null;

      setProgress(100);
      setState("done");

      setTimeout(() => {
        if (mode === "classical") {
          if (submode === "markers") {
            navigate(`/sessions/${sessionId}/classical-markers-setup`);
          } else {
            navigate(`/sessions/${sessionId}/classical-setup`);
          }
        } else {
          navigate(`/processing/${sessionId}`);
        }
      }, 500);
    } catch (err: any) {
      console.error("Upload error:", err);
      setState("error");
      setError(err.response?.data?.detail || "Upload failed. Please try again.");
    }
  };

  const reset = () => {
    setState("idle");
    setProgress(0);
    setFilename("");
    setError("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <Layout current="upload">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Upload Video</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose analysis mode, then upload a sagittal-plane gait video
          </p>
        </div>

        <div className="bg-white border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Analysis Mode
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTrackingMode("yolo26")}
              className={`text-left rounded-lg border p-4 transition ${
                trackingMode === "yolo26"
                  ? "border-teal-700 bg-teal-50"
                  : "border-border hover:border-teal-400"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={trackingMode === "yolo26"}
                  onChange={() => setTrackingMode("yolo26")}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">YOLO26 Pose</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Best for complex motion, occlusion, and full automatic analysis.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTrackingMode("classical")}
              className={`text-left rounded-lg border p-4 transition ${
                trackingMode === "classical"
                  ? "border-teal-700 bg-teal-50"
                  : "border-border hover:border-teal-400"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={trackingMode === "classical"}
                  onChange={() => setTrackingMode("classical")}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Classical Tracking</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose between markerless classical tracking and physical-marker tracking.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {trackingMode === "classical" && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Classical Type
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setClassicalSubmode("markerless")}
                  className={`text-left rounded-lg border p-4 transition ${
                    classicalSubmode === "markerless"
                      ? "border-teal-700 bg-teal-50"
                      : "border-border hover:border-teal-400"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      checked={classicalSubmode === "markerless"}
                      onChange={() => setClassicalSubmode("markerless")}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Markerless</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use the normal classical setup you already built, where the user chooses a frame and clicks points manually.
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setClassicalSubmode("markers")}
                  className={`text-left rounded-lg border p-4 transition ${
                    classicalSubmode === "markers"
                      ? "border-teal-700 bg-teal-50"
                      : "border-border hover:border-teal-400"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      checked={classicalSubmode === "markers"}
                      onChange={() => setClassicalSubmode("markers")}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Markers</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use marker keyframes and optical-flow tracking between them.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          <div className="rounded-md bg-slate-50 border border-border px-3 py-2 text-xs text-muted-foreground">
            {trackingMode === "yolo26"
              ? "YOLO26 will begin analysis automatically after upload."
              : classicalSubmode === "markers"
              ? "Markers mode will open marker keyframe setup after upload."
              : "Markerless classical mode will open the existing classical setup page after upload so you can choose a frame and click the points to track."}
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Session Details
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Horse
              </label>
              <input
                value={selectedHorse}
                onChange={(e) => setSelectedHorse(e.target.value)}
                placeholder="Enter horse name"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-input-background focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Gait
              </label>
              <div className="relative">
                <select
                  value={gait}
                  onChange={(e) => setGait(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-input-background appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700"
                >
                  {["Walk", "Trot", "Canter", "Stand"].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about the recording session"
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-input-background resize-none focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700"
            />
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Video File
          </h2>

          {state === "idle" ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg cursor-pointer transition-all py-12 flex flex-col items-center gap-3 ${
                isDragging
                  ? "border-teal-500 bg-teal-50"
                  : "border-muted hover:border-teal-400 hover:bg-teal-50/20"
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center">
                <Upload size={20} className="text-teal-700" />
              </div>

              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Drop video here or <span className="text-teal-700 hover:underline">browse</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  MP4 · MOV · AVI · up to 2 GB · sagittal plane, single camera
                </p>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 py-3 px-4 bg-muted/30 rounded-lg border border-border/50">
                <FileVideo size={16} className="text-teal-700 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{filename}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {state === "uploading"
                      ? `Uploading… ${Math.round(progress)}%`
                      : state === "done"
                      ? "Upload complete"
                      : "Upload failed"}
                  </p>
                </div>

                {state === "done" ? (
                  <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                ) : (
                  <button onClick={reset}>
                    <X size={14} className="text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>

              {state === "uploading" && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 rounded-full transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {state === "done" && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  <Loader2 size={12} className="animate-spin" />
                  {trackingMode === "classical"
                    ? classicalSubmode === "markers"
                      ? "Upload complete. Opening marker tracking setup…"
                      : "Upload complete. Opening classical tracking setup…"
                    : "Upload complete. Starting analysis…"}
                </div>
              )}

              {state === "error" && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-border rounded-lg p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Video Requirements
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>· Camera positioned perpendicular to direction of travel (sagittal plane)</li>
            <li>· Minimum 240p resolution, 25 fps or above</li>
            <li>· Horse should fill at least 50% of frame width</li>
            <li>· Even lighting, avoid strong back-light</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}