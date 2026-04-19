import { X } from 'lucide-react';

type Props = {
  transcript: string;
  onStop: () => void;
  onCancel?: () => void;
  processing?: boolean;
  mode?: 'medical' | 'schedule';
};

const BAR_DELAYS = [0, 0.1, 0.2, 0.05, 0.15, 0.25, 0.08, 0.18, 0.3, 0.12];
const BAR_HEIGHTS = [14, 22, 32, 20, 36, 18, 28, 40, 16, 24];

export const VoiceListeningOverlay = ({ transcript, onStop, onCancel, processing = false, mode = 'medical' }: Props) => {
  const isSchedule = mode === 'schedule';
  const accentColor = isSchedule ? '#5eead4' : '#36F4A4';
  const spinnerColor = isSchedule ? '#5eead4' : '#36F4A4';
  const modeLabel = isSchedule ? 'Расписание…' : 'Медзапись…';

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #02090A 0%, #102620 100%)',
        borderRadius: 12,
        padding: '10px 14px 12px',
        boxShadow: '0 8px 32px rgba(0,0,0,.5), rgba(255,255,255,0.03) 0px 1px 0px inset',
        border: '1px solid #1E2C31',
      }}
    >
      {/* Label */}
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: processing ? accentColor : 'rgba(255,255,255,.38)',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {processing ? 'Обработка…' : `Слушаю — ${modeLabel}`}
      </p>

      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Mic stop button */}
        <button
          type="button"
          onClick={onStop}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#E5303A',
            boxShadow: '0 0 0 6px rgba(229,48,58,.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: 0,
            cursor: 'pointer',
            transition: 'background .15s, transform .1s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#C8242D')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#E5303A')}
          onMouseDown={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(.93)')}
          onMouseUp={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {/* Transcript */}
        <p
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            color: '#FFFFFF',
            lineHeight: 1.4,
            minWidth: 0,
            wordBreak: 'break-word',
          }}
        >
          {transcript || <span style={{ color: 'rgba(255,255,255,.3)' }}>Говорите…</span>}
          <span
            style={{
              display: 'inline-block',
              width: 1,
              height: '1em',
              background: '#fff',
              marginLeft: 2,
              verticalAlign: 'text-bottom',
              animation: 'voiceCaret 1s step-end infinite',
            }}
          />
        </p>

        {/* Waveform / spinner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, flexShrink: 0, height: 40 }}>
          {processing ? (
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: '2.5px solid rgba(255,255,255,.15)',
                borderTopColor: spinnerColor,
                animation: 'voiceSpin 0.75s linear infinite',
              }}
            />
          ) : (
            BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: h,
                  borderRadius: 999,
                  background: isSchedule ? 'rgba(94,234,212,0.7)' : 'rgba(54,244,164,0.7)',
                  animation: `voiceBar 0.9s ease-in-out ${BAR_DELAYS[i]}s infinite alternate`,
                }}
              />
            ))
          )}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={onCancel ?? onStop}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: 0,
            cursor: 'pointer',
            color: 'rgba(255,255,255,.7)',
            transition: 'background .12s',
            marginLeft: 2,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.2)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.1)')}
          title="Отменить сказанное"
        >
          <X size={13} />
        </button>
      </div>

      <style>{`
        @keyframes voiceBar {
          from { transform: scaleY(0.35); opacity: 0.5; }
          to   { transform: scaleY(1);    opacity: 1;   }
        }
        @keyframes voiceCaret {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes voiceSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
