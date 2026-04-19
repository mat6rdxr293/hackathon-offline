type TranscriptPreviewProps = {
  transcript: string;
  intent: string | null;
  action: string | null;
  error: string | null;
  labels: {
    title: string;
    command: string;
    intent: string;
    action: string;
    error: string;
    empty: string;
  };
};

export const TranscriptPreview = ({ transcript, intent, action, error, labels }: TranscriptPreviewProps) => (
  <section className="rounded-xl border border-border bg-white p-3 text-xs shadow-sm">
    <p className="mb-2.5 text-sm font-semibold">{labels.title}</p>
    <div className="space-y-1.5">
      {[
        { label: labels.command, value: transcript || labels.empty },
        { label: labels.intent, value: intent ?? labels.empty },
        { label: labels.action, value: action ?? labels.empty },
      ].map(({ label, value }) => (
        <div key={label} className="flex gap-1.5">
          <span className="shrink-0 font-semibold text-muted">{label}:</span>
          <span className="text-ink">{value}</span>
        </div>
      ))}
    </div>
    {error ? (
      <div className="mt-2.5 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700">
        <span className="font-semibold">{labels.error}:</span> {error}
      </div>
    ) : null}
  </section>
);
