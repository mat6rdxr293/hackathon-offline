import type { ActionLogItem, AppLocale } from '@hackathon/shared';

type ActionLogListProps = {
  items: ActionLogItem[];
  title: string;
  emptyLabel: string;
  locale: AppLocale;
};

const toRuntimeLocale = (locale: AppLocale): string => {
  if (locale === 'kk') return 'kk-KZ';
  if (locale === 'en') return 'en-US';
  return 'ru-RU';
};

export const ActionLogList = ({ items, title, emptyLabel, locale }: ActionLogListProps) => (
  <div
    className="rounded-xl p-3"
    style={{
      background: '#061A1C',
      border: '1px solid #1E2C31',
      boxShadow: 'rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(255,255,255,0.03) 0px 1px 0px inset',
    }}
  >
    <h3
      className="mb-2 text-xs font-medium uppercase"
      style={{ color: '#52525B', letterSpacing: '0.06em' }}
    >
      {title}
    </h3>
    <ul className="max-h-56 space-y-1.5 overflow-auto text-xs">
      {items.length === 0 && (
        <li style={{ color: '#3F3F46' }}>{emptyLabel}</li>
      )}
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-lg p-2"
          style={{
            background: item.success ? 'rgba(54,244,164,0.06)' : 'rgba(220,38,38,0.07)',
            border: `1px solid ${item.success ? 'rgba(54,244,164,0.15)' : 'rgba(220,38,38,0.18)'}`,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium" style={{ color: item.success ? '#36F4A4' : '#f87171' }}>
              {item.title}
            </p>
            <span className="shrink-0 text-[10px]" style={{ color: '#3F3F46' }}>
              {new Date(item.timestamp).toLocaleTimeString(toRuntimeLocale(locale))}
            </span>
          </div>
          {item.details && (
            <p className="mt-0.5" style={{ color: '#71717A' }}>{item.details}</p>
          )}
        </li>
      ))}
    </ul>
  </div>
);
