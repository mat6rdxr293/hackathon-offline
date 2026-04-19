import { CalendarDays, Mic, MicOff } from 'lucide-react';

type VoiceControlsProps = {
  medListening: boolean;
  schedListening: boolean;
  onMedStart: () => void;
  onMedStop: () => void;
  onSchedStart: () => void;
  onSchedStop: () => void;
  medStartLabel: string;
  medStopLabel: string;
  schedStartLabel: string;
  schedStopLabel: string;
};

export const VoiceControls = ({
  medListening,
  schedListening,
  onMedStart,
  onMedStop,
  onSchedStart,
  onSchedStop,
  medStartLabel,
  medStopLabel,
  schedStartLabel,
  schedStopLabel,
}: VoiceControlsProps) => (
  <div className="flex items-center gap-2">
    <div className="relative inline-flex">
      {medListening && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-20 pointer-events-none"
          style={{ background: '#36F4A4' }}
        />
      )}
      <button
        type="button"
        onClick={medListening ? onMedStop : onMedStart}
        disabled={schedListening}
        title="Медицинские записи"
        className="relative inline-flex items-center gap-1.5 text-xs font-medium transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          borderRadius: 9999,
          padding: '7px 14px 7px 10px',
          background: medListening ? '#E5303A' : 'rgba(54,244,164,0.1)',
          color: medListening ? '#FFFFFF' : '#36F4A4',
          border: medListening ? '1px solid rgba(229,48,58,0.5)' : '1px solid rgba(54,244,164,0.25)',
          cursor: 'pointer',
        }}
      >
        {medListening ? <MicOff size={13} /> : <Mic size={13} />}
        <span className="hidden sm:inline">{medListening ? medStopLabel : medStartLabel}</span>
      </button>
    </div>

    <div className="relative inline-flex">
      {schedListening && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-20 pointer-events-none"
          style={{ background: '#5eead4' }}
        />
      )}
      <button
        type="button"
        onClick={schedListening ? onSchedStop : onSchedStart}
        disabled={medListening}
        title="Расписание процедур"
        className="relative inline-flex items-center gap-1.5 text-xs font-medium transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          borderRadius: 9999,
          padding: '7px 14px 7px 10px',
          background: schedListening ? '#E5303A' : 'rgba(20,184,166,0.1)',
          color: schedListening ? '#FFFFFF' : '#5eead4',
          border: schedListening ? '1px solid rgba(229,48,58,0.5)' : '1px solid rgba(20,184,166,0.25)',
          cursor: 'pointer',
        }}
      >
        {schedListening ? <MicOff size={13} /> : <CalendarDays size={13} />}
        <span className="hidden sm:inline">{schedListening ? schedStopLabel : schedStartLabel}</span>
      </button>
    </div>
  </div>
);
