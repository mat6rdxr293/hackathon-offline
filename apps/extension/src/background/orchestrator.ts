import {
  translateByLocale,
  type AppLocale,
  type IntentType,
  type MedicalData,
  type ParsedIntent,
  type ScheduleGenerationInput,
  type WorkflowEvent,
  type WorkflowNextStep,
} from '@hackathon/shared';

import { getStoredLocale } from '../i18n/localeStorage';
import { apiClient } from '../lib/apiClient';
import { formatPatientMemoryForPrompt, loadPatientMemory, savePatientMemoryEntry } from '../modules/patientMemory';
import { getActiveTab, sendMessageToTab } from '../lib/chromeApi';
import type {
  ActiveTabState,
  BackgroundToContentMessage,
  BackgroundToUiMessage,
  ContentExecutionResponse,
  PopupStateSnapshot,
} from '../types/messages';
import { getAgentState, getExtensionUiState, patchAgentState, pushActionLog, pushErrorLog, setPanelVisible } from './state';

const restrictedPrefix = ['edge://', 'chrome://', 'about:', 'devtools://', 'chrome-extension://', 'edge-extension://'];
type CommandSource = 'voice' | 'text' | 'quick_action';
const runtimeAssetPrefix = import.meta.url.includes('/dist/') ? 'dist/' : '';
const EXPLICIT_CHAIN_MARKERS = [' затем ', ' потом ', ' после этого ', ' and then ', ' then ', ';', '\n'];
const NAVIGATION_VERBS = [
  ' открой ', ' открыть ', ' перейди ', ' перейти ', ' покажи ', ' показать ',
  ' зайди ', ' зайти ', ' войди ', ' войти ', ' иди ', ' иди в ',
  ' перейдем ', ' зайдем ', ' запусти ', ' нажми ', ' переключись ', ' переключи ',
  ' open ', ' go to ', ' show ', ' navigate ',
];
const DIARY_MARKERS = [' дневник', ' diary ', ' treatment diary '];
const SCHEDULE_MARKERS = [' расписан', ' график ', ' schedule ', ' кесте '];
const COMPLETE_MARKERS = [' выполн', ' отмет', ' done ', ' complete ', ' готово '];
const PRIMARY_FILL_MARKERS = [' жалоб', ' анамн', ' объектив', ' рекомендац', ' первич', ' осмотр', ' заполни', ' запиши', ' medical records ', ' primary exam ', ' fill '];
const DISCHARGE_MARKERS = [' эпикриз', ' выписк', ' discharge '];
const GENERATE_ASSIGNMENT_MARKERS = [
  ' сформируй назнач',
  ' сформировать назнач',
  ' назначение сформируй',
  ' назначение сформировать',
  ' generate assignment',
  ' create assignment',
  ' tagaiyndau',
];
const DESCRIBE_PATIENT_MARKERS = [
  ' расскажи о пациент',
  ' расскажи про пациент',
  ' расскажи по пациент',
  ' кратко о пациент',
  ' сведения о пациент',
  ' информация о пациент',
  ' tell me about patient',
  ' patient summary',
  ' patient overview',
  ' наукас туралы айт',
];
const PROMPT_LEAK_MARKERS = [
  'ты классификатор',
  'ты медицинский секретарь',
  'ты планировщик',
  'ты врач-клиницист',
  'ты помощник врача',
  'ты парсер',
  'you are a',
  'system prompt',
  'ignore previous',
];
const SERVICE_PAYLOAD_KEYWORDS = ['intent', 'target', 'confidence', 'normalizedtext', 'payload'];
const NAV_TARGET_MARKERS: Record<string, string[]> = {
  primary_exam: [' первич', ' медицин', ' медзапис', ' осмотр', ' обращени', ' записи ', ' плановый', ' итогов', ' приёмн', ' приемн'],
  discharge_summary: [' эпикриз', ' выписк', ' discharge '],
  treatment_diary: DIARY_MARKERS,
  schedule_block: SCHEDULE_MARKERS,
  patient_page: [' карточк', ' профил', ' главн', ' пациент'],
  patients_list: [' список ', ' пациенты ', ' patients '],
  procedures: [' процедур', ' назначени', ' услуг'],
};

const ACTION_TO_COMMAND_KEY: Record<string, string> = {
  navigate: 'bg.action.openPrimary',
  fill_primary_exam: 'bg.action.fillPrimary',
  generate_assignment: 'bg.action.generateAssignment',
  generate_schedule: 'bg.action.generateSchedule',
  complete_service: 'bg.action.completeService',
  open_diary: 'bg.action.openDiary',
};

