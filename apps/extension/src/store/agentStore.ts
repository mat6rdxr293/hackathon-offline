import { create } from 'zustand';

import type {
  ActionLogItem,
  MedicalData,
  ParsedIntent,
  ScheduleGenerationResult,
  UIStatus,
  WorkflowNextStep,
  WorkflowState,
} from '@hackathon/shared';

import type { AgentViewState } from '../types/messages';

type AgentStore = AgentViewState & {
  setStateFromBackground: (state: AgentViewState) => void;
  setLocalStatus: (status: UIStatus) => void;
  setTranscript: (value: string) => void;
  pushError: (message: string) => void;
  pushAction: (item: ActionLogItem) => void;
  setParsedMedicalData: (data: MedicalData | null) => void;
  setIntent: (intent: ParsedIntent | null) => void;
  setWorkflow: (state: WorkflowState, suggestion: WorkflowNextStep | null) => void;
  setSchedule: (schedule: ScheduleGenerationResult | null) => void;
  dismissCompletion: () => void;
  // File upload context (local to panel — not synced from background)
  uploadedFileContext: string | null;
  uploadedFileName: string | null;
  setFileContext: (text: string | null, name: string | null) => void;
};

const initialState: AgentViewState = {
  currentStatus: 'idle',
  transcript: '',
  currentIntent: null,
  parsedMedicalData: null,
  assistantReply: null,
  workflowState: 'idle',
  nextSuggestion: null,
  actionLog: [],
  errorLog: [],
  lastExecutedAction: null,
  latestSchedule: null,
  completionMessage: null,
  awaitingSaveConfirmation: false,
  diagnosisPreset: null,
};

export const useAgentStore = create<AgentStore>((set) => ({
  ...initialState,
  uploadedFileContext: null,
  uploadedFileName: null,
  setStateFromBackground: (state) => set(state),
  setLocalStatus: (status) => set({ currentStatus: status }),
  setTranscript: (value) => set({ transcript: value }),
  pushError: (message) => set((state) => ({ errorLog: [message, ...state.errorLog].slice(0, 30) })),
  pushAction: (item) => set((state) => ({ actionLog: [item, ...state.actionLog].slice(0, 50) })),
  setParsedMedicalData: (data) => set({ parsedMedicalData: data }),
  setIntent: (intent) => set({ currentIntent: intent }),
  setWorkflow: (state, suggestion) => set({ workflowState: state, nextSuggestion: suggestion }),
  setSchedule: (schedule) => set({ latestSchedule: schedule }),
  dismissCompletion: () => set({ completionMessage: null, assistantReply: null }),
  setFileContext: (text, name) => set({ uploadedFileContext: text, uploadedFileName: name }),
}));
