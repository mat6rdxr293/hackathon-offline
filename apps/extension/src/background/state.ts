import type { ActionLogItem, IntentType } from '@hackathon/shared';

import type { AgentViewState, ExtensionUIState } from '../types/messages';

const initialState = (): AgentViewState => ({
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
});

const store = new Map<number, AgentViewState>();
const panelVisibilityStore = new Map<number, boolean>();

export const getAgentState = (tabId: number): AgentViewState => {
  const existing = store.get(tabId);
  if (existing) {
    return existing;
  }
  const created = initialState();
  store.set(tabId, created);
  return created;
};

export const patchAgentState = (tabId: number, patch: Partial<AgentViewState>): AgentViewState => {
  const nextState = {
    ...getAgentState(tabId),
    ...patch,
  };
  store.set(tabId, nextState);
  return nextState;
};

export const setPanelVisible = (tabId: number, visible: boolean): void => {
  panelVisibilityStore.set(tabId, visible);
};

export const getPanelVisible = (tabId: number): boolean => panelVisibilityStore.get(tabId) ?? false;

export const getExtensionUiState = (tabId: number, activeTabSupported: boolean): ExtensionUIState => {
  const state = getAgentState(tabId);
  return {
    currentStatus: state.currentStatus,
    lastTranscript: state.transcript,
    lastIntent: state.currentIntent?.intent ?? null,
    lastActionSummary: state.lastExecutedAction,
    lastError: state.errorLog[0] ?? null,
    panelVisible: getPanelVisible(tabId),
    activeTabSupported,
  };
};

const toActionType = (intent: IntentType): ActionLogItem['type'] => {
  if (intent === 'navigate' || intent === 'open_diary') return 'navigate';
  if (intent === 'fill_primary_exam') return 'fill';
  if (intent === 'generate_schedule') return 'schedule';
  if (intent === 'complete_service') return 'complete';
  if (intent === 'generate_document') return 'fill';
  return 'error';
};

export const pushActionLog = (
  tabId: number,
  params: {
    intent: IntentType;
    title: string;
    details?: string;
    success: boolean;
  },
): AgentViewState => {
  const state = getAgentState(tabId);
  const item: ActionLogItem = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: toActionType(params.intent),
    title: params.title,
    details: params.details,
    success: params.success,
  };

  return patchAgentState(tabId, {
    actionLog: [item, ...state.actionLog].slice(0, 60),
    lastExecutedAction: params.title,
  });
};

export const pushErrorLog = (tabId: number, error: string): AgentViewState => {
  const state = getAgentState(tabId);
  return patchAgentState(tabId, {
    errorLog: [error, ...state.errorLog].slice(0, 50),
    currentStatus: 'error',
  });
};
