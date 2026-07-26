import React from 'react';

interface Props {
  value: 'yolo26' | 'classical';
  onChange: (value: 'yolo26' | 'classical') => void;
}

export function TrackingModeSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Tracking mode</h3>
      <label className="flex items-start gap-3">
        <input
          type="radio"
          checked={value === 'yolo26'}
          onChange={() => onChange('yolo26')}
        />
        <div>
          <div className="font-medium">YOLO26 Pose</div>
          <div className="text-sm text-gray-600">
            Best for difficult motion, occlusion, changing viewpoints, and full automation.
          </div>
        </div>
      </label>
      <label className="flex items-start gap-3">
        <input
          type="radio"
          checked={value === 'classical'}
          onChange={() => onChange('classical')}
        />
        <div>
          <div className="font-medium">Classical Tracking</div>
          <div className="text-sm text-gray-600">
            Best for clean sagittal side-view videos where you are happy to place 33 keypoints manually.
          </div>
        </div>
      </label>
    </div>
  );
}
