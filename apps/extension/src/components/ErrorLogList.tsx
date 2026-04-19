type ErrorLogListProps = {
  errors: string[];
  title: string;
  emptyLabel: string;
};

export const ErrorLogList = ({ errors, title, emptyLabel }: ErrorLogListProps) => (
  <div
    className="rounded-xl p-3"
    style={{
      background: 'rgba(220,38,38,0.06)',
      border: '1px solid rgba(220,38,38,0.18)',
    }}
  >
    <h3
      className="mb-2 text-xs font-medium uppercase"
      style={{ color: '#f87171', letterSpacing: '0.06em' }}
    >
      {title}
    </h3>
    <ul className="max-h-44 space-y-1.5 overflow-auto text-xs">
      {errors.length === 0 && (
        <li style={{ color: 'rgba(248,113,113,0.4)' }}>{emptyLabel}</li>
      )}
      {errors.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="rounded-lg p-2"
          style={{
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.15)',
            color: '#fca5a5',
          }}
        >
          {item}
        </li>
      ))}
    </ul>
  </div>
);
