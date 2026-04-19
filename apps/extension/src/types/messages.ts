import type {
  ActionLogItem,
  MedicalData,
  ParsedIntent,
  ScheduleGenerationResult,
  UIStatus,
  WorkflowNextStep,
  WorkflowState,
} from '@hackathon/shared';

import type { DomAction, PageSnapshot } from '../modules/dom/domEngine';

export type DiagnosisPreset = {
  diagnosis: string;
  template: Partial<MedicalData>;
};

export type AgentViewState = {
  currentStatus: UIStatus;
  transcript: string;
  currentIntent: ParsedIntent | null;
  parsedMedicalData: MedicalData | null;
  assistantReply: string | null;
  workflowState: WorkflowState;
  nextSuggestion: WorkflowNextStep | null;
  actionLog: ActionLogItem[];
  errorLog: string[];
  lastExecutedAction: string | null;
  latestSchedule: ScheduleGenerationResult | null;
  completionMessage: string | null;
  awaitingSaveConfirmation: boolean;
  diagnosisPreset: DiagnosisPreset | null;
};

export type ExtensionUIState = {
  currentStatus: UIStatus;
  lastTranscript: string;
  lastIntent: string | null;
  lastActionSummary: string | null;
  lastError: string | null;
  panelVisible: boolean;
  activeTabSupported: boolean;
};

export type ActiveTabState = {
  tabId: number | null;
  title: string;
  url: string;
  domain: string;
  contentScriptAvailable: boolean;
  activeTabSupported: boolean;
  reason: string | null;
  pageType: string | null;
  panelVisible: boolean;
};

export type PopupStateSnapshot = {
  agent: ExtensionUIState;
  tab: ActiveTabState;
};

export type PanelToBackgroundMessage =
  | { type: 'PANEL_READY' }
  | { type: 'PANEL_SUBMIT_COMMAND'; payload: { text: string; source: 'voice' | 'text' } }
  | { type: 'PANEL_CONFIRM_SUGGESTION'; payload: { action: WorkflowNextStep['nextRecommendedAction'] } }
  | { type: 'PANEL_GENERATE_ASSIGNMENT' }
  | { type: 'PANEL_STATUS'; payload?: { status: UIStatus; transcript?: string } }
  | { type: 'PANEL_SAVE_FORM' }
  | { type: 'PANEL_CANCEL_SAVE' }
  | { type: 'PANEL_APPLY_PRESET' };

export type PopupToBackgroundMessage =
  | { type: 'POPUP_READY' }
  | { type: 'GET_ACTIVE_TAB_STATE' }
  | { type: 'OPEN_PANEL' }
  | { type: 'RUN_COMMAND'; payload: { text: string; source: 'voice' | 'text' | 'quick_action' } }
  | { type: 'START_VOICE' }
  | { type: 'STOP_VOICE' }
  | { type: 'POPUP_CONFIRM_SAVE' }
  | { type: 'POPUP_CANCEL_SAVE' }
  | { type: 'POPUP_CONFIRM_SUGGESTION'; payload: { action: WorkflowNextStep['nextRecommendedAction'] } };

export type PopupCommand = 'open_panel' | 'run_command' | 'start_voice' | 'stop_voice';

export type PopupResponse = {
  ok: boolean;
  error?: string;
  payload?: PopupStateSnapshot;
};

export type BackgroundToUiMessage =
  | { type: 'AGENT_STATE'; payload: AgentViewState }
  | { type: 'POPUP_STATE'; payload: PopupStateSnapshot };

export type BackgroundToContentMessage =
  | { type: 'CONTENT_NAVIGATE'; payload: { target: string; recordType?: string } }
  | { type: 'CONTENT_FILL_PRIMARY'; payload: { data: MedicalData } }
  | { type: 'CONTENT_FILL_DISCHARGE'; payload: { text: string; dischargeDate?: string; outcome?: string } }
  | { type: 'CONTENT_GET_PATIENT_INFO' }
  | { type: 'CONTENT_FILL_DIARY'; payload: { text: string; vitals: Record<string, string>; entryDate?: string } }
  | { type: 'CONTENT_APPLY_SCHEDULE'; payload: { schedule: ScheduleGenerationResult } }
  | { type: 'CONTENT_COMPLETE_SERVICE'; payload: { note?: string; procedureName?: string } }
  | { type: 'CONTENT_OPEN_DIARY' }
  | { type: 'CONTENT_INSPECT_CONTEXT' }
  | { type: 'CONTENT_OPEN_PANEL' }
  | { type: 'CONTENT_GET_PAGE_STATE' }
  | { type: 'CONTENT_SCAN_DOM' }
  | { type: 'CONTENT_SMART_EXECUTE'; payload: { actions: DomAction[] } }
  | { type: 'CONTENT_GENERATE_DOCUMENT' }
  | { type: 'CONTENT_SAVE_FORM' };

export type { DomAction, PageSnapshot };

export type ContentToBackgroundMessage = {
  type: 'CONTENT_RESULT';
  payload: {
    success: boolean;
    title: string;
    details?: string;
    pageType?: string;
    supported?: boolean;
    panelVisible?: boolean;
    patientInfo?: Record<string, string>;
    domSnapshot?: PageSnapshot;
    context?: {
      busySlots?: Array<{ specialistId: string; date: string; start: string; end: string }>;
      procedures?: Array<{
        id: string;
        type: 'lfk' | 'massage' | 'physio';
        title: string;
        specialistId: string;
        durationMinutes: number;
        sessions: number;
      }>;
      specialistAvailability?: Array<{ specialistId: string; workStart: string; workEnd: string }>;
    };
  };
};

export type ContentExecutionResponse = ContentToBackgroundMessage['payload'];
