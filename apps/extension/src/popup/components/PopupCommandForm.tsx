import { Loader2, Mic, MicOff, Send } from 'lucide-react';
import type { UIStatus } from '@hackathon/shared';

type PopupCommandFormProps = {
  command: string;
  onCommandChange: (value: string) => void;
  onSubmit: () => void;
  voiceStatus: UIStatus;
  onToggleVoice: () => void;
  disabled?: boolean;
  placeholder: string;
  isProcessing?: boolean;
};

export const PopupCommandForm = ({
  command,
  onCommandChange,
  onSubmit,
  voiceStatus,
  onToggleVoice,
  disabled,
  placeholder,
  isProcessing,
}: PopupCommandFormProps) => {
  const isListening = voiceStatus === 'listening';

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 44 }}>
      {/* Mic toggle */}
      <button
        type="button"
        onClick={onToggleVoice}
        disabled={disabled}
        title={isListening ? 'Остановить' : 'Голосовая команда'}
        style={{
          width: 44, height: 44, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isListening ? '#FFF1F2' : 'transparent',
          color: isListening ? '#EF4444' : '#94A3B8',
          border: 'none',
          borderRight: '1px solid #F1F5F9',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isListening) {
            e.currentTarget.style.background = '#F0FDFA';
            e.currentTarget.style.color = '#0F766E';
          }
        }}
        onMouseLeave={(e) => {
          if (!isListening) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#94A3B8';
          }
        }}
      >
        {isListening ? <MicOff size={15} /> : <Mic size={15} />}
      </button>

      {/* Text input */}
      <input
        value={isListening ? (command || '') : command}
        onChange={(e) => onCommandChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isListening) {
            e.preventDefault();
            if (command.trim()) onSubmit();
          }
        }}
        placeholder={placeholder}
        readOnly={isListening}
        style={{
          flex: 1,
          height: 44,
          padding: '0 12px',
          fontSize: 13,
          color: isListening ? '#EF4444' : '#0F172A',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />

      {/* Send button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || isListening || !command.trim()}
        style={{
          width: 44, height: 44, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          color: '#94A3B8',
          border: 'none',
          borderLeft: '1px solid #F1F5F9',
          cursor: (disabled || isListening || !command.trim()) ? 'not-allowed' : 'pointer',
          opacity: (disabled || isListening || !command.trim()) ? 0.3 : 1,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isListening && command.trim()) {
            e.currentTarget.style.background = '#EEF2FF';
            e.currentTarget.style.color = '#4F46E5';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#94A3B8';
        }}
      >
        {isProcessing ? <Loader2 size={14} style={{ animation: 'spin 0.75s linear infinite' }} /> : <Send size={14} />}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
