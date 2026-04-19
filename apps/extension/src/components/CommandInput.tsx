import { SendHorizontal } from 'lucide-react';

type CommandInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (command: string) => void;
  placeholder: string;
  submitLabel: string;
};

export const CommandInput = ({ value, onChange, onSubmit, placeholder, submitLabel }: CommandInputProps) => (
  <form
    className="space-y-2"
    onSubmit={(event) => {
      event.preventDefault();
      const normalized = value.trim();
      if (!normalized) return;
      onSubmit(normalized);
      onChange('');
    }}
  >
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          const normalized = value.trim();
          if (!normalized) return;
          onSubmit(normalized);
          onChange('');
        }
      }}
      placeholder={placeholder}
      style={{
        background: '#102620',
        border: '1px solid #3F3F46',
        color: '#FFFFFF',
        borderRadius: 8,
        padding: '10px 14px',
        width: '100%',
        minHeight: 80,
        fontSize: 13,
        lineHeight: 1.5,
        resize: 'vertical',
        outline: 'none',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
        fontFamily: 'inherit',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#36F4A4';
        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(54,244,164,0.18)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '#3F3F46';
        e.currentTarget.style.boxShadow = 'none';
      }}
    />
    <button
      type="submit"
      className="inline-flex items-center gap-2 font-medium transition"
      style={{
        background: '#FFFFFF',
        color: '#000000',
        borderRadius: 9999,
        padding: '9px 20px 9px 14px',
        fontSize: 13,
        border: '2px solid transparent',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
    >
      <SendHorizontal size={14} />
      {submitLabel}
    </button>
  </form>
);
