'use client';

import { STAGES, type StageId } from '@/data/worldcup2026';

export function StageBar({ stage, onStage }: { stage: StageId; onStage: (s: StageId) => void }) {
  return (
    <div className="stagebar">
      {STAGES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={'stagechip' + (stage === s.id ? ' stagechip-on' : '')}
          onClick={() => onStage(s.id)}
        >
          {s.short}
        </button>
      ))}
    </div>
  );
}
