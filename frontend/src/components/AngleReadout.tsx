import { Activity } from "lucide-react";
import type { GaitFrame } from "../lib/types";
import { JOINTS } from "../lib/data";

interface AngleReadoutProps {
  frame: GaitFrame;
}

export default function AngleReadout({ frame }: AngleReadoutProps) {
  return (
    <div className="bg-card border border-border rounded p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={13} className="text-blue-600" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">
          Current Frame
        </h3>
      </div>
      <p className="text-xs text-muted-foreground font-mono mb-3">
        Frame&nbsp;
        <span className="text-foreground">{String(frame.frame).padStart(4, "0")}</span>
        &nbsp;·&nbsp;{frame.time.toFixed(2)}s
      </p>

      <div className="space-y-0">
        {JOINTS.map(({ key, label, color }) => {
          const val = (frame as unknown as Record<string, number>)[key] ?? 0;
          return (
            <div
              key={key}
              className="flex items-center justify-between py-2 border-b border-border/60 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {val.toFixed(1)}
                <span className="text-muted-foreground text-xs">°</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
