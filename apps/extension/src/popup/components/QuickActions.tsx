import { BookOpen, CalendarDays, ClipboardList } from 'lucide-react';

type ActionIcon = 'clipboard' | 'book' | 'calendar';

type QuickActionsProps = {
  disabled?: boolean;
  onQuickCommand: (command: string) => void;
  actions: Array<{ label: string; command: string; icon: ActionIcon }>;
};

const iconMap: Record<ActionIcon, React.ReactNode> = {
  clipboard: <ClipboardList size={12} />,
  book:      <BookOpen size={12} />,
  calendar:  <CalendarDays size={12} />,
};

const chipColors: ActionIcon[] = ['clipboard', 'book', 'calendar'];
const hoverStyles: Record<ActionIcon, { bg: string; color: string; border: string }> = {
  clipboard: { bg: '#EEF2FF', color: '#4338CA', border: '#C7D2FE' },
  book:      { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' },
  calendar:  { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
};

export const QuickActions = ({ disabled, onQuickCommand, actions }: QuickActionsProps) => (
  <div style={{ display: 'flex', gap: 6 }}>
    {actions.map((item) => {
      const icon = item.icon as ActionIcon;
      const hover = hoverStyles[icon];
      return (
        <button
          key={item.label}
          type="button"
          disabled={disabled}
          onClick={() => onQuickCommand(item.command)}
          title={item.label}
          style={{
            flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '8px 6px 9px',
            borderRadius: 12,
            border: '1px solid #E8ECEF',
            background: '#FFFFFF',
            color: '#64748B',
            fontSize: 10, fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1,
            transition: 'all 0.15s',
            lineHeight: 1.3,
            textAlign: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = hover.border;
              e.currentTarget.style.background = hover.bg;
              e.currentTarget.style.color = hover.color;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#E8ECEF';
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.color = '#64748B';
          }}
        >
          <span style={{ color: 'inherit' }}>{iconMap[icon]}</span>
          <span>{item.label}</span>
        </button>
      );
    })}
  </div>
);
