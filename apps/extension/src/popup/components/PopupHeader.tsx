import type { UIStatus } from '@hackathon/shared';
import { Brain } from 'lucide-react';

type PopupHeaderProps = {
  status: UIStatus;
  statusLabel: string;
  subtitle: string;
};

const statusBadgeStyle = (status: UIStatus): { bg: string; color: string; dot?: string } => {
  if (status === 'listening') return { bg: '#ECFDF5', color: '#059669', dot: '#10B981' };
  if (status === 'processing' || status === 'executing') return { bg: '#FFFBEB', color: '#B45309', dot: '#F59E0B' };
  if (status === 'success') return { bg: '#ECFDF5', color: '#059669' };
  if (status === 'error') return { bg: '#FEF2F2', color: '#DC2626' };
  return { bg: '#F1F5F9', color: '#64748B' };
};

export const PopupHeader = ({ status, statusLabel, subtitle }: PopupHeaderProps) => {
  const badge = statusBadgeStyle(status);
  return (
    <header
      className="flex items-center gap-2.5 px-3 py-2.5"
      style={{ background: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
        style={{ background: 'linear-gradient(135deg, #12A594 0%, #6366F1 100%)' }}
      >
        <Brain size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight" style={{ color: '#0F172A' }}>MedFlow AI</p>
        <p className="text-[10px] truncate" style={{ color: '#64748B' }}>{subtitle}</p>
      </div>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: badge.bg, color: badge.color }}
      >
        {badge.dot && (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: badge.dot }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
          </span>
        )}
        {statusLabel}
      </span>
    </header>
  );
};