const compactAssistantText = (value?: string | null, maxLength = 180): string | null => {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const resolveActionLabel = (locale: AppLocale, action: string): string =>
  translateByLocale(locale, ACTION_TO_COMMAND_KEY[action] ?? action);

const composeAssistantReply = (
  locale: AppLocale,
  tabId: number,
  options?: {
    completedCount?: number;
    total?: number;
    wasTrimmed?: boolean;
    errorMessage?: string;
    forceNextSuggestion?: WorkflowNextStep | null;
  },
): string => {
  if (options?.errorMessage) {
    return `Не получилось выполнить команду: ${options.errorMessage}`;
  }

  const state = getAgentState(tabId);
  const parts: string[] = [];

  if (options?.wasTrimmed && options.total && options.total > 1) {
    parts.push(`Я выполнил только первое действие из ${options.total}, чтобы избежать случайной цепочки.`);
  } else if ((options?.completedCount ?? 1) > 1) {
    parts.push(`Готово, выполнил ${options?.completedCount ?? 1} действия по очереди.`);
  } else if (state.lastExecutedAction) {
    parts.push(`Готово: ${state.lastExecutedAction}.`);
  } else {
    parts.push('Готово, команда выполнена.');
  }

  const details = compactAssistantText(state.actionLog[0]?.details, 170);
  if (details) {
    parts.push(/[.!?…]$/.test(details) ? details : `${details}.`);
  }

  if (state.awaitingSaveConfirmation) {
    parts.push('Проверьте заполненные поля и подтвердите сохранение.');
  }

  const nextSuggestion = options?.forceNextSuggestion ?? state.nextSuggestion;
  if (nextSuggestion?.nextRecommendedAction) {
    parts.push(`Могу сразу сделать следующий шаг: ${resolveActionLabel(locale, nextSuggestion.nextRecommendedAction)}.`);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const isAutomatableUrl = (url: string): boolean => {
  if (!url) {
    return false;
  }
  if (restrictedPrefix.some((prefix) => url.startsWith(prefix))) {
    return false;
  }
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
};

const postUiMessage = (message: BackgroundToUiMessage): void => {
  chrome.runtime.sendMessage(message, () => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      // no listeners
    }
  });
};

const callContent = async <T = ContentExecutionResponse>(tabId: number, message: BackgroundToContentMessage): Promise<T> =>
  sendMessageToTab<T>(tabId, message);

const toDomain = (url: string): string => {
  if (!url) {
    return '';
  }
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const toInitialTabState = (locale: AppLocale, tab: chrome.tabs.Tab): ActiveTabState => ({
  tabId: tab.id ?? null,
  title: tab.title ?? translateByLocale(locale, 'bg.tab.untitled'),
  url: tab.url ?? '',
  domain: toDomain(tab.url ?? ''),
  contentScriptAvailable: false,
  activeTabSupported: false,
  reason: null,
  pageType: null,
  panelVisible: false,
});

const injectContentScript = async (tabId: number): Promise<void> => {
  const loaderCandidates = Array.from(
    new Set([
      `${runtimeAssetPrefix}content-script-loader.js`,
      'content-script-loader.js',
      'dist/content-script-loader.js',
    ]),
  );

  let lastError: unknown = null;
  for (const loaderFile of loaderCandidates) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [loaderFile] });
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to inject content script loader.');
};

const queryPageState = async (locale: AppLocale, state: ActiveTabState): Promise<ActiveTabState> => {
  const tabId = state.tabId!;
  const pageState = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_GET_PAGE_STATE' });
  const panelVisible = Boolean(pageState.panelVisible);
  setPanelVisible(tabId, panelVisible);
  return {
    ...state,
    contentScriptAvailable: true,
    activeTabSupported: Boolean(pageState.supported),
    reason: pageState.supported ? null : pageState.details ?? translateByLocale(locale, 'bg.err.openSupportedPage'),
    pageType: pageState.pageType ?? null,
    panelVisible,
  };
};

const loadActiveTabState = async (locale: AppLocale, tabOverride?: chrome.tabs.Tab): Promise<ActiveTabState> => {
  const tab = tabOverride ?? (await getActiveTab());
  const state = toInitialTabState(locale, tab);

  if (!state.tabId) {
    return {
      ...state,
      reason: translateByLocale(locale, 'bg.err.activeTabIdUnavailable'),
    };
  }

  if (!isAutomatableUrl(state.url)) {
    return {
      ...state,
      reason: translateByLocale(locale, 'bg.err.internalPage'),
    };
  }

  try {
    return await queryPageState(locale, state);
  } catch {
    // Content script may not be ready yet (async dynamic import race) вЂ” inject and retry
    try {
      await injectContentScript(state.tabId);
      return await queryPageState(locale, state);
    } catch {
      return {
        ...state,
        reason: translateByLocale(locale, 'bg.err.contentUnavailable'),
        contentScriptAvailable: false,
        activeTabSupported: false,
        panelVisible: false,
      };
    }
  }
};

const snapshotForTab = (tabState: ActiveTabState): PopupStateSnapshot => ({
  agent: getExtensionUiState(tabState.tabId ?? 0, tabState.activeTabSupported),
  tab: tabState,
});

const broadcastStateForTab = async (locale: AppLocale, tabId: number): Promise<PopupStateSnapshot> => {
  const tab = await chrome.tabs.get(tabId);
  const tabState = await loadActiveTabState(locale, tab);
  const agent = getAgentState(tabId);
  postUiMessage({ type: 'AGENT_STATE', payload: agent });
  const snapshot = snapshotForTab(tabState);
  postUiMessage({ type: 'POPUP_STATE', payload: snapshot });
  return snapshot;
};

const resolveWorkflowEvent = (intent: IntentType, target?: string): WorkflowEvent | undefined => {
  if (intent === 'navigate' && target === 'patient_page') return 'patient_opened';
  if (intent === 'navigate' && target === 'primary_exam') return 'primary_exam_opened';
  if (intent === 'fill_primary_exam') return 'primary_exam_filled';
  if (intent === 'generate_schedule') return 'schedule_generated';
  if (intent === 'complete_service') return 'service_completed';
  if (intent === 'open_diary') return 'diary_updated';
  if (intent === 'fill_diary') return 'diary_updated';
  return undefined;
};

const normalizeForExtraction = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[!?;,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ё/g, 'е')
    .trim();

const RECORD_TYPE_MAP: Array<[string[], string]> = [
  [[
    'осмотр врача приёмного покоя',
    'осмотр врача приемного покоя',
    'осмотр приёмного покоя',
    'осмотр приемного покоя',
    'приёмного покоя',
    'приемного покоя',
    'приёмный покой',
    'приемный покой',
  ], 'Осмотр врача приёмного покоя'],
  [['плановый осмотр', 'плановый', 'плановом осмотре', 'плановую запись'], 'Плановый осмотр'],
  [['итоговая запись', 'итоговый осмотр', 'итоговую запись', 'итоговой записи', 'итог'], 'Итоговая запись'],
  [['первичный осмотр', 'первичный приём', 'первичный прием', 'первичный'], 'Первичный осмотр'],
];

const PRIMARY_EXAM_DATE_MARKERS = [
  'дата и время',
  'дату и время',
  'дата осмотра',
  'время осмотра',
  'дата регистрации',
  'время регистрации',
];

const PRIMARY_EXAM_UPDATE_MARKERS = ['измени', 'смени', 'переключи', 'выбери', 'установи', 'поставь', 'обнови'];
const PRIMARY_EXAM_SECTION_MARKERS = ['жалоб', 'анамн', 'объектив', 'рекомендац', 'примечан', 'назначен'];
const pad2 = (value: number): string => String(value).padStart(2, '0');

