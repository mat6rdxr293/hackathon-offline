import type { UIStatus } from '@hackathon/shared';

const statusConfig: Record<UIStatus, { bg: string; text: string; dot?: string }> = {
  idle:       { bg: 'rgba(255,255,255,0.06)', text: '#71717A' },
  listening:  { bg: 'rgba(54,244,164,0.15)',  text: '#36F4A4', dot: '#36F4A4' },
  processing: { bg: 'rgba(217,119,6,0.15)',   text: '#d97706', dot: '#d97706' },
  executing:  { bg: 'rgba(20,184,166,0.15)',  text: '#5eead4', dot: '#5eead4' },
  success:    { bg: 'rgba(54,244,164,0.12)',  text: '#36F4A4' },
  error:      { bg: 'rgba(220,38,38,0.15)',   text: '#f87171' },
};

type Props = {
  status: UIStatus;
  label: string;
};

export const StatusBadge = ({ status, label }: Props) => {
  const cfg = statusConfig[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: cfg.dot }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: cfg.dot }}
          />
        </span>
      )}
      {label}
    </span>
  );
};
