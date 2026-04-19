import type { ActiveTabState } from '../../types/messages';

type ActiveTabStatusProps = {
  tab: ActiveTabState;
  labels: {
    supported: string;
    unsupported: string;
    unavailable: string;
    noActive: string;
  };
};

export const ActiveTabStatus = ({ tab, labels }: ActiveTabStatusProps) => {
  const isReady = tab.contentScriptAvailable && tab.activeTabSupported;
  const isPartial = tab.contentScriptAvailable && !tab.activeTabSupported;

  const dotColor = isReady ? '#10B981' : isPartial ? '#F59E0B' : '#CBD5E1';
  const badgeLabel = isReady ? labels.supported : isPartial ? labels.unsupported : labels.unavailable;
  const badgeStyle = isReady
    ? { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' }
    : isPartial
      ? { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' }
      : { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' };

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 shadow-sm"
      style={{ border: '1px solid #E2E8F0', background: '#FFFFFF' }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
      <span className="flex-1 min-w-0 truncate text-[11px]" style={{ color: '#64748B' }}>
        {tab.domain || tab.title || labels.noActive}
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: badgeStyle.bg, color: badgeStyle.color, border: `1px solid ${badgeStyle.border}` }}
      >
        {badgeLabel}
      </span>
    </div>
  );
};