const buildIsoDateTime = (year: number, month: number, day: number, hour: number, minute: number): string | undefined => {
  if (
    Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) || Number.isNaN(hour) || Number.isNaN(minute) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) {
    return undefined;
  }

  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day ||
    dt.getHours() !== hour ||
    dt.getMinutes() !== minute
  ) {
    return undefined;
  }

  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
};

const extractPrimaryExamDateTime = (text: string): string | undefined => {
  const normalized = normalizeForExtraction(text);
  const hasDateMarker = PRIMARY_EXAM_DATE_MARKERS.some((marker) => normalized.includes(marker));
  const hasRelativeDate = /\b(сегодня|завтра|вчера)\b/u.test(normalized);
  const hasDateToken = /\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/.test(normalized);
  const hasTimeToken = /\b\d{1,2}[:.]\d{2}\b/.test(normalized);

  if (!hasDateMarker && !(hasDateToken && hasTimeToken) && !hasRelativeDate) {
    return undefined;
  }

  let match = normalized.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[ t](\d{1,2})[:.](\d{2}))\b/);
  if (match) {
    return buildIsoDateTime(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    );
  }

  match = normalized.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s*(?:в|во|на)?\s*(\d{1,2})[:.](\d{2}))\b/u);
  if (match) {
    return buildIsoDateTime(
      Number(match[3]),
      Number(match[2]),
      Number(match[1]),
      Number(match[4]),
      Number(match[5]),
    );
  }

  const rel = normalized.match(/\b(сегодня|завтра|вчера)\b(?:\s*(?:в|во|на)?\s*(\d{1,2})[:.](\d{2}))?/u);
  if (rel?.[1] && rel[2] && rel[3]) {
    const base = new Date();
    if (rel[1] === 'завтра') base.setDate(base.getDate() + 1);
    if (rel[1] === 'вчера') base.setDate(base.getDate() - 1);
    return buildIsoDateTime(
      base.getFullYear(),
      base.getMonth() + 1,
      base.getDate(),
      Number(rel[2]),
      Number(rel[3]),
    );
  }

  return undefined;
};

const extractRecordType = (text: string): string | undefined => {
  const lower = normalizeForExtraction(text);
  for (const [keywords, recordType] of RECORD_TYPE_MAP) {
    if (keywords.some((kw) => lower.includes(normalizeForExtraction(kw)))) return recordType;
  }
  return undefined;
};

const isPrimaryExamFieldOnlyUpdate = (text: string): boolean => {
  const normalized = normalizeForExtraction(text);
  const hasUpdateVerb = PRIMARY_EXAM_UPDATE_MARKERS.some((marker) => normalized.includes(marker));
  const hasFieldMarker = normalized.includes('тип записи') || PRIMARY_EXAM_DATE_MARKERS.some((marker) => normalized.includes(marker));
  const hasRecordType = extractRecordType(text) !== undefined;
  const hasDateTime = extractPrimaryExamDateTime(text) !== undefined;
  const hasNarrativeFields = PRIMARY_EXAM_SECTION_MARKERS.some((marker) => normalized.includes(marker));

  if (hasNarrativeFields) {
    return false;
  }

  return (
    (hasFieldMarker && (hasUpdateVerb || hasRecordType || hasDateTime)) ||
    (hasUpdateVerb && (hasRecordType || hasDateTime))
  );
};

const buildPrimaryExamFieldUpdateData = (text: string): MedicalData | null => {
  const registrationDate = extractPrimaryExamDateTime(text);
  const recordType = extractRecordType(text);

  if (!registrationDate && !recordType) {
    return null;
  }

  return {
    complaints: '',
    anamnesis: '',
    objectiveStatus: '',
    recommendations: '',
    notes: '',
    ...(registrationDate ? { registrationDate } : {}),
    ...(recordType ? { recordType } : {}),
  };
};

const extractProcedureName = (text: string): string | undefined => {
  const lower = text.toLowerCase();
  const procedureKeywords: Array<[string, string]> = [
    ['Р»С„Рє', 'Р›Р¤Рљ'],
    ['РјР°СЃСЃР°Р¶', 'РњР°СЃСЃР°Р¶'],
    ['С„РёР·РёРѕС‚РµСЂР°Рї', 'Р¤РёР·РёРѕС‚РµСЂР°РїРёСЏ'],
    ['РїСЃРёС…РѕР»РѕРі', 'РџСЃРёС…РѕР»РѕРі'],
    ['РїСЃРёС…РѕРєРѕСЂСЂРµРєС†', 'РџСЃРёС…РѕР»РѕРі'],
    ['РєРѕСЂСЂРµРєС†РёРѕРЅ', 'РџСЃРёС…РѕР»РѕРі'],
  ];
  for (const [keyword, name] of procedureKeywords) {
    if (lower.includes(keyword)) return name;
  }
  // Try to extract after "РѕС‚РјРµС‚СЊ" / "РІС‹РїРѕР»РЅРµРЅРѕ" / "complete"
  const match = text.match(/(?:отметь|выполнено|complete|done)\s+["«]?([\p{L}\p{N}\s-]+?)["»]?(?:$|[,.!?])/iu);
  return match?.[1]?.trim();
};

const updateWorkflow = async (locale: AppLocale, tabId: number, event?: WorkflowEvent): Promise<void> => {
  const current = getAgentState(tabId);
  const workflow = await apiClient.nextWorkflowStep(current.workflowState, locale, event);
  patchAgentState(tabId, {
    workflowState: workflow.state,
    nextSuggestion: workflow.next,
  });
};

