import type { ActionLogItem, UIStatus, WorkflowNextStep, WorkflowState } from '@hackathon/shared';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  Mic,
  Navigation,
} from 'lucide-react';

type AgentFeedbackCardProps = {
  status: UIStatus;
  transcript: string;
  assistantReply: string | null;
  intent: string | null;
  action: string | null;
  error: string | null;
  nextSuggestion: WorkflowNextStep | null;
  workflowState: WorkflowState;
  recentActions: ActionLogItem[];
  isProcessing?: boolean;
  awaitingSaveConfirmation?: boolean;
  onConfirmSave?: () => void;
  onCancelSave?: () => void;
  onConfirmSuggestion?: (action: WorkflowNextStep['nextRecommendedAction']) => void;
};

const intentIcon: Record<string, React.ReactNode> = {
  navigate:              <Navigation size={10} />,
  fill_primary_exam:     <ClipboardList size={10} />,
  fill_discharge_summary:<FileText size={10} />,
  fill_diary:            <BookOpen size={10} />,
  generate_schedule:     <CalendarDays size={10} />,
  complete_service:      <CheckCircle2 size={10} />,
  open_diary:            <BookOpen size={10} />,
  unknown:               <Clock size={10} />,
};

const SECTION_NAMES: Record<string, string> = {
  schedule_block:   'Расписание процедур',
  primary_exam:     'Первичный приём',
  patient_page:     'Карточка пациента',
  discharge_summary:'Выписной эпикриз',
  diary:            'Дневник наблюдений',
  procedures:       'Процедуры',
  lfk:              'ЛФК',
  massage:          'Массаж',
  physio:           'Физиотерапия',
  dom_click:        'клик по кнопке',
};

const humanize = (text: string | null): string | null => {
  if (!text) return text;
  let result = text;
  for (const [key, val] of Object.entries(SECTION_NAMES)) {
    result = result.replaceAll(key, val);
  }
  return result;
};

const intentLabel: Record<string, string> = {
  navigate:              'Навигация',
  fill_primary_exam:     'Первичный приём',
  fill_discharge_summary:'Выписной эпикриз',
  fill_diary:            'Дневник наблюдений',
  generate_schedule:     'Расписание процедур',
  complete_service:      'Завершить услугу',
  open_diary:            'Открыть дневник',
  generate_document:     'Сформировать документ',
  unknown:               'Неизвестно',
};

const intentBadge: Record<string, { bg: string; color: string }> = {
  navigate:              { bg: '#EFF6FF', color: '#1D4ED8' },
  fill_primary_exam:     { bg: '#F5F3FF', color: '#6D28D9' },
  fill_discharge_summary:{ bg: '#FAF5FF', color: '#7C3AED' },
  fill_diary:            { bg: '#EEF2FF', color: '#4338CA' },
  generate_schedule:     { bg: '#F0FDFA', color: '#0F766E' },
  complete_service:      { bg: '#ECFDF5', color: '#059669' },
  open_diary:            { bg: '#EEF2FF', color: '#4338CA' },
  unknown:               { bg: '#F1F5F9', color: '#64748B' },
};

export const AgentFeedbackCard = ({
  status,
  transcript,
  assistantReply,
  intent,
  action,
  error,
  nextSuggestion,
  recentActions,
  awaitingSaveConfirmation,
  onConfirmSave,
  onCancelSave,
  onConfirmSuggestion,
}: AgentFeedbackCardProps) => (
  <div>
    {/* Status header */}
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px 6px',
    }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Ответ агента
      </p>
      <StatusIcon status={status} />
    </div>

    {/* Rows */}
    {transcript && <Row label="Команда"><QuotedText>{transcript}</QuotedText></Row>}
    {assistantReply && <Row label="Ответ"><p style={{ fontSize: 11, color: '#334155', lineHeight: 1.5 }}>{humanize(assistantReply)}</p></Row>}
    {intent && (
      <Row label="Намерение">
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 600,
            background: (intentBadge[intent] ?? intentBadge.unknown).bg,
            color: (intentBadge[intent] ?? intentBadge.unknown).color,
          }}
        >
          {intentIcon[intent] ?? intentIcon.unknown}
          {intentLabel[intent] ?? intent}
        </span>
      </Row>
    )}
    {action && <Row label="Выполнено"><p style={{ fontSize: 11, color: '#059669' }}>{humanize(action)}</p></Row>}
    {recentActions.length > 0 && !action && (
      <Row label="История">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {recentActions.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: item.success ? '#10B981' : '#EF4444', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
            </div>
          ))}
        </div>
      </Row>
    )}
    {error && (
      <div style={{ display: 'flex', gap: 8, margin: '4px 0', padding: '8px 14px', background: '#FEF2F2' }}>
        <AlertCircle size={12} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.4 }}>{error}</p>
      </div>
    )}

    {/* Save confirmation */}
    {awaitingSaveConfirmation && (
      <div style={{
        margin: '4px 0 0',
        padding: '10px 14px',
        background: 'linear-gradient(to right, #FFFBEB, #FFF7ED)',
        borderTop: '1px solid #FED7AA',
      }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Подтвердите сохранение
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={onConfirmSave}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
              background: '#059669', color: '#FFFFFF',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={onCancelSave}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 8,
              border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#64748B',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Отмена
          </button>
        </div>
      </div>
    )}

    {/* Next suggestion */}
    {nextSuggestion && !awaitingSaveConfirmation && (
      <div style={{
        margin: '4px 0 0',
        padding: '8px 14px',
        background: 'linear-gradient(to right, #F0FDFA, #EEF2FF)',
        borderTop: '1px solid #F1F5F9',
      }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Следующий шаг
        </p>
        <p style={{ fontSize: 11, color: '#334155', lineHeight: 1.4, marginBottom: 8 }}>{nextSuggestion.message}</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => onConfirmSuggestion?.(nextSuggestion.nextRecommendedAction)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
              background: '#0F766E', color: '#FFFFFF',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Выполнить
          </button>
          <button
            type="button"
            onClick={onCancelSave}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 8,
              border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#64748B',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Пропустить
          </button>
        </div>
      </div>
    )}

    <div style={{ height: 6 }} />
  </div>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 14px', borderBottom: '1px solid #F8FAFC' }}>
    <span style={{ width: 52, flexShrink: 0, fontSize: 9, fontWeight: 700, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 1 }}>
      {label}
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
);

const QuotedText = ({ children }: { children: string }) => (
  <div style={{ borderRadius: 6, padding: '4px 8px', background: '#F8FAFC', border: '1px solid #E8ECEF' }}>
    <p style={{ fontSize: 11, color: '#0F172A', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>"{children}"</p>
  </div>
);

const StatusIcon = ({ status }: { status: UIStatus }) => {
  if (status === 'processing' || status === 'executing')
    return <Loader2 size={12} style={{ color: '#6366F1', animation: 'spin 0.75s linear infinite' }} />;
  if (status === 'success') return <CheckCircle2 size={12} style={{ color: '#10B981' }} />;
  if (status === 'error')   return <AlertCircle size={12} style={{ color: '#EF4444' }} />;
  if (status === 'listening') return <Mic size={12} style={{ color: '#EF4444' }} />;
  return <ArrowRight size={12} style={{ color: '#CBD5E1' }} />;
};
