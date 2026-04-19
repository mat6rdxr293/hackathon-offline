import { ExternalLink, PanelRight } from 'lucide-react';

type LaunchPanelButtonProps = {
  onOpenPanel: () => void;
  disabled?: boolean;
  label: string;
  panelVisible?: boolean;
};

export const LaunchPanelButton = ({ onOpenPanel, disabled, label, panelVisible }: LaunchPanelButtonProps) => (
  <button
    type="button"
    onClick={onOpenPanel}
    disabled={disabled}
    className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98]"
    style={
      disabled
        ? { background: '#F1F5F9', color: '#94A3B8', border: 'none', cursor: 'not-allowed' }
        : panelVisible
          ? { background: '#F0FDFA', color: '#0F766E', border: '1px solid #99F6E4', cursor: 'pointer' }
          : { background: 'linear-gradient(135deg, #12A594 0%, #6366F1 100%)', color: '#FFFFFF', border: 'none', cursor: 'pointer' }
    }
    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.opacity = '0.9'; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
  >
    {panelVisible ? <PanelRight size={15} /> : <ExternalLink size={15} />}
    {label}
  </button>
);
