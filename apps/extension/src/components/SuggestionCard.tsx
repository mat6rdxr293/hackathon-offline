import type { WorkflowNextStep } from '@hackathon/shared';
import { Lightbulb } from 'lucide-react';

type SuggestionCardProps = {
  suggestion: WorkflowNextStep | null;
  onConfirm: (action: WorkflowNextStep['nextRecommendedAction']) => void;
  title: string;
  confirmLabel: (action: string) => string;
};

export const SuggestionCard = ({ suggestion, onConfirm, title, confirmLabel }: SuggestionCardProps) => {
  if (!suggestion) return null;

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'rgba(54,244,164,0.05)',
        border: '1px solid rgba(54,244,164,0.18)',
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 shrink-0 rounded-full p-1.5"
          style={{ background: 'rgba(54,244,164,0.12)', color: '#36F4A4' }}
        >
          <Lightbulb size={12} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium" style={{ color: '#36F4A4' }}>{title}</h3>
          <p className="mt-0.5 text-xs" style={{ color: '#A1A1AA' }}>{suggestion.message}</p>
          <button
            type="button"
            onClick={() => onConfirm(suggestion.nextRecommendedAction)}
            className="mt-2 text-xs font-medium transition active:scale-95"
            style={{
              background: '#FFFFFF',
              color: '#000000',
              borderRadius: 9999,
              padding: '6px 14px',
              border: '2px solid transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {confirmLabel(suggestion.nextRecommendedAction)}
          </button>
        </div>
      </div>
    </div>
  );
};