const getWorkingDates = (count: number): string[] => {
  const dates: string[] = [];
  const current = new Date();
  while (dates.length < count) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(current.toISOString().slice(0, 10));
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const createDefaultScheduleInput = (): ScheduleGenerationInput => {
  const workingDates = getWorkingDates(9);
  return {
    startDate: workingDates[0] ?? new Date().toISOString().slice(0, 10),
    workingDays: 9,
    workingDates,
    procedures: [
    { id: 'proc-lfk', type: 'lfk', title: 'Р›Р¤Рљ', specialistId: 'spec-lfk', durationMinutes: 30, sessions: 5 },
    { id: 'proc-massage', type: 'massage', title: 'Р›РµС‡РµР±РЅС‹Р№ РјР°СЃСЃР°Р¶', specialistId: 'spec-massage', durationMinutes: 40, sessions: 5 },
    { id: 'proc-physio', type: 'physio', title: 'Р¤РёР·РёРѕС‚РµСЂР°РїРёСЏ', specialistId: 'spec-physio', durationMinutes: 30, sessions: 4 },
    { id: 'proc-psych', type: 'psychology', title: 'РџСЃРёС…РѕР»РѕРі', specialistId: 'spec-psych', durationMinutes: 45, sessions: 4 },
  ],
  specialistAvailability: [
    { specialistId: 'spec-lfk', workStart: '09:00', workEnd: '16:00' },
    { specialistId: 'spec-massage', workStart: '09:00', workEnd: '17:00' },
    { specialistId: 'spec-physio', workStart: '10:00', workEnd: '18:00' },
    { specialistId: 'spec-psych', workStart: '09:00', workEnd: '17:00' },
  ],
  busySlots: [],
  };
};

const executeIntent = async (
  locale: AppLocale,
  tabId: number,
  parsedIntent: ParsedIntent,
  originalText: string,
): Promise<void> => {
  patchAgentState(tabId, { currentStatus: 'executing', currentIntent: parsedIntent });
  await broadcastStateForTab(locale, tabId);

  let execution: ContentExecutionResponse | null = null;

  switch (parsedIntent.intent) {
    case 'navigate': {
      const navTarget = parsedIntent.target ?? 'primary_exam';
      const recordType = navTarget === 'primary_exam' ? extractRecordType(originalText) : undefined;
      execution = await callContent(tabId, {
        type: 'CONTENT_NAVIGATE',
        payload: { target: navTarget, recordType },
      });
      // After navigating to exam/patient page, auto-generate a diagnosis preset
      if (navTarget === 'primary_exam' || navTarget === 'patient_page') {
        callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_GET_PATIENT_INFO' })
          .then(async (info) => {
            const diagnosis = info.patientInfo?.diagnosis;
            if (!diagnosis) return;
            const template = await apiClient.suggestPreset(diagnosis, info.patientInfo ?? {}, locale);
            patchAgentState(tabId, { diagnosisPreset: { diagnosis, template } });
            await broadcastStateForTab(locale, tabId);
          })
          .catch(() => {/* best-effort — don't block navigation */});
      }
      break;
    }
    case 'fill_primary_exam':
    case 'fill_discharge_summary':
    case 'fill_diary': {
      // Smart path: scan DOM → single AI call → direct execution (1 round-trip instead of 2)
      const scanResp = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_SCAN_DOM' });
      if (scanResp.domSnapshot) {
        const actions = await apiClient.smartExecute(originalText, scanResp.domSnapshot);
        // Filter out save/submit button clicks — doctor confirms separately
        const fillOnly = actions.filter((a) => !(a.action === 'click' && /save|submit/i.test(a.sel)));
        if (fillOnly.length > 0) {
          execution = await callContent(tabId, {
            type: 'CONTENT_SMART_EXECUTE',
            payload: { actions: fillOnly },
          });
          break;
        }
      }
      // Fallback: legacy per-intent paths
      if (parsedIntent.intent === 'fill_primary_exam') {
        const fieldUpdateData = isPrimaryExamFieldOnlyUpdate(originalText) ? buildPrimaryExamFieldUpdateData(originalText) : null;
        if (fieldUpdateData) {
          patchAgentState(tabId, { parsedMedicalData: fieldUpdateData });
          execution = await callContent(tabId, { type: 'CONTENT_FILL_PRIMARY', payload: { data: fieldUpdateData } });
          break;
        }

        const medical = await apiClient.parseMedical(originalText, locale);
        const inferredRecordType = extractRecordType(originalText);
        const inferredRegistrationDate = extractPrimaryExamDateTime(originalText);
        const mergedMedicalData: MedicalData = {
          ...medical.data,
          ...(inferredRegistrationDate ? { registrationDate: inferredRegistrationDate } : {}),
          ...(inferredRecordType ? { recordType: inferredRecordType } : {}),
        };
        patchAgentState(tabId, { parsedMedicalData: mergedMedicalData });
        execution = await callContent(tabId, { type: 'CONTENT_FILL_PRIMARY', payload: { data: mergedMedicalData } });
      } else if (parsedIntent.intent === 'fill_discharge_summary') {
        const patientCtx = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_GET_PATIENT_INFO' });
        const dischargeParsed = await apiClient.parseDischargeText(originalText, locale, patientCtx.patientInfo ?? {});
        execution = await callContent(tabId, {
          type: 'CONTENT_FILL_DISCHARGE',
          payload: { text: dischargeParsed.text, dischargeDate: dischargeParsed.dischargeDate, outcome: dischargeParsed.outcome },
        });
      } else {
        const diary = await apiClient.parseDiaryEntry(originalText, locale);
        execution = await callContent(tabId, {
          type: 'CONTENT_FILL_DIARY',
          payload: { text: diary.note, vitals: diary.vitals, entryDate: diary.entryDate },
        });
      }
      break;
    }
    case 'generate_schedule': {
      const contextResponse = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_INSPECT_CONTEXT' });
      const defaults = createDefaultScheduleInput();
      const scheduleInput: ScheduleGenerationInput = {
        ...defaults,
        procedures: contextResponse.context?.procedures?.length ? contextResponse.context.procedures : defaults.procedures,
        specialistAvailability: contextResponse.context?.specialistAvailability?.length
          ? contextResponse.context.specialistAvailability
          : defaults.specialistAvailability,
        busySlots: contextResponse.context?.busySlots ?? [],
      };
      const schedule = await apiClient.generateSchedule(scheduleInput, locale);
      patchAgentState(tabId, { latestSchedule: schedule });
      execution = await callContent(tabId, {
        type: 'CONTENT_APPLY_SCHEDULE',
        payload: { schedule },
      });
      // Auto-navigate to schedule tab so user sees the result immediately
      await callContent(tabId, {
        type: 'CONTENT_NAVIGATE',
        payload: { target: 'schedule_block' },
      }).catch(() => {/* best-effort */});
      break;
    }
    case 'complete_service': {
      const procedureName = extractProcedureName(originalText);
      execution = await callContent(tabId, {
        type: 'CONTENT_COMPLETE_SERVICE',
        payload: { procedureName },
      });
      break;
    }
    case 'open_diary':
      execution = await callContent(tabId, { type: 'CONTENT_OPEN_DIARY' });
      break;
    case 'generate_document':
      execution = await callContent(tabId, { type: 'CONTENT_GENERATE_DOCUMENT' });
      break;
    default:
      throw new Error(translateByLocale(locale, 'bg.err.unknownCommand'));
  }

  if (!execution?.success) {
    throw new Error(execution?.details || translateByLocale(locale, 'bg.err.contentExecutionFailed'));
  }

  pushActionLog(tabId, {
    intent: parsedIntent.intent,
    title: execution.title,
    details: execution.details,
    success: true,
  });

  const FILL_INTENTS_NEEDING_SAVE = new Set(['fill_primary_exam', 'fill_discharge_summary', 'fill_diary']);
  if (FILL_INTENTS_NEEDING_SAVE.has(parsedIntent.intent)) {
    patchAgentState(tabId, { awaitingSaveConfirmation: true });
  }

  const workflowEvent = resolveWorkflowEvent(parsedIntent.intent, parsedIntent.target);
  await updateWorkflow(locale, tabId, workflowEvent);
  patchAgentState(tabId, {
    currentStatus: 'success',
    assistantReply: composeAssistantReply(locale, tabId),
  });
  await broadcastStateForTab(locale, tabId);
};

const ensureTabSupported = (locale: AppLocale, tabState: ActiveTabState): void => {
  if (!tabState.tabId) {
    throw new Error(translateByLocale(locale, 'bg.err.activeTabUnavailable'));
  }
  if (!tabState.contentScriptAvailable) {
    throw new Error(tabState.reason ?? translateByLocale(locale, 'bg.err.contentUnavailable'));
  }
  if (!tabState.activeTabSupported) {
    throw new Error(tabState.reason ?? translateByLocale(locale, 'bg.err.automationUnavailable'));
  }
};

const normalizeForIntentGuard = (text: string): string =>
  ` ${text.toLowerCase().normalize('NFKC').replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim()} `;

const hasAnyMarker = (normalizedText: string, markers: string[]): boolean =>
  markers.some((marker) => normalizedText.includes(marker));

const isPromptLeakCommand = (text: string): boolean => {
  const normalized = normalizeForIntentGuard(text);
  const matches = PROMPT_LEAK_MARKERS.reduce((count, marker) => {
    return normalized.includes(marker) ? count + 1 : count;
  }, 0);
  return matches >= 3;
};

const isServicePayloadCommand = (text: string): boolean => {
  const raw = text.trim().toLowerCase();
  if (!raw) return false;

  if (/^["']?(context|commands?|intent|target|confidence|source|payload)["']?\s*:/.test(raw)) {
    return true;
  }

  if (raw.startsWith('```') || raw.includes('{"intent"') || raw.includes('"commands"')) {
    return true;
  }

  const keyHits = SERVICE_PAYLOAD_KEYWORDS.reduce((count, keyword) => {
    return raw.includes(`"${keyword}"`) || raw.includes(`${keyword}:`) ? count + 1 : count;
  }, 0);

  return keyHits >= 2 && (raw.includes('{') || raw.includes(':'));
};

const isIntentExplicitlyRequested = (
  intent: ParsedIntent,
  rawCommandText: string,
  source: CommandSource,
): boolean => {
  // Trust quick_action and voice fully — user explicitly triggered them
  if (source === 'quick_action' || source === 'voice') return true;

  // For text input: trust AI if confidence is high
  if (intent.confidence >= 0.8) return true;

  // Low-confidence text fallback: use keyword checks
  const normalizedText = normalizeForIntentGuard(rawCommandText);
  switch (intent.intent) {
    case 'navigate':
      return hasAnyMarker(normalizedText, NAVIGATION_VERBS);
    case 'fill_primary_exam':
      return hasAnyMarker(normalizedText, PRIMARY_FILL_MARKERS);
    case 'fill_discharge_summary':
      return hasAnyMarker(normalizedText, DISCHARGE_MARKERS);
    case 'fill_diary':
      return hasAnyMarker(normalizedText, DIARY_MARKERS);
    case 'generate_schedule':
      return hasAnyMarker(normalizedText, SCHEDULE_MARKERS);
    case 'complete_service':
      return hasAnyMarker(normalizedText, COMPLETE_MARKERS);
    case 'open_diary':
      return hasAnyMarker(normalizedText, DIARY_MARKERS);
    default:
      return false;
  }
};

const hasExplicitChainCommand = (text: string): boolean => {
  const normalized = ` ${text.toLowerCase().trim()} `;
  return EXPLICIT_CHAIN_MARKERS.some((marker) => normalized.includes(marker));
};

const isGenerateAssignmentCommand = (text: string): boolean => {
  const normalized = ` ${text.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()} `;
  return GENERATE_ASSIGNMENT_MARKERS.some((marker) => normalized.includes(marker));
};

const isDescribePatientCommand = (text: string): boolean => {
  const normalized = ` ${text.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()} `;
  return DESCRIBE_PATIENT_MARKERS.some((marker) => normalized.includes(marker));
};

const planIntentExecution = (
  intents: ParsedIntent[],
  text: string,
  source: CommandSource,
): { planned: ParsedIntent[]; wasTrimmed: boolean; total: number } => {
  const total = intents.length;
  if (total <= 1) {
    return { planned: intents, wasTrimmed: false, total };
  }

  // quick_action always executes all
  if (source === 'quick_action') {
    return { planned: intents, wasTrimmed: false, total };
  }

  // Voice: allow up to 3 intents if AI returned multiple (user gave a compound command)
  if (source === 'voice') {
    return { planned: intents.slice(0, 3), wasTrimmed: total > 3, total };
  }

  if (!hasExplicitChainCommand(text)) {
    return { planned: intents.slice(0, 1), wasTrimmed: true, total };
  }

  const planned = intents.slice(0, 4);
  return { planned, wasTrimmed: total > planned.length, total };
};

export const getCurrentPopupSnapshot = async (): Promise<PopupStateSnapshot> => {
  const locale = await getStoredLocale();
  const tabState = await loadActiveTabState(locale);
  if (tabState.tabId) {
    return broadcastStateForTab(locale, tabState.tabId);
  }
  return snapshotForTab(tabState);
};

export const openPanelOnActiveTab = async (): Promise<PopupStateSnapshot> => {
  const locale = await getStoredLocale();
  const tabState = await loadActiveTabState(locale);
  if (!tabState.tabId) {
    throw new Error(translateByLocale(locale, 'bg.err.activeTabUnavailable'));
  }
  if (!tabState.contentScriptAvailable) {
    throw new Error(tabState.reason ?? translateByLocale(locale, 'bg.err.contentUnavailable'));
  }

  const response = await callContent<ContentExecutionResponse>(tabState.tabId, { type: 'CONTENT_OPEN_PANEL' });
  if (!response.success) {
    throw new Error(response.details ?? translateByLocale(locale, 'bg.err.openPanelFailed'));
  }

  setPanelVisible(tabState.tabId, true);
  patchAgentState(tabState.tabId, { currentStatus: 'success' });
  return broadcastStateForTab(locale, tabState.tabId);
};

export const setVoiceStatus = async (status: 'listening' | 'idle'): Promise<PopupStateSnapshot> => {
  const locale = await getStoredLocale();
  const tab = await getActiveTab();
  const tabId = tab.id;
  if (!tabId) {
    return getCurrentPopupSnapshot();
  }
  patchAgentState(tabId, { currentStatus: status });
  return broadcastStateForTab(locale, tabId);
};

export const handleCommand = async (
  text: string,
  tabIdOverride?: number,
  source: CommandSource = 'text',
): Promise<PopupStateSnapshot> => {
  const locale = await getStoredLocale();
  const tab = tabIdOverride ? await chrome.tabs.get(tabIdOverride) : await getActiveTab();
  const tabId = tab.id;
  if (!tabId) {
    throw new Error(translateByLocale(locale, 'bg.err.activeTabUnavailable'));
  }

  const tabState = await loadActiveTabState(locale, tab);
  ensureTabSupported(locale, tabState);

  if (isPromptLeakCommand(text)) {
    throw new Error('Распознана служебная подсказка STT, а не команда пользователя. Повторите голосовую команду.');
  }
  if (isServicePayloadCommand(text)) {
    throw new Error(translateByLocale(locale, 'bg.err.servicePayloadDetected'));
  }
  if (isGenerateAssignmentCommand(text)) {
    return handleGenerateAssignment(tabId);
  }
  if (isDescribePatientCommand(text)) {
    return handleDescribePatient(text, tabId);
  }

  patchAgentState(tabId, {
    transcript: text,
    currentStatus: 'processing',
    completionMessage: null,
    assistantReply: null,
  });
  await broadcastStateForTab(locale, tabId);

  // Load per-patient memory (best-effort — ignore if not on a patient page)
  let patientInfo: Record<string, string> = {};
  let patientMemoryContext: string | undefined;
  try {
    const patientResp = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_GET_PATIENT_INFO' });
    if (patientResp.patientInfo && Object.keys(patientResp.patientInfo).length > 0) {
      patientInfo = patientResp.patientInfo;
      const memEntries = await loadPatientMemory(patientInfo);
      patientMemoryContext = formatPatientMemoryForPrompt(memEntries) || undefined;
    }
  } catch {
    // not on patient page — proceed without memory
  }

  try {
    const intents = await apiClient.parseMultiIntent(text, locale, patientMemoryContext);
    const { planned, wasTrimmed, total } = planIntentExecution(intents, text, source);
    const isMulti = planned.length > 1;

    // Fill intents need the full original text so parseMedical/parseDiary/parseDischarge
    // have the actual field data, not the short summary GPT wrote in normalizedText.
    const FILL_INTENTS = new Set(['fill_primary_exam', 'fill_discharge_summary', 'fill_diary']);

    for (let i = 0; i < planned.length; i++) {
      const intent = planned[i];
      if (!intent) continue;

      if (!isIntentExplicitlyRequested(intent, text, source)) {
        throw new Error('Команда не подтверждена. Сформулируйте действие явно (например: "открой первичный прием").');
      }

      const commandText = FILL_INTENTS.has(intent.intent) ? text : intent.normalizedText;

      if (isMulti) {
        patchAgentState(tabId, {
          transcript: `[${i + 1}/${planned.length}] ${intent.normalizedText}`,
          currentStatus: 'processing',
        });
        await broadcastStateForTab(locale, tabId);
      }

      await executeIntent(locale, tabId, intent, commandText);

      // Give the page DOM time to settle between commands (tabs need ~300ms, page nav needs more)
      if (isMulti && i < planned.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1200));
      }
    }

    const completedCount = planned.length;
    const completionMessage =
      wasTrimmed
        ? `Detected ${total} actions. For safety, only the first action was executed. Use "then/затем" to run a chain.`
        : completedCount > 1
          ? `All ${completedCount} actions completed.`
          : 'Action completed.';
    const finalState = getAgentState(tabId);
    patchAgentState(tabId, {
      completionMessage,
      assistantReply: composeAssistantReply(locale, tabId, {
        completedCount,
        total,
        wasTrimmed,
      }),
    });

    // Save to per-patient memory
    if (Object.keys(patientInfo).length > 0) {
      void savePatientMemoryEntry(patientInfo, {
        command: text,
        intent: planned[0]?.intent ?? 'unknown',
        action: finalState.lastExecutedAction ?? null,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : translateByLocale(locale, 'bg.err.unknownCommandError');
    pushErrorLog(tabId, message);
    pushActionLog(tabId, {
      intent: 'unknown',
      title: translateByLocale(locale, 'bg.err.commandExecutionFailed'),
      details: message,
      success: false,
    });
    patchAgentState(tabId, {
      completionMessage: null,
      nextSuggestion: null,
      currentStatus: 'error',
      assistantReply: composeAssistantReply(locale, tabId, { errorMessage: message }),
    });
    await broadcastStateForTab(locale, tabId);
  }

  return broadcastStateForTab(locale, tabId);
};

const extractDischargeSummaryFromSnapshot = (snapshot?: ContentExecutionResponse['domSnapshot']): string => {
  if (!snapshot?.fields?.length) return '';
  return snapshot.fields
    .filter((field) => {
      const source = `${field.label ?? ''} ${field.sel ?? ''}`.toLowerCase();
      return /эпикриз|discharge|выписк|shygaru|epicrisis/.test(source);
    })
    .map((field) => `${field.label || field.sel}: ${field.val ?? ''}`.trim())
    .filter((line) => line.length > 0)
    .join('\n');
};

const extractPatientBriefFields = (
  snapshot?: ContentExecutionResponse['domSnapshot'],
): Array<{ label: string; value: string }> => {
  if (!snapshot?.fields?.length) return [];
  const relevant = /жалоб|анамн|объектив|рекомендац|назначен|примечан|диагноз|осмотр|эпикриз|дневник|температур|пульс|давлен|spo2|чсс/i;
  return snapshot.fields
    .map((field) => ({
      label: (field.label || field.sel || '').trim(),
      value: String(field.val ?? '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((field) => field.label.length > 0 || field.value.length > 0)
    .filter((field) => relevant.test(`${field.label} ${field.value}`) || field.value.length >= 20)
    .map((field) => ({
      label: field.label.slice(0, 120),
      value: field.value.slice(0, 500),
    }))
    .slice(0, 30);
};

export const handleSuggestion = async (action: string): Promise<PopupStateSnapshot> => {
  const locale = await getStoredLocale();
  const command = translateByLocale(locale, ACTION_TO_COMMAND_KEY[action] ?? action);
  return handleCommand(command, undefined, 'quick_action');
};

export const handleDescribePatient = async (
  commandText: string,
  tabIdOverride?: number,
): Promise<PopupStateSnapshot> => {
  const locale = await getStoredLocale();
  const tab = tabIdOverride ? await chrome.tabs.get(tabIdOverride) : await getActiveTab();
  const tabId = tab.id;
  if (!tabId) {
    throw new Error(translateByLocale(locale, 'bg.err.activeTabUnavailable'));
  }

  const tabState = await loadActiveTabState(locale, tab);
  ensureTabSupported(locale, tabState);

  const pseudoIntent: ParsedIntent = {
    intent: 'generate_document',
    confidence: 0.95,
    normalizedText: commandText,
    source: 'fallback',
  };
  const actionTitle = 'Рассказ о пациенте';

  patchAgentState(tabId, {
    transcript: commandText,
    currentIntent: pseudoIntent,
    currentStatus: 'processing',
    completionMessage: null,
    assistantReply: null,
  });
  await broadcastStateForTab(locale, tabId);

  try {
    const patientInfoResponse = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_GET_PATIENT_INFO' });
    const domSnapshotResponse = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_SCAN_DOM' });
    const patientInfo = patientInfoResponse.patientInfo ?? {};
    const briefFields = extractPatientBriefFields(domSnapshotResponse.domSnapshot);

    if (Object.keys(patientInfo).length === 0 && briefFields.length === 0) {
      throw new Error('Не удалось получить данные пациента с текущей страницы.');
    }

    const described = await apiClient.describePatient(
      {
        patientInfo,
        pageType: domSnapshotResponse.domSnapshot?.pageType,
        fields: briefFields,
        command: commandText,
      },
      locale,
    );

    pushActionLog(tabId, {
      intent: 'generate_document',
      title: actionTitle,
      details: described.summary,
      success: true,
    });
    patchAgentState(tabId, {
      currentStatus: 'success',
      completionMessage: actionTitle,
      assistantReply: described.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : translateByLocale(locale, 'bg.err.unknownCommandError');
    pushErrorLog(tabId, message);
    pushActionLog(tabId, {
      intent: 'unknown',
      title: translateByLocale(locale, 'bg.err.commandExecutionFailed'),
      details: message,
      success: false,
    });
    patchAgentState(tabId, {
      completionMessage: null,
      nextSuggestion: null,
      currentStatus: 'error',
      assistantReply: composeAssistantReply(locale, tabId, { errorMessage: message }),
    });
  }

  return broadcastStateForTab(locale, tabId);
};

export const handleGenerateAssignment = async (tabIdOverride?: number): Promise<PopupStateSnapshot> => {
  const locale = await getStoredLocale();
  const tab = tabIdOverride ? await chrome.tabs.get(tabIdOverride) : await getActiveTab();
  const tabId = tab.id;
  if (!tabId) {
    throw new Error(translateByLocale(locale, 'bg.err.activeTabUnavailable'));
  }

  const tabState = await loadActiveTabState(locale, tab);
  ensureTabSupported(locale, tabState);

  const current = getAgentState(tabId);
  patchAgentState(tabId, {
    transcript: translateByLocale(locale, 'bg.action.generateAssignment'),
    currentStatus: 'processing',
    completionMessage: null,
    assistantReply: null,
  });
  await broadcastStateForTab(locale, tabId);

  try {
    const patientInfoResponse = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_GET_PATIENT_INFO' });
    const domSnapshotResponse = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_SCAN_DOM' });

    const generated = await apiClient.generateAssignment(
      {
        patientInfo: patientInfoResponse.patientInfo ?? {},
        primaryExam: current.parsedMedicalData,
        dischargeSummary: extractDischargeSummaryFromSnapshot(domSnapshotResponse.domSnapshot) || undefined,
        command: translateByLocale(locale, 'bg.action.generateAssignment'),
      },
      locale,
    );

    const nextNotes = [current.parsedMedicalData?.notes?.trim(), generated.notes?.trim()]
      .filter((value): value is string => Boolean(value))
      .join('\n\n');

    const updatedMedicalData: MedicalData = {
      complaints: current.parsedMedicalData?.complaints ?? '',
      anamnesis: current.parsedMedicalData?.anamnesis ?? '',
      objectiveStatus: current.parsedMedicalData?.objectiveStatus ?? '',
      recommendations: generated.recommendations,
      notes: nextNotes,
      ...(current.parsedMedicalData?.registrationDate ? { registrationDate: current.parsedMedicalData.registrationDate } : {}),
      ...(current.parsedMedicalData?.recordType ? { recordType: current.parsedMedicalData.recordType } : {}),
    };

    // Assignment text belongs to primary exam recommendations/notes.
    await callContent(tabId, {
      type: 'CONTENT_NAVIGATE',
      payload: { target: 'primary_exam' },
    }).catch(() => {/* best-effort */});

    const execution = await callContent<ContentExecutionResponse>(tabId, {
      type: 'CONTENT_FILL_PRIMARY',
      payload: {
        data: {
          complaints: '',
          anamnesis: '',
          objectiveStatus: '',
          recommendations: updatedMedicalData.recommendations,
          notes: updatedMedicalData.notes,
        },
      },
    });

    if (!execution.success) {
      throw new Error(execution.details || translateByLocale(locale, 'bg.err.contentExecutionFailed'));
    }

    patchAgentState(tabId, {
      parsedMedicalData: updatedMedicalData,
      awaitingSaveConfirmation: true,
      currentStatus: 'success',
      completionMessage: translateByLocale(locale, 'bg.action.generateAssignment'),
    });
    pushActionLog(tabId, {
      intent: 'fill_primary_exam',
      title: translateByLocale(locale, 'bg.action.generateAssignment'),
      details: execution.details,
      success: true,
    });

    await updateWorkflow(locale, tabId, 'primary_exam_filled');
    patchAgentState(tabId, {
      assistantReply: composeAssistantReply(locale, tabId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : translateByLocale(locale, 'bg.err.unknownCommandError');
    pushErrorLog(tabId, message);
    pushActionLog(tabId, {
      intent: 'unknown',
      title: translateByLocale(locale, 'bg.err.commandExecutionFailed'),
      details: message,
      success: false,
    });
    patchAgentState(tabId, {
      completionMessage: null,
      nextSuggestion: null,
      currentStatus: 'error',
      assistantReply: composeAssistantReply(locale, tabId, { errorMessage: message }),
    });
  }

  return broadcastStateForTab(locale, tabId);
};

export const sendCurrentState = async (): Promise<void> => {
  await getCurrentPopupSnapshot();
};

export const handleSaveForm = async (): Promise<void> => {
  const locale = await getStoredLocale();
  const tab = await getActiveTab();
  const tabId = tab.id;
  if (!tabId) return;
  try {
    const result = await callContent<ContentExecutionResponse>(tabId, { type: 'CONTENT_SAVE_FORM' });
    if (result.success) {
      pushActionLog(tabId, { intent: 'fill_primary_exam', title: result.title, details: result.details, success: true });
      patchAgentState(tabId, { currentStatus: 'success', assistantReply: 'Форму сохранил в системе.' });
    } else {
      patchAgentState(tabId, {
        currentStatus: 'error',
        lastExecutedAction: null,
        assistantReply: `Не удалось сохранить форму: ${result.details ?? 'неизвестная ошибка'}`,
      });
    }
  } catch {
    patchAgentState(tabId, {
      currentStatus: 'error',
      lastExecutedAction: null,
      assistantReply: 'Кнопка сохранения не найдена на текущей странице. Сохраните вручную.',
    });
  }
  patchAgentState(tabId, { awaitingSaveConfirmation: false });
  await broadcastStateForTab(locale, tabId);
};

export const handleCancelSave = async (): Promise<void> => {
  const locale = await getStoredLocale();
  const tab = await getActiveTab();
  const tabId = tab.id;
  if (!tabId) return;
  patchAgentState(tabId, {
    awaitingSaveConfirmation: false,
    currentStatus: 'idle',
    assistantReply: 'Сохранение отменено. Могу продолжить по вашей следующей команде.',
  });
  await broadcastStateForTab(locale, tabId);
};

export const handleApplyPreset = async (): Promise<void> => {
  const locale = await getStoredLocale();
  const tab = await getActiveTab();
  const tabId = tab.id;
  if (!tabId) return;
  const state = getAgentState(tabId);
  if (!state.diagnosisPreset) return;
  const template = state.diagnosisPreset.template;
  const data: MedicalData = {
    complaints: template.complaints ?? '',
    anamnesis: template.anamnesis ?? '',
    objectiveStatus: template.objectiveStatus ?? '',
    recommendations: template.recommendations ?? '',
    notes: template.notes ?? '',
  };
  patchAgentState(tabId, {
    parsedMedicalData: data,
    currentStatus: 'executing',
    assistantReply: null,
  });
  await broadcastStateForTab(locale, tabId);
  try {
    const execution = await callContent<ContentExecutionResponse>(tabId, {
      type: 'CONTENT_FILL_PRIMARY',
      payload: { data },
    });
    pushActionLog(tabId, { intent: 'fill_primary_exam', title: execution.title, details: execution.details, success: execution.success });
    patchAgentState(tabId, {
      awaitingSaveConfirmation: true,
      currentStatus: 'success',
      assistantReply: 'Применил шаблон по диагнозу и заполнил поля. Проверьте данные и подтвердите сохранение.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushErrorLog(tabId, message);
    patchAgentState(tabId, {
      assistantReply: composeAssistantReply(locale, tabId, { errorMessage: message }),
    });
  }
  await broadcastStateForTab(locale, tabId);
};
