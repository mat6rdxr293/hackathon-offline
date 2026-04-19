import {
  medicalParseResultSchema,
  normalizeCommandText,
  parsedIntentSchema,
  scheduleGenerationResultSchema,
  translateByLocale,
  workflowNextStepSchema,
  type AppLocale,
  type MedicalData,
  type MedicalParseResult,
  type ParsedIntent,
  type ScheduleGenerationInput,
  type ScheduleGenerationResult,
  type WorkflowEvent,
  type WorkflowNextStep,
  type WorkflowState,
} from '@hackathon/shared';

import type { DomAction, PageSnapshot } from '../modules/dom/domEngine';

import { OPENAI_API_KEY, OPENAI_TIMEOUT_MS } from '../constants/api';

const GPT_MODEL = 'gpt-4o';

export type MedicalDocumentExtractedData = {
  diagnoses: string[];
  complaints: string[];
  anamnesis: string;
  labFindings: string[];
  physicianConclusions: string[];
  assignments: string[];
  hospitalizationDate: string | null;
  dischargeDate: string | null;
  summary: string;
  warnings: string[];
};

export type MedicalDocumentAnalysis = {
  extracted: MedicalDocumentExtractedData;
  contextForPrompt: string;
};

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
    .slice(0, 20);
};

const normalizeTextField = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const normalizeDateField = (value: unknown): string | null => {
  const text = normalizeTextField(value);
  return text || null;
};

const buildDocumentSummary = (data: Omit<MedicalDocumentExtractedData, 'summary' | 'warnings'>): string => {
  const parts: string[] = [];
  if (data.diagnoses.length) parts.push(`Диагнозы: ${data.diagnoses.join('; ')}`);
  if (data.complaints.length) parts.push(`Жалобы: ${data.complaints.join('; ')}`);
  if (data.anamnesis) parts.push(`Анамнез: ${data.anamnesis}`);
  if (data.labFindings.length) parts.push(`Лабораторные показатели: ${data.labFindings.join('; ')}`);
  if (data.physicianConclusions.length) parts.push(`Заключения врачей: ${data.physicianConclusions.join('; ')}`);
  if (data.assignments.length) parts.push(`Назначения: ${data.assignments.join('; ')}`);
  if (data.hospitalizationDate || data.dischargeDate) {
    parts.push(
      `Даты: госпитализация ${data.hospitalizationDate ?? 'не указана'}, выписка ${data.dischargeDate ?? 'не указана'}`,
    );
  }

  if (!parts.length) {
    return 'Ключевые медицинские данные из документа не извлечены уверенно.';
  }

  return parts.join('\n');
};

const buildDocumentPromptContext = (data: MedicalDocumentExtractedData): string => {
  const chunks: string[] = ['КОНТЕКСТ ИЗ ЗАГРУЖЕННОГО ДОКУМЕНТА (проверено врачом):'];
  if (data.diagnoses.length) chunks.push(`- Диагнозы: ${data.diagnoses.join('; ')}`);
  if (data.complaints.length) chunks.push(`- Жалобы: ${data.complaints.join('; ')}`);
  if (data.anamnesis) chunks.push(`- Анамнез: ${data.anamnesis}`);
  if (data.labFindings.length) chunks.push(`- Лабораторные показатели: ${data.labFindings.join('; ')}`);
  if (data.physicianConclusions.length) chunks.push(`- Заключения врачей: ${data.physicianConclusions.join('; ')}`);
  if (data.assignments.length) chunks.push(`- Назначения: ${data.assignments.join('; ')}`);
  if (data.hospitalizationDate) chunks.push(`- Дата госпитализации: ${data.hospitalizationDate}`);
  if (data.dischargeDate) chunks.push(`- Дата выписки: ${data.dischargeDate}`);
  if (data.summary) chunks.push(`- Краткое резюме: ${data.summary}`);
  return chunks.join('\n');
};

const callGpt = async (
  systemPrompt: string,
  userMessage: string,
): Promise<unknown> => {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: GPT_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(json.choices[0]?.message?.content ?? '{}');
};

// Deterministic workflow state machine вЂ” no AI needed
const WORKFLOW_TRANSITIONS: Record<
  WorkflowState,
  { nextRecommendedAction: WorkflowNextStep['nextRecommendedAction']; messageKey: string }
> = {
  idle:                 { nextRecommendedAction: 'navigate',           messageKey: 'workflow.idle.message' },
  patient_opened:       { nextRecommendedAction: 'fill_primary_exam',  messageKey: 'workflow.patient_opened.message' },
  primary_exam_opened:  { nextRecommendedAction: 'fill_primary_exam',  messageKey: 'workflow.primary_exam_opened.message' },
  primary_exam_filled:  { nextRecommendedAction: 'generate_schedule',  messageKey: 'workflow.primary_exam_filled.message' },
  schedule_ready:       { nextRecommendedAction: 'complete_service',   messageKey: 'workflow.schedule_ready.message' },
  service_completed:    { nextRecommendedAction: 'open_diary',         messageKey: 'workflow.service_completed.message' },
  diary_updated:        { nextRecommendedAction: 'generate_schedule',  messageKey: 'workflow.diary_updated.message' },
};

const EVENT_TO_STATE: Partial<Record<WorkflowEvent, WorkflowState>> = {
  patient_opened:    'patient_opened',
  primary_exam_opened: 'primary_exam_opened',
  primary_exam_filled: 'primary_exam_filled',
  schedule_generated: 'schedule_ready',
  service_completed: 'service_completed',
  diary_updated:     'diary_updated',
  reset:             'idle',
};

const START_CARD_ACTION_MARKERS = [
  'Р·Р°РїРѕР»РЅ',
  'РґР°РІР°Р№ Р·Р°РїРѕР»РЅРёРј',
  'РЅСѓР¶РЅРѕ Р·Р°РїРѕР»РЅРёС‚СЊ',
  'РЅР°РґРѕ Р·Р°РїРѕР»РЅРёС‚СЊ',
  'РѕС„РѕСЂРјРё',
  'РѕС„РѕСЂРјРёС‚СЊ',
  'РІРЅРµСЃРё РґР°РЅРЅС‹Рµ',
  'РІРЅРµСЃС‚Рё РґР°РЅРЅС‹Рµ',
  'С‚РѕР»С‚С‹СЂ',
  'С‚РѕР»С‚С‹СЂР°Р№',
  'fill',
  'complete',
];
const START_CARD_PATIENT_MARKERS = ['РїР°С†РёРµРЅС‚', 'РЅР°СѓТ›Р°СЃ', 'patient'];
const START_CARD_OBJECT_MARKERS = ['РєР°СЂС‚РѕС‡Рє', 'РєР°СЂС‚Р°', 'РєР°СЂС‚', 'РјРµРґРєР°СЂС‚', 'card', 'chart'];

const includesAny = (text: string, markers: string[]): boolean =>
  markers.some((marker) => text.includes(marker));

const PRIMARY_FIELD_UPDATE_ACTION_MARKERS = [
  'РёР·РјРµРЅРё',
  'СЃРјРµРЅРё',
  'РїРµСЂРµРєР»СЋС‡Рё',
  'РІС‹Р±РµСЂРё',
  'СѓСЃС‚Р°РЅРѕРІРё',
  'РїРѕСЃС‚Р°РІСЊ',
  'РѕР±РЅРѕРІРё',
  'set',
  'change',
  'switch',
  'update',
];

const PRIMARY_FIELD_UPDATE_MARKERS = [
  'С‚РёРї Р·Р°РїРёСЃРё',
  'record type',
  'РґР°С‚Р° Рё РІСЂРµРјСЏ',
  'РґР°С‚Р° РѕСЃРјРѕС‚СЂР°',
  'РІСЂРµРјСЏ РѕСЃРјРѕС‚СЂР°',
  'РґР°С‚Р° СЂРµРіРёСЃС‚СЂР°С†РёРё',
  'РІСЂРµРјСЏ СЂРµРіРёСЃС‚СЂР°С†РёРё',
];

const PRIMARY_RECORD_TYPE_MARKERS = [
  'РѕСЃРјРѕС‚СЂ РІСЂР°С‡Р° РїСЂРёС‘РјРЅРѕРіРѕ РїРѕРєРѕСЏ',
  'РѕСЃРјРѕС‚СЂ РІСЂР°С‡Р° РїСЂРёРµРјРЅРѕРіРѕ РїРѕРєРѕСЏ',
  'РѕСЃРјРѕС‚СЂ РїСЂРёС‘РјРЅРѕРіРѕ РїРѕРєРѕСЏ',
  'РѕСЃРјРѕС‚СЂ РїСЂРёРµРјРЅРѕРіРѕ РїРѕРєРѕСЏ',
  'РїРµСЂРІРёС‡РЅС‹Р№ РѕСЃРјРѕС‚СЂ',
  'РїР»Р°РЅРѕРІС‹Р№ РѕСЃРјРѕС‚СЂ',
  'РёС‚РѕРіРѕРІР°СЏ Р·Р°РїРёСЃСЊ',
];

const hasPrimaryExamFieldUpdateIntent = (normalizedText: string, rawText: string): boolean => {
  const rawLower = rawText.toLowerCase().normalize('NFKC');
  const hasUpdateAction = includesAny(normalizedText, PRIMARY_FIELD_UPDATE_ACTION_MARKERS);
  const hasFieldMarker = includesAny(normalizedText, PRIMARY_FIELD_UPDATE_MARKERS);
  const hasRecordType = includesAny(normalizedText, PRIMARY_RECORD_TYPE_MARKERS);
  const hasDateTimeValue =
    /\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/.test(rawLower) ||
    /\b\d{1,2}[:.]\d{2}\b/.test(rawLower) ||
    /\b(СЃРµРіРѕРґРЅСЏ|Р·Р°РІС‚СЂР°|РІС‡РµСЂР°)\b/u.test(rawLower);

  if (hasFieldMarker && (hasUpdateAction || hasRecordType || hasDateTimeValue)) {
    return true;
  }
  if (hasUpdateAction && hasRecordType) {
    return true;
  }
  if (normalizedText.includes('С‚РёРї Р·Р°РїРёСЃРё') && hasRecordType) {
    return true;
  }
  return false;
};

const localFallbackParseIntent = (text: string): ParsedIntent | null => {
  const normalizedText = normalizeCommandText(text);
  if (!normalizedText) return null;

  const hasAction = includesAny(normalizedText, START_CARD_ACTION_MARKERS);
  const hasPatient = includesAny(normalizedText, START_CARD_PATIENT_MARKERS);
  const hasCardObject = includesAny(normalizedText, START_CARD_OBJECT_MARKERS);

  if (hasAction && hasPatient && hasCardObject) {
    return {
      intent: 'navigate',
      target: 'primary_exam',
      confidence: 0.9,
      normalizedText,
      source: 'fallback',
    };
  }

  if (hasPrimaryExamFieldUpdateIntent(normalizedText, text)) {
    return {
      intent: 'fill_primary_exam',
      confidence: 0.86,
      normalizedText,
      source: 'fallback',
    };
  }

  return null;
};

export const apiClient = {
  parseIntent: async (text: string, locale: AppLocale): Promise<ParsedIntent> => {
    const localFallback = localFallbackParseIntent(text);
    try {
      const raw = await callGpt(
      `РўС‹ РєР»Р°СЃСЃРёС„РёРєР°С‚РѕСЂ РєРѕРјР°РЅРґ РґР»СЏ РјРµРґРёС†РёРЅСЃРєРѕР№ РёРЅС„РѕСЂРјР°С†РёРѕРЅРЅРѕР№ СЃРёСЃС‚РµРјС‹ (СЃС‚Р°С†РёРѕРЅР°СЂ).
РћРїСЂРµРґРµР»Рё РЅР°РјРµСЂРµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ. Р’РµСЂРЅРё JSON СЃС‚СЂРѕРіРѕ РїРѕ СЃС…РµРјРµ.

INTENT вЂ” РІС‹Р±РµСЂРё РћР”РќРћ:
вЂў "navigate"               вЂ” С‚РѕР»СЊРєРѕ РµСЃР»Рё СЏРІРЅРѕ РїСЂРѕСЃСЏС‚ РћРўРљР Р«РўР¬ / РџР•Р Р•Р™РўР / РџРћРљРђР—РђРўР¬ СЂР°Р·РґРµР»
вЂў "fill_primary_exam"      вЂ” Р·Р°РїРѕР»РЅРёС‚СЊ Р¶Р°Р»РѕР±С‹, Р°РЅР°РјРЅРµР·, РѕР±СЉРµРєС‚РёРІРЅС‹Р№ СЃС‚Р°С‚СѓСЃ, РЅР°Р·РЅР°С‡РµРЅРёСЏ, РїСЂРёРјРµС‡Р°РЅРёСЏ
вЂў "fill_discharge_summary" вЂ” Р·Р°РїРѕР»РЅРёС‚СЊ/РЅР°РїРёСЃР°С‚СЊ/Р·Р°РїРёСЃР°С‚СЊ Р’Р«РџРРЎРќРћР™ Р­РџРРљР РР—
вЂў "fill_diary"             вЂ” Р·Р°РїРѕР»РЅРёС‚СЊ РґРЅРµРІРЅРёРєРѕРІСѓСЋ Р·Р°РїРёСЃСЊ РёР»Рё РїРѕРєР°Р·Р°С‚РµР»Рё (С‚РµРјРїРµСЂР°С‚СѓСЂР°, РїСѓР»СЊСЃ, РђР”, SpO2)
вЂў "generate_schedule"      вЂ” СЃС„РѕСЂРјРёСЂРѕРІР°С‚СЊ/СЃРѕСЃС‚Р°РІРёС‚СЊ СЂР°СЃРїРёСЃР°РЅРёРµ РїСЂРѕС†РµРґСѓСЂ
вЂў "complete_service"       вЂ” РѕС‚РјРµС‚РёС‚СЊ РїСЂРѕС†РµРґСѓСЂСѓ РІС‹РїРѕР»РЅРµРЅРЅРѕР№
вЂў "open_diary"             вЂ” РѕС‚РєСЂС‹С‚СЊ/РїРµСЂРµР№С‚Рё РІ РґРЅРµРІРЅРёРє Р»РµС‡РµРЅРёСЏ
вЂў "generate_document"      вЂ” СЃС„РѕСЂРјРёСЂРѕРІР°С‚СЊ/СЃРєР°С‡Р°С‚СЊ/СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ/СЂР°СЃРїРµС‡Р°С‚Р°С‚СЊ РјРµРґРёС†РёРЅСЃРєРёР№ РґРѕРєСѓРјРµРЅС‚ / РІС‹РїРёСЃРєСѓ / PDF
вЂў "unknown"                вЂ” РІСЃС‘ РѕСЃС‚Р°Р»СЊРЅРѕРµ

TARGET вЂ” Р·Р°РїРѕР»РЅСЏР№ РўРћР›Р¬РљРћ РµСЃР»Рё intent = "navigate", РёРЅР°С‡Рµ РќР• РІРєР»СЋС‡Р°Р№ РїРѕР»Рµ РІРѕРѕР±С‰Рµ.
РЎС‚СЂРѕРіРѕ РѕРґРЅРѕ РёР·: patients_list | patient_page | primary_exam | discharge_summary | treatment_diary | procedures | schedule_block

РўРђР‘Р›РР¦Рђ РЎРћРћРўР’Р•РўРЎРўР’РРЇ (СЂСѓСЃСЃРєРёР№ / РєР°Р·Р°С…СЃРєРёР№ в†’ target):
  "РјРµРґРёС†РёРЅСЃРєРёРµ Р·Р°РїРёСЃРё" / "РјРµРґ Р·Р°РїРёСЃРё" / "РїРµСЂРІРёС‡РЅС‹Р№ РѕСЃРјРѕС‚СЂ" / "РїРµСЂРІРёС‡РЅС‹Р№ РїСЂРёС‘Рј"
    / "РїР»Р°РЅРѕРІС‹Р№ РѕСЃРјРѕС‚СЂ" / "РѕСЃРјРѕС‚СЂ РїСЂРёС‘РјРЅРѕРіРѕ РїРѕРєРѕСЏ" / "РёС‚РѕРіРѕРІР°СЏ Р·Р°РїРёСЃСЊ"
    / "РјРµРґРёС†РёРЅР°Р»С‹Т› Р¶Р°Р·Р±Р°Р»Р°СЂ" / "Р°Р»Т“Р°С€Т›С‹ С‚РµРєСЃРµСЂСѓ" / "Р°Р»Т“Р°С€Т›С‹ Т›Р°Р±С‹Р»РґР°Сѓ"           в†’ primary_exam
  "РІС‹РїРёСЃРЅРѕР№ СЌРїРёРєСЂРёР·" / "СЌРїРёРєСЂРёР·" / "РІС‹РїРёСЃРєР°"
    / "С€С‹Т“Р°СЂСѓ СЌРїРёРєСЂРёР·С–" / "С€С‹Т“Р°СЂСѓ Т›РѕСЂС‹С‚С‹РЅРґС‹СЃС‹"                                   в†’ discharge_summary
  "РґРЅРµРІРЅРёРєРѕРІС‹Рµ Р·Р°РїРёСЃРё" / "РґРЅРµРІРЅРёРє" / "РґРЅРµРІРЅРёРє Р»РµС‡РµРЅРёСЏ"
    / "РєТЇРЅРґРµР»С–РєС‚С– Р¶Р°Р·Р±Р°Р»Р°СЂ" / "РєТЇРЅРґРµР»С–Рє" / "РµРјРґРµСѓ РєТЇРЅРґРµР»С–РіС–"                    в†’ treatment_diary
  "РЅР°Р·РЅР°С‡РµРЅРёСЏ" / "РїСЂРѕС†РµРґСѓСЂС‹" / "СѓСЃР»СѓРіРё"
    / "С‚Р°Т“Р°Р№С‹РЅРґР°СѓР»Р°СЂ" / "РїСЂРѕС†РµРґСѓСЂР°Р»Р°СЂ" / "Т›С‹Р·РјРµС‚С‚РµСЂ"                             в†’ procedures
  "СЂР°СЃРїРёСЃР°РЅРёРµ" / "СЂР°СЃРїРёСЃР°РЅРёРµ РїСЂРѕС†РµРґСѓСЂ" / "РіСЂР°С„РёРє"
    / "РєРµСЃС‚Рµ" / "РїСЂРѕС†РµРґСѓСЂР° РєРµСЃС‚РµСЃС–" / "Р¶Т±РјС‹СЃ РєРµСЃС‚РµСЃС–"                           в†’ schedule_block
  "РєР°СЂС‚РѕС‡РєР° РїР°С†РёРµРЅС‚Р°" / "РїСЂРѕС„РёР»СЊ" / "РіР»Р°РІРЅР°СЏ"
    / "РЅР°СѓТ›Р°СЃ РєР°СЂС‚Р°СЃС‹" / "РїР°С†РёРµРЅС‚ РєР°СЂС‚Р°СЃС‹"                                       в†’ patient_page
  "СЃРїРёСЃРѕРє РїР°С†РёРµРЅС‚РѕРІ" / "РїР°С†РёРµРЅС‚С‹"
    / "РЅР°СѓТ›Р°СЃС‚Р°СЂ С‚С–Р·С–РјС–" / "РЅР°СѓТ›Р°СЃС‚Р°СЂ"                                           в†’ patients_list

РџСЂРёРјРµСЂС‹:
  "Р·Р°РїРёС€Рё Р¶Р°Р»РѕР±С‹ РїР°С†РёРµРЅС‚Р°"              в†’ fill_primary_exam
  "РѕС‚РєСЂРѕР№ РјРµРґРёС†РёРЅСЃРєРёРµ Р·Р°РїРёСЃРё"           в†’ navigate, target=primary_exam
  "РѕС‚РєСЂРѕР№ РґРЅРµРІРЅРёРєРѕРІС‹Рµ Р·Р°РїРёСЃРё"           в†’ navigate, target=treatment_diary
  "РїРµСЂРµР№РґРё РІ СЂР°СЃРїРёСЃР°РЅРёРµ"                в†’ navigate, target=schedule_block
  "РѕС‚РєСЂРѕР№ РЅР°Р·РЅР°С‡РµРЅРёСЏ"                   в†’ navigate, target=procedures
  "Р·Р°РїРѕР»РЅРё РІС‹РїРёСЃРЅРѕР№ СЌРїРёРєСЂРёР·: ..."       в†’ fill_discharge_summary
  "Р·Р°РїРёС€Рё РІ РґРЅРµРІРЅРёРє С‚РµРјРїРµСЂР°С‚СѓСЂР° 36.8"   в†’ fill_diary
  "СЃС„РѕСЂРјРёСЂСѓР№ СЂР°СЃРїРёСЃР°РЅРёРµ"                в†’ generate_schedule
  "СЃС„РѕСЂРјРёСЂСѓР№ РґРѕРєСѓРјРµРЅС‚"                  в†’ generate_document
  "СЃРєР°С‡Р°Р№ РґРѕРєСѓРјРµРЅС‚"                     в†’ generate_document
  "СЃРіРµРЅРµСЂРёСЂСѓР№ РІС‹РїРёСЃРєСѓ"                  в†’ generate_document

РЇР·С‹Рє РєРѕРјР°РЅРґС‹: ${locale}

Р’РµСЂРЅРё JSON (Р±РµР· Р»РёС€РЅРёС… РїРѕР»РµР№):
{
  "intent": "fill_primary_exam",
  "confidence": 0.95,
  "normalizedText": "РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹Р№ С‚РµРєСЃС‚",
  "source": "provider"
}`,
      `РљРѕРјР°РЅРґР°: ${text}`,
    ) as Record<string, unknown>;

    // GPT sometimes returns target:"" for non-navigate intents вЂ” strip it
    if (!raw.target || raw.target === '') {
      delete raw.target;
    }

      const parsed = parsedIntentSchema.parse(raw);
      if (parsed.intent === 'unknown') {
        return localFallback ?? parsed;
      }

      return parsed;
    } catch (error) {
      if (localFallback) {
        return localFallback;
      }
      throw error;
    }
  },

  parseMedical: async (text: string, locale: AppLocale): Promise<MedicalParseResult> => {
    const lang = locale === 'kk' ? 'РєР°Р·Р°С…СЃРєРёР№' : locale === 'en' ? 'Р°РЅРіР»РёР№СЃРєРёР№' : 'СЂСѓСЃСЃРєРёР№';
    const data = await callGpt(
      `РўС‹ РјРµРґРёС†РёРЅСЃРєРёР№ СЃРµРєСЂРµС‚Р°СЂСЊ-СЂРµРґР°РєС‚РѕСЂ. РР· РґРёРєС‚РѕРІРєРё РІСЂР°С‡Р° РёР·РІР»РµРєРё РґР°РЅРЅС‹Рµ РџР•Р Р’РР§РќРћР“Рћ РћРЎРњРћРўР Рђ Рё РѕС„РѕСЂРјРё РёС… РІ РѕС„РёС†РёР°Р»СЊРЅРѕРј РјРµРґРёС†РёРЅСЃРєРѕРј СЃС‚РёР»Рµ РїРѕ СЃС‚Р°РЅРґР°СЂС‚Сѓ РјРµРґРёС†РёРЅСЃРєРѕР№ РґРѕРєСѓРјРµРЅС‚Р°С†РёРё Р РµСЃРїСѓР±Р»РёРєРё РљР°Р·Р°С…СЃС‚Р°РЅ.

РЇР·С‹Рє С‚РµРєСЃС‚Р°: ${lang}.

Р’РђР–РќРћ: С‚РµРєСЃС‚ РјРѕР¶РµС‚ СЃРѕРґРµСЂР¶Р°С‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ СЂР°Р·РґРµР»РѕРІ. РР·РІР»РµРєР°Р№ РўРћР›Р¬РљРћ РґР°РЅРЅС‹Рµ РїРµСЂРІРёС‡РЅРѕРіРѕ РѕСЃРјРѕС‚СЂР°/РјРµРґРёС†РёРЅСЃРєРѕР№ Р·Р°РїРёСЃРё.

РўР Р•Р‘РћР’РђРќРРЇ Рљ РћР¤РћР РњР›Р•РќРР®:
вЂ” РћС„РёС†РёР°Р»СЊРЅС‹Р№ РєР»РёРЅРёС‡РµСЃРєРёР№ СЏР·С‹Рє (Р»Р°С‚РёРЅСЃРєРёРµ С‚РµСЂРјРёРЅС‹ РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё)
вЂ” Р–Р°Р»РѕР±С‹: РїРµСЂРµС‡РёСЃР»РµРЅРёРµ РІ РјРµРґРёС†РёРЅСЃРєРѕР№ С„РѕСЂРјСѓР»РёСЂРѕРІРєРµ С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ
вЂ” РђРЅР°РјРЅРµР·: СЃРІСЏР·РЅС‹Р№ С‚РµРєСЃС‚ СЃ СѓРєР°Р·Р°РЅРёРµРј РЅР°С‡Р°Р»Р°, С‚РµС‡РµРЅРёСЏ, РѕР±СЃР»РµРґРѕРІР°РЅРёР№
вЂ” РћР±СЉРµРєС‚РёРІРЅС‹Р№ СЃС‚Р°С‚СѓСЃ: СЃРёСЃС‚РµРјРЅС‹Р№ РѕСЃРјРѕС‚СЂ, С‡РёСЃР»РѕРІС‹Рµ РїРѕРєР°Р·Р°С‚РµР»Рё Р±РµР· СЃРѕРєСЂР°С‰РµРЅРёР№
вЂ” Р РµРєРѕРјРµРЅРґР°С†РёРё: РЅСѓРјРµСЂРѕРІР°РЅРЅС‹Р№ СЃРїРёСЃРѕРє РЅР°Р·РЅР°С‡РµРЅРёР№ СЃ РґРѕР·РёСЂРѕРІРєР°РјРё
вЂ” РџСЂРёРјРµС‡Р°РЅРёСЏ: РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ РєР»РёРЅРёС‡РµСЃРєРёРµ СЃРІРµРґРµРЅРёСЏ

РџРѕР»СЏ:
вЂ” complaints: Р–Р°Р»РѕР±С‹ РїР°С†РёРµРЅС‚Р°
вЂ” anamnesis: РђРЅР°РјРЅРµР· Р·Р°Р±РѕР»РµРІР°РЅРёСЏ Рё Р¶РёР·РЅРё
вЂ” objectiveStatus: Р”Р°РЅРЅС‹Рµ РѕР±СЉРµРєС‚РёРІРЅРѕРіРѕ РѕСЃРјРѕС‚СЂР°
вЂ” recommendations: Р РµРєРѕРјРµРЅРґР°С†РёРё Рё РЅР°Р·РЅР°С‡РµРЅРёСЏ
вЂ” notes: Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ СЃРІРµРґРµРЅРёСЏ
вЂ” registrationDate: РґР°С‚Р° СЂРµРіРёСЃС‚СЂР°С†РёРё (С„РѕСЂРјР°С‚ YYYY-MM-DDTHH:MM, РµСЃР»Рё СѓРїРѕРјСЏРЅСѓС‚Р°)
вЂ” recordType: С‚РёРї Р·Р°РїРёСЃРё ("РџРµСЂРІРёС‡РЅС‹Р№ РѕСЃРјРѕС‚СЂ" | "РџР»Р°РЅРѕРІС‹Р№ РѕСЃРјРѕС‚СЂ" | "РћСЃРјРѕС‚СЂ РІСЂР°С‡Р° РїСЂРёС‘РјРЅРѕРіРѕ РїРѕРєРѕСЏ" | "РС‚РѕРіРѕРІР°СЏ Р·Р°РїРёСЃСЊ", РµСЃР»Рё СѓРїРѕРјСЏРЅСѓС‚)

Р•СЃР»Рё РїРѕР»Рµ РЅРµ СѓРїРѕРјСЏРЅСѓС‚Рѕ вЂ” РѕСЃС‚Р°РІСЊ РїСѓСЃС‚СѓСЋ СЃС‚СЂРѕРєСѓ "".

Р’РµСЂРЅРё JSON:
{
  "data": {
    "complaints": "РћС„РёС†РёР°Р»СЊРЅРѕ РѕС„РѕСЂРјР»РµРЅРЅС‹Рµ Р¶Р°Р»РѕР±С‹",
    "anamnesis": "РђРЅР°РјРЅРµР· РІ РєР»РёРЅРёС‡РµСЃРєРѕРј СЃС‚РёР»Рµ",
    "objectiveStatus": "РћР±СЉРµРєС‚РёРІРЅС‹Р№ СЃС‚Р°С‚СѓСЃ СЃ С‡РёСЃР»РѕРІС‹РјРё РґР°РЅРЅС‹РјРё",
    "recommendations": "1. РќР°Р·РЅР°С‡РµРЅРёРµ. 2. РќР°Р·РЅР°С‡РµРЅРёРµ.",
    "notes": "Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ СЃРІРµРґРµРЅРёСЏ",
    "registrationDate": "2026-04-17T15:07",
    "recordType": "РџРµСЂРІРёС‡РЅС‹Р№ РѕСЃРјРѕС‚СЂ"
  },
  "confidence": 0.95,
  "source": "provider"
}`,
      `Р”РёРєС‚РѕРІРєР° РІСЂР°С‡Р°: ${text}`,
    );
    return medicalParseResultSchema.parse(data);
  },

  generateSchedule: async (input: ScheduleGenerationInput, locale: AppLocale): Promise<ScheduleGenerationResult> => {
    const data = await callGpt(
      `РўС‹ РїР»Р°РЅРёСЂРѕРІС‰РёРє РјРµРґРёС†РёРЅСЃРєРёС… РїСЂРѕС†РµРґСѓСЂ СЂРµР°Р±РёР»РёС‚Р°С†РёРѕРЅРЅРѕРіРѕ С†РµРЅС‚СЂР°. РЎРѕСЃС‚Р°РІСЊ СЂР°СЃРїРёСЃР°РЅРёРµ РїРѕ РїСЂРµРґРѕСЃС‚Р°РІР»РµРЅРЅС‹Рј РґР°РЅРЅС‹Рј.

РћР‘РЇР—РђРўР•Р›Р¬РќР«Р• РџР РђР’РР›Рђ:
- Р Р°Р±РѕС‚Р°Р№ РўРћР›Р¬РљРћ СЃ РґР°С‚Р°РјРё РёР· workingDates[] вЂ” СЌС‚Рѕ СѓР¶Рµ РїСЂРѕРІРµСЂРµРЅРЅС‹Рµ СЂР°Р±РѕС‡РёРµ РґРЅРё (РџРЅ-РџС‚). РќРµ РёСЃРїРѕР»СЊР·СѓР№ РґСЂСѓРіРёРµ РґР°С‚С‹.
- РЎРµР°РЅСЃС‹ СЃС‚СЂРѕРіРѕ РІ СЂР°Р±РѕС‡РёРµ С‡Р°СЃС‹ СЃРїРµС†РёР°Р»РёСЃС‚Р° (workStartвЂ“workEnd)
- РќРµ РґРѕРїСѓСЃРєР°Р№ РїРµСЂРµСЃРµС‡РµРЅРёР№ СЃ busySlots Рё РјРµР¶РґСѓ СЃРµР°РЅСЃР°РјРё РѕРґРЅРѕРіРѕ СЃРїРµС†РёР°Р»РёСЃС‚Р°
- РњРђРљРЎРРњРЈРњ 2 СЃРµР°РЅСЃР° РІ РґРµРЅСЊ РЎРЈРњРњРђР РќРћ РїРѕ РІСЃРµРј СЃРїРµС†РёР°Р»РёСЃС‚Р°Рј РІРјРµСЃС‚Рµ (РЅРµ Сѓ РєР°Р¶РґРѕРіРѕ, Р° РІСЃРµ РІРјРµСЃС‚Рµ РЅРµ Р±РѕР»РµРµ 2 РІ РґРµРЅСЊ)
- РњРРќРРњРЈРњ 45 РјРёРЅСѓС‚ РјРµР¶РґСѓ Р›Р®Р‘Р«РњР РґРІСѓРјСЏ СЃРµР°РЅСЃР°РјРё РІ РѕРґРёРЅ РґРµРЅСЊ (РґР°Р¶Рµ Сѓ СЂР°Р·РЅС‹С… СЃРїРµС†РёР°Р»РёСЃС‚РѕРІ)
- Р Р°СЃРїСЂРµРґРµР»Рё СЃРµР°РЅСЃС‹ СЂР°РІРЅРѕРјРµСЂРЅРѕ РїРѕ СЂР°Р±РѕС‡РёРј РґРЅСЏРј
- Р”Р°С‚Р° РІ С„РѕСЂРјР°С‚Рµ YYYY-MM-DD, РІСЂРµРјСЏ HH:MM
- room: РЅР°Р·РЅР°С‡СЊ РєР°Р±РёРЅРµС‚ СЃРѕРіР»Р°СЃРЅРѕ С‚РёРїСѓ СЃРїРµС†РёР°Р»РёСЃС‚Р° (spec-lfk в†’ "РљР°Р±. 204", spec-massage в†’ "РљР°Р±. 108", spec-physio в†’ "РљР°Р±. 310", spec-psych в†’ "РљР°Р±. 215", РґСЂСѓРіРёРµ в†’ "РљР°Р±. 100")
- Р•СЃР»Рё Р·Р°РїР»Р°РЅРёСЂРѕРІР°С‚СЊ РЅРµРІРѕР·РјРѕР¶РЅРѕ вЂ” РґРѕР±Р°РІСЊ РІ unplaced СЃ РїСЂРёС‡РёРЅРѕР№ РЅР° СЂСѓСЃСЃРєРѕРј

РЇР·С‹Рє: ${locale}

Р’РµСЂРЅРё JSON:
{
  "items": [
    {"procedureId":"...","procedureTitle":"...","specialistId":"...","room":"РљР°Р±. 301","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM"}
  ],
  "unplaced": [{"procedureId":"...","reason":"..."}],
  "explanation": "РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ СЃРѕСЃС‚Р°РІР»РµРЅРЅРѕРіРѕ СЂР°СЃРїРёСЃР°РЅРёСЏ"
}`,
      JSON.stringify(input),
    );
    return scheduleGenerationResultSchema.parse(data);
  },

  parseDischargeText: async (
    text: string,
    locale: AppLocale,
    patientInfo: Record<string, string> = {},
  ): Promise<{ text: string; dischargeDate?: string; outcome?: string }> => {
    const lang = locale === 'kk' ? 'РєР°Р·Р°С…СЃРєРёР№' : locale === 'en' ? 'Р°РЅРіР»РёР№СЃРєРёР№' : 'СЂСѓСЃСЃРєРёР№';
    const p = patientInfo;
    const todayISO = new Date().toISOString().slice(0, 16);
    const todayRU = new Date().toLocaleDateString('ru-RU');

    const data = await callGpt(
      `РўС‹ РІСЂР°С‡-РєР»РёРЅРёС†РёСЃС‚. РќР°РїРёС€Рё РѕС„РёС†РёР°Р»СЊРЅС‹Р№ РІС‹РїРёСЃРЅРѕР№ СЌРїРёРєСЂРёР· РЅР° РѕСЃРЅРѕРІРµ РґРёРєС‚РѕРІРєРё Рё РґР°РЅРЅС‹С… РїР°С†РёРµРЅС‚Р°.

Р”РђРќРќР«Р• РџРђР¦РР•РќРўРђ (РёСЃРїРѕР»СЊР·СѓР№ РєР°Рє РµСЃС‚СЊ, РЅРµ РІС‹РґСѓРјС‹РІР°Р№):
вЂў Р¤РРћ: ${p.name || 'вЂ”'}
вЂў Р”Р°С‚Р° СЂРѕР¶РґРµРЅРёСЏ: ${p.dob || 'вЂ”'}${p.age ? ` (${p.age} Р»РµС‚)` : ''}
вЂў РРРќ: ${p.iin || 'вЂ”'}
вЂў Р”РёР°РіРЅРѕР·: ${p.diagnosis || 'вЂ”'}
вЂў Р”Р°С‚Р° РїРѕСЃС‚СѓРїР»РµРЅРёСЏ: ${p.admissionDate || 'вЂ”'}
вЂў Р”Р°С‚Р° РІС‹РїРёСЃРєРё: ${todayRU}
вЂў РџР°Р»Р°С‚Р°: ${p.ward ? 'в„–' + p.ward : 'вЂ”'}
вЂў Р›РµС‡Р°С‰РёР№ РІСЂР°С‡: ${p.doctor || 'вЂ”'}
вЂў РћС‚РґРµР»РµРЅРёРµ: ${p.department || 'вЂ”'}
вЂў РЈС‡СЂРµР¶РґРµРЅРёРµ: ${p.hospital || 'Р“РљР”Р‘'}

РўР Р•Р‘РћР’РђРќРРЇ Рљ РўР•РљРЎРўРЈ:
- РћС„РёС†РёР°Р»СЊРЅС‹Р№ РјРµРґРёС†РёРЅСЃРєРёР№ СЃС‚РёР»СЊ, РєР°Рє РІ СЂРµР°Р»СЊРЅС‹С… РІС‹РїРёСЃРєР°С…
- РЎС‚СЂСѓРєС‚СѓСЂР°: РїРѕСЃС‚СѓРїРёР»(Р°) в†’ Р¶Р°Р»РѕР±С‹ РїСЂРё РїРѕСЃС‚СѓРїР»РµРЅРёРё в†’ РїСЂРѕРІРµРґС‘РЅРЅРѕРµ Р»РµС‡РµРЅРёРµ в†’ РґРёРЅР°РјРёРєР° в†’ СЃРѕСЃС‚РѕСЏРЅРёРµ РїСЂРё РІС‹РїРёСЃРєРµ в†’ СЂРµРєРѕРјРµРЅРґР°С†РёРё
- РСЃРїРѕР»СЊР·СѓР№ СЂРµР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ РїР°С†РёРµРЅС‚Р° РІРµР·РґРµ РіРґРµ СѓРјРµСЃС‚РЅРѕ
- Р”РёР°РіРЅРѕР· СѓРєР°Р·С‹РІР°Р№ СЃ РєРѕРґРѕРј РњРљР‘ РµСЃР»Рё РѕРЅ РµСЃС‚СЊ
- РЇР·С‹Рє: ${lang}
- Р”Р»РёРЅР°: 150-300 СЃР»РѕРІ

РўРђРљР–Р• РёР·РІР»РµРєРё РёР· РґРёРєС‚РѕРІРєРё РµСЃР»Рё СѓРїРѕРјСЏРЅСѓС‚Рѕ:
- dischargeDate: РґР°С‚Р° РІС‹РїРёСЃРєРё РІ С„РѕСЂРјР°С‚Рµ YYYY-MM-DDTHH:MM (РµСЃР»Рё РЅРµ СѓРєР°Р·Р°РЅР° вЂ” РёСЃРїРѕР»СЊР·СѓР№ ${todayISO})
- outcome: РёСЃС…РѕРґ Р»РµС‡РµРЅРёСЏ вЂ” СЃС‚СЂРѕРіРѕ РѕРґРЅРѕ РёР·: "Р’С‹Р·РґРѕСЂРѕРІР»РµРЅРёРµ" | "РЈР»СѓС‡С€РµРЅРёРµ" | "Р‘РµР· РёР·РјРµРЅРµРЅРёР№" | "РЈС…СѓРґС€РµРЅРёРµ" | "Р›РµС‚Р°Р»СЊРЅС‹Р№ РёСЃС…РѕРґ"

Р’РµСЂРЅРё JSON:
{
  "text": "С‚РµРєСЃС‚ СЌРїРёРєСЂРёР·Р°",
  "dischargeDate": "${todayISO}",
  "outcome": "РЈР»СѓС‡С€РµРЅРёРµ"
}`,
      `Р”РёРєС‚РѕРІРєР° РІСЂР°С‡Р° (РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ РґРµС‚Р°Р»Рё РґР»СЏ СЌРїРёРєСЂРёР·Р°): ${text || 'СЃС‚Р°РЅРґР°СЂС‚РЅР°СЏ РІС‹РїРёСЃРєР°'}`,
    ) as { text?: string; dischargeDate?: string; outcome?: string };
    return {
      text: data.text?.trim() ?? text,
      dischargeDate: data.dischargeDate,
      outcome: data.outcome,
    };
  },

  parseDiaryEntry: async (
    text: string,
    locale: AppLocale,
  ): Promise<{ note: string; vitals: Record<string, string>; entryDate?: string }> => {
    const nowISO = new Date().toISOString().slice(0, 16);
    const data = await callGpt(
      `РўС‹ РїРѕРјРѕС‰РЅРёРє РІСЂР°С‡Р°. РР·РІР»РµРєРё РґР°РЅРЅС‹Рµ Р”РќР•Р’РќРРљРћР’РћР™ Р—РђРџРРЎР РёР· РґРёРєС‚РѕРІРєРё.
РЇР·С‹Рє: ${locale === 'kk' ? 'РєР°Р·Р°С…СЃРєРёР№' : locale === 'en' ? 'Р°РЅРіР»РёР№СЃРєРёР№' : 'СЂСѓСЃСЃРєРёР№'}

Р’РђР–РќРћ: С‚РµРєСЃС‚ РјРѕР¶РµС‚ СЃРѕРґРµСЂР¶Р°С‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ СЂР°Р·РґРµР»РѕРІ (РїРµСЂРІРёС‡РЅС‹Р№ РѕСЃРјРѕС‚СЂ, РІС‹РїРёСЃРЅРѕР№ СЌРїРёРєСЂРёР· Рё С‚.Рґ.).
РР·РІР»РµРєР°Р№ РўРћР›Р¬РљРћ РґР°РЅРЅС‹Рµ РёР· СЂР°Р·РґРµР»Р° РґРЅРµРІРЅРёРєРѕРІС‹С… Р·Р°РїРёСЃРµР№:
вЂ” note: С‚РµРєСЃС‚ РґРЅРµРІРЅРёРєРѕРІРѕР№ Р·Р°РїРёСЃРё (СЃРѕСЃС‚РѕСЏРЅРёРµ, РґРёРЅР°РјРёРєР°, РЅР°Р·РЅР°С‡РµРЅРёСЏ)
вЂ” vitals: РѕР±СЉРµРєС‚РёРІРЅС‹Рµ РїРѕРєР°Р·Р°С‚РµР»Рё РЅР° РјРѕРјРµРЅС‚ РѕСЃРјРѕС‚СЂР° (С‡РёСЃР»Р° РёР· СЂР°Р·РґРµР»Р° РґРЅРµРІРЅРёРєР°, РЅРµ РёР· Р¶Р°Р»РѕР±)
вЂ” entryDate: РґР°С‚Р° Рё РІСЂРµРјСЏ Р·Р°РїРёСЃРё РІ С„РѕСЂРјР°С‚Рµ YYYY-MM-DDTHH:MM (РµСЃР»Рё РЅРµ СѓРєР°Р·Р°РЅР° вЂ” РёСЃРїРѕР»СЊР·СѓР№ ${nowISO})

Р§РёСЃР»Р° РІ Р¶Р°Р»РѕР±Р°С… ("С‚РµРјРїРµСЂР°С‚СѓСЂР° РґРѕ 38.2" вЂ” Р¶Р°Р»РѕР±Р° РїР°С†РёРµРЅС‚Р°) РќР• СЏРІР»СЏСЋС‚СЃСЏ vitals.
Vitals вЂ” СЌС‚Рѕ РёР·РјРµСЂРµРЅРЅС‹Рµ Р·РЅР°С‡РµРЅРёСЏ, РѕР±С‹С‡РЅРѕ РІ СЂР°Р·РґРµР»Рµ РґРЅРµРІРЅРёРєРѕРІРѕР№ Р·Р°РїРёСЃРё.

Р’РµСЂРЅРё JSON:
{
  "note": "С‚РµРєСЃС‚ РґРЅРµРІРЅРёРєРѕРІРѕР№ Р·Р°РїРёСЃРё",
  "entryDate": "${nowISO}",
  "vitals": {
    "temperature": "36.6",
    "pulse": "77",
    "systolic": "125",
    "diastolic": "89",
    "breath": "15",
    "saturation": "98",
    "weight": "54"
  }
}
Р’РєР»СЋС‡Р°Р№ РІ vitals С‚РѕР»СЊРєРѕ С‚Рµ РїРѕРєР°Р·Р°С‚РµР»Рё, РєРѕС‚РѕСЂС‹Рµ СЏРІРЅРѕ СѓРєР°Р·Р°РЅС‹ РІ РґРЅРµРІРЅРёРєРѕРІРѕР№ С‡Р°СЃС‚Рё. РћСЃС‚Р°Р»СЊРЅС‹Рµ РЅРµ РІРєР»СЋС‡Р°Р№.`,
      `Р”РёРєС‚РѕРІРєР°: ${text}`,
    ) as { note?: string; vitals?: Record<string, string>; entryDate?: string };
    return { note: data.note?.trim() ?? text, vitals: data.vitals ?? {}, entryDate: data.entryDate };
  },

  nextWorkflowStep: async (
    state: WorkflowState,
    locale: AppLocale,
    event?: WorkflowEvent,
  ): Promise<{ state: WorkflowState; next: WorkflowNextStep }> => {
    const nextState = (event && EVENT_TO_STATE[event]) ?? state;
    const transition = WORKFLOW_TRANSITIONS[nextState] ?? WORKFLOW_TRANSITIONS.idle;
    const next = workflowNextStepSchema.parse({
      nextRecommendedAction: transition.nextRecommendedAction,
      message: translateByLocale(locale, transition.messageKey),
    });
    return { state: nextState, next };
  },

  parseMultiIntent: async (text: string, locale: AppLocale, patientMemoryContext?: string): Promise<ParsedIntent[]> => {
    const localFallback = localFallbackParseIntent(text);

    const VALID_INTENTS = ['navigate', 'fill_primary_exam', 'fill_discharge_summary', 'fill_diary', 'generate_schedule', 'complete_service', 'open_diary', 'generate_document', 'unknown'] as const;
    const VALID_TARGETS = ['patients_list', 'patient_page', 'primary_exam', 'discharge_summary', 'treatment_diary', 'procedures', 'schedule_block'];

    const normalizeOne = (raw: Record<string, unknown>): ParsedIntent | null => {
      const intent = VALID_INTENTS.includes(raw.intent as (typeof VALID_INTENTS)[number])
        ? (raw.intent as ParsedIntent['intent'])
        : 'unknown';

      // target is only valid for navigate; strip it otherwise
      const rawTarget = String(raw.target ?? '');
      const target =
        intent === 'navigate' && VALID_TARGETS.includes(rawTarget)
          ? (rawTarget as ParsedIntent['target'])
          : undefined;

      let confidence = Number(raw.confidence ?? 0.9);
      if (confidence > 1) confidence /= 100;
      if (isNaN(confidence) || confidence < 0 || confidence > 1) confidence = 0.9;

      const normalizedText = String(raw.normalizedText ?? raw.text ?? text).trim();
      const source: ParsedIntent['source'] = ['keyword', 'provider', 'fallback'].includes(String(raw.source))
        ? (raw.source as ParsedIntent['source'])
        : 'provider';

      try {
        return parsedIntentSchema.parse({ intent, target, confidence, normalizedText, source });
      } catch {
        return null;
      }
    };

    try {
      const raw = await callGpt(
      `РўС‹ РїР°СЂСЃРµСЂ РєРѕРјР°РЅРґ РјРµРґРёС†РёРЅСЃРєРѕР№ РёРЅС„РѕСЂРјР°С†РёРѕРЅРЅРѕР№ СЃРёСЃС‚РµРјС‹ (СЃС‚Р°С†РёРѕРЅР°СЂ).
Р Р°Р·РґРµР»Рё Р·Р°РїСЂРѕСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅР° РћРўР”Р•Р›Р¬РќР«Р• РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅС‹Рµ РєРѕРјР°РЅРґС‹.

РљРћР“Р”Рђ Р”Р•Р›РРўР¬ РќРђ РќР•РЎРљРћР›Р¬РљРћ РљРћРњРђРќР”:
вЂ” СЃРѕСЋР·С‹: "Р·Р°С‚РµРј", "РїРѕС‚РѕРј", "РїРѕСЃР»Рµ СЌС‚РѕРіРѕ", "Рё РїРѕС‚РѕРј", "РїРѕСЃР»Рµ С‡РµРіРѕ", "Р° С‚Р°РєР¶Рµ"
вЂ” Р·Р°РїСЏС‚С‹Рµ РјРµР¶РґСѓ Р РђР—РќР«РњР РґРµР№СЃС‚РІРёСЏРјРё (РѕС‚РєСЂС‹С‚СЊ + Р·Р°РїРѕР»РЅРёС‚СЊ = 2 РєРѕРјР°РЅРґС‹)
вЂ” РїРµСЂРµС…РѕРґ Рє РґСЂСѓРіРѕРјСѓ СЂР°Р·РґРµР»Сѓ + РґРµР№СЃС‚РІРёРµ РІ РЅС‘Рј = РјРёРЅРёРјСѓРј 2 РєРѕРјР°РЅРґС‹

Р—РђРњР•РќРђ РњР•РЎРўРћРРњР•РќРР™: "РµРіРѕ", "РµС‘", "С‚Р°Рј", "РІ РЅС‘Рј" в†’ Р·Р°РјРµРЅСЏР№ РєРѕРЅРєСЂРµС‚РЅС‹Рј РѕР±СЉРµРєС‚РѕРј РёР· РїСЂРµРґС‹РґСѓС‰РµР№ РєРѕРјР°РЅРґС‹.
Р’РљР›Р®Р§РђР™ Р’Р•РЎР¬ РњР•Р”РР¦РРќРЎРљРР™ РўР•РљРЎРў РІ normalizedText СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰РµР№ РєРѕРјР°РЅРґС‹ fill_*.

INTENT вЂ” СЃС‚СЂРѕРіРѕ РѕРґРЅРѕ РёР· Р·РЅР°С‡РµРЅРёР№:
"navigate" | "fill_primary_exam" | "fill_discharge_summary" | "fill_diary" | "generate_schedule" | "complete_service" | "open_diary" | "generate_document" | "unknown"

TARGET вЂ” С‚РѕР»СЊРєРѕ РґР»СЏ intent="navigate", СЃС‚СЂРѕРіРѕ РѕРґРЅРѕ РёР· (Р’РЎР•Р“Р”Рђ РІРѕР·РІСЂР°С‰Р°Р№ Р°РЅРіР»РёР№СЃРєРѕРµ Р·РЅР°С‡РµРЅРёРµ):
"primary_exam" | "discharge_summary" | "treatment_diary" | "schedule_block" | "patient_page" | "patients_list" | "procedures"

РўРђР‘Р›РР¦Рђ РЎРћРћРўР’Р•РўРЎРўР’РРЇ РґР»СЏ target (СЂСѓСЃСЃРєРёР№ / РєР°Р·Р°С…СЃРєРёР№ в†’ Р°РЅРіР»РёР№СЃРєРѕРµ Р·РЅР°С‡РµРЅРёРµ):
  РјРµРґРёС†РёРЅСЃРєРёРµ Р·Р°РїРёСЃРё / РјРµРґ Р·Р°РїРёСЃРё / РїРµСЂРІРёС‡РЅС‹Р№ РѕСЃРјРѕС‚СЂ / РїРµСЂРІРёС‡РЅС‹Р№ РїСЂРёС‘Рј
    / РїР»Р°РЅРѕРІС‹Р№ РѕСЃРјРѕС‚СЂ / РѕСЃРјРѕС‚СЂ РїСЂРёС‘РјРЅРѕРіРѕ РїРѕРєРѕСЏ / РёС‚РѕРіРѕРІР°СЏ Р·Р°РїРёСЃСЊ
    / РјРµРґРёС†РёРЅР°Р»С‹Т› Р¶Р°Р·Р±Р°Р»Р°СЂ / Р°Р»Т“Р°С€Т›С‹ С‚РµРєСЃРµСЂСѓ / Р°Р»Т“Р°С€Т›С‹ Т›Р°Р±С‹Р»РґР°Сѓ         в†’ "primary_exam"
  РІС‹РїРёСЃРЅРѕР№ СЌРїРёРєСЂРёР· / СЌРїРёРєСЂРёР· / РІС‹РїРёСЃРєР°
    / С€С‹Т“Р°СЂСѓ СЌРїРёРєСЂРёР·С– / С€С‹Т“Р°СЂСѓ Т›РѕСЂС‹С‚С‹РЅРґС‹СЃС‹                               в†’ "discharge_summary"
  РґРЅРµРІРЅРёРєРѕРІС‹Рµ Р·Р°РїРёСЃРё / РґРЅРµРІРЅРёРє / РґРЅРµРІРЅРёРє Р»РµС‡РµРЅРёСЏ
    / РєТЇРЅРґРµР»С–РєС‚С– Р¶Р°Р·Р±Р°Р»Р°СЂ / РєТЇРЅРґРµР»С–Рє / РµРјРґРµСѓ РєТЇРЅРґРµР»С–РіС–                  в†’ "treatment_diary"
  РЅР°Р·РЅР°С‡РµРЅРёСЏ / РїСЂРѕС†РµРґСѓСЂС‹ / СѓСЃР»СѓРіРё
    / С‚Р°Т“Р°Р№С‹РЅРґР°СѓР»Р°СЂ / РїСЂРѕС†РµРґСѓСЂР°Р»Р°СЂ / Т›С‹Р·РјРµС‚С‚РµСЂ                           в†’ "procedures"
  СЂР°СЃРїРёСЃР°РЅРёРµ / СЂР°СЃРїРёСЃР°РЅРёРµ РїСЂРѕС†РµРґСѓСЂ / РіСЂР°С„РёРє
    / РєРµСЃС‚Рµ / РїСЂРѕС†РµРґСѓСЂР° РєРµСЃС‚РµСЃС– / Р¶Т±РјС‹СЃ РєРµСЃС‚РµСЃС–                         в†’ "schedule_block"
  РєР°СЂС‚РѕС‡РєР° РїР°С†РёРµРЅС‚Р° / РїСЂРѕС„РёР»СЊ / РіР»Р°РІРЅР°СЏ
    / РЅР°СѓТ›Р°СЃ РєР°СЂС‚Р°СЃС‹ / РїР°С†РёРµРЅС‚ РєР°СЂС‚Р°СЃС‹ / Р±Р°СЃС‚С‹                           в†’ "patient_page"
  СЃРїРёСЃРѕРє РїР°С†РёРµРЅС‚РѕРІ / РїР°С†РёРµРЅС‚С‹
    / РЅР°СѓТ›Р°СЃС‚Р°СЂ С‚С–Р·С–РјС– / РЅР°СѓТ›Р°СЃС‚Р°СЂ                                        в†’ "patients_list"

РЇР·С‹Рє Р·Р°РїСЂРѕСЃР°: ${locale}

РџСЂРёРјРµСЂ РІС…РѕРґР°: "РѕС‚РєСЂРѕР№ РІС‹РїРёСЃРЅРѕР№ СЌРїРёРєСЂРёР·, Р·Р°РїРѕР»РЅРё РµРіРѕ: РґРёР°РіРЅРѕР· Р°РїРїРµРЅРґРёС†РёС‚, Р·Р°С‚РµРј РїРµСЂРµР№РґРё РІ РґРЅРµРІРЅРёРє Рё РґРѕР±Р°РІСЊ Р·Р°РїРёСЃСЊ С‚РµРјРїРµСЂР°С‚СѓСЂР° 36.6 РїСѓР»СЊСЃ 76"
Р’РµСЂРЅРё JSON (РїСЂРёРјРµСЂ):
{
  "commands": [
    {"intent": "navigate", "target": "discharge_summary", "normalizedText": "РѕС‚РєСЂРѕР№ РІС‹РїРёСЃРЅРѕР№ СЌРїРёРєСЂРёР·", "confidence": 0.97, "source": "provider"},
    {"intent": "fill_discharge_summary", "normalizedText": "Р·Р°РїРѕР»РЅРё РІС‹РїРёСЃРЅРѕР№ СЌРїРёРєСЂРёР·: РґРёР°РіРЅРѕР· Р°РїРїРµРЅРґРёС†РёС‚", "confidence": 0.97, "source": "provider"},
    {"intent": "navigate", "target": "treatment_diary", "normalizedText": "РїРµСЂРµР№РґРё РІ РґРЅРµРІРЅРёРє Р»РµС‡РµРЅРёСЏ", "confidence": 0.97, "source": "provider"},
    {"intent": "fill_diary", "normalizedText": "РґРѕР±Р°РІСЊ РґРЅРµРІРЅРёРєРѕРІСѓСЋ Р·Р°РїРёСЃСЊ: С‚РµРјРїРµСЂР°С‚СѓСЂР° 36.6, РїСѓР»СЊСЃ 76", "confidence": 0.97, "source": "provider"}
  ]
}`,
      `Запрос пользователя: ${text}${patientMemoryContext ? `\n\nИСТОРИЯ ВЗАИМОДЕЙСТВИЙ С ЭТИМ ПАЦИЕНТОМ (учитывай при интерпретации команды):\n${patientMemoryContext}` : ''}`,
    ) as { commands?: unknown[] };

      const list = Array.isArray(raw?.commands) ? raw.commands : [];
      if (!list.length) {
        return localFallback ? [localFallback] : [await apiClient.parseIntent(text, locale)];
      }

      const results: ParsedIntent[] = [];
      for (const item of list) {
        const parsed = normalizeOne(item as Record<string, unknown>);
        if (parsed) results.push(parsed);
      }

      const knownOnly = results.filter((intent) => intent.intent !== 'unknown');
      if (knownOnly.length > 0) {
        return knownOnly;
      }

      return localFallback ? [localFallback] : [await apiClient.parseIntent(text, locale)];
    } catch {
      if (localFallback) {
        return [localFallback];
      }
      return [await apiClient.parseIntent(text, locale)];
    }
  },

  health: async (): Promise<{ status: string }> => ({ status: 'ok' }),

  smartExecute: async (command: string, snapshot: PageSnapshot): Promise<DomAction[]> => {
    const snapshotStr = JSON.stringify(snapshot, null, 0);
    const data = await callGpt(
      `РўС‹ РР-Р°РіРµРЅС‚ РјРµРґРёС†РёРЅСЃРєРѕР№ РёРЅС„РѕСЂРјР°С†РёРѕРЅРЅРѕР№ СЃРёСЃС‚РµРјС‹. РђРЅР°Р»РёР·РёСЂСѓР№ DOM-СЃРЅР°РїС€РѕС‚ СЃС‚СЂР°РЅРёС†С‹ Рё РєРѕРјР°РЅРґСѓ РІСЂР°С‡Р°, Р·Р°С‚РµРј РІРµСЂРЅРё С‚РѕС‡РЅС‹Р№ СЃРїРёСЃРѕРє РґРµР№СЃС‚РІРёР№ РґР»СЏ РІС‹РїРѕР»РЅРµРЅРёСЏ.

РўР•РљРЈР©РђРЇ РЎРўР РђРќРР¦Рђ (DOM-СЃРЅР°РїС€РѕС‚):
${snapshotStr}

РџР РђР’РР›Рђ:
- action "fill": Р·Р°РїРѕР»РЅРёС‚СЊ РїРѕР»Рµ вЂ” С‚РѕР»СЊРєРѕ textarea/input. value вЂ” РѕС„РёС†РёР°Р»СЊРЅС‹Р№ РјРµРґРёС†РёРЅСЃРєРёР№ С‚РµРєСЃС‚ РЅР° СЂСѓСЃСЃРєРѕРј.
- action "click": РЅР°Р¶Р°С‚СЊ РєРЅРѕРїРєСѓ РёР»Рё РІРєР»Р°РґРєСѓ. Р”Р»СЏ РЅР°РІРёРіР°С†РёРё РёСЃРїРѕР»СЊР·СѓР№ sel РёР· tabs[].
- action "select": РІС‹Р±СЂР°С‚СЊ РѕРїС†РёСЋ select. value РґРѕР»Р¶РЅРѕ СЃРѕРІРїР°РґР°С‚СЊ СЃ РѕРґРЅРѕР№ РёР· opts[].
- РСЃРїРѕР»СЊР·СѓР№ РўРћР›Р¬РљРћ sel РёР· СЃРЅР°РїС€РѕС‚Р° вЂ” РЅРµ РїСЂРёРґСѓРјС‹РІР°Р№ РЅРѕРІС‹Рµ.
- Р”Р»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ РјРµРґРёС†РёРЅСЃРєРёС… Р·Р°РїРёСЃРµР№: РІСЃРµ РїРѕР»СЏ (complaints, anamnesis, objectiveStatus, recommendations, notes) Р·Р°РїРѕР»РЅРё РІ РѕС„РёС†РёР°Р»СЊРЅРѕРј РєР»РёРЅРёС‡РµСЃРєРѕРј СЃС‚РёР»Рµ Р Рљ.
- Р•СЃР»Рё РЅСѓР¶РЅР° РЅР°РІРёРіР°С†РёСЏ Р Р·Р°РїРѕР»РЅРµРЅРёРµ вЂ” РІРєР»СЋС‡Рё click РЅР° РІРєР»Р°РґРєСѓ РїРµСЂРІС‹Рј РґРµР№СЃС‚РІРёРµРј.
- РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРё С‚РёРї Р·Р°РїРёСЃРё (select), РїРѕС‚РѕРј Р·Р°РїРѕР»РЅСЏР№ РїРѕР»СЏ.
- РќРµ РІРєР»СЋС‡Р°Р№ РїСѓСЃС‚С‹Рµ value РґР»СЏ fill.

Р’РµСЂРЅРё JSON СЃС‚СЂРѕРіРѕ:
{"actions": [{"sel": "#complaints", "action": "fill", "value": "..."}]}`,
      `РљРѕРјР°РЅРґР° РІСЂР°С‡Р°: ${command}`,
    ) as { actions?: unknown[] };

    if (!Array.isArray(data?.actions)) return [];
    return data.actions.filter(
      (a): a is DomAction =>
        typeof a === 'object' && a !== null &&
        typeof (a as DomAction).sel === 'string' &&
        ['fill', 'click', 'select'].includes((a as DomAction).action),
    );
  },

  suggestPreset: async (
    diagnosis: string,
    patientInfo: Record<string, string>,
    locale: AppLocale,
  ): Promise<Partial<import('@hackathon/shared').MedicalData>> => {
    const lang = locale === 'kk' ? 'РєР°Р·Р°С…СЃРєРёР№' : locale === 'en' ? 'Р°РЅРіР»РёР№СЃРєРёР№' : 'СЂСѓСЃСЃРєРёР№';
    const data = await callGpt(
      `РўС‹ РѕРїС‹С‚РЅС‹Р№ РїРµРґРёР°С‚СЂ-СЂРµР°Р±РёР»РёС‚РѕР»РѕРі. РЎРѕСЃС‚Р°РІСЊ С‚РёРїРѕРІРѕР№ С€Р°Р±Р»РѕРЅ РїРµСЂРІРёС‡РЅРѕРіРѕ РѕСЃРјРѕС‚СЂР° РґР»СЏ СЂРµР±С‘РЅРєР° РІ СЂРµР°Р±РёР»РёС‚Р°С†РёРѕРЅРЅРѕРј С†РµРЅС‚СЂРµ. РСЃРїРѕР»СЊР·СѓР№ РѕС„РёС†РёР°Р»СЊРЅС‹Р№ РјРµРґРёС†РёРЅСЃРєРёР№ СЃС‚РёР»СЊ Р Рљ. РЇР·С‹Рє: ${lang}.

Р—Р°РїРѕР»РЅРё РїРѕР»СЏ РґР»СЏ РґР°РЅРЅРѕРіРѕ РґРёР°РіРЅРѕР·Р°. Р­С‚Рѕ С€Р°Р±Р»РѕРЅ вЂ” РІСЂР°С‡ РґРѕРїРѕР»РЅРёС‚ РµРіРѕ РєРѕРЅРєСЂРµС‚РЅС‹РјРё РґР°РЅРЅС‹РјРё.

Р’РµСЂРЅРё JSON:
{
  "complaints": "РўРёРїРёС‡РЅС‹Рµ Р¶Р°Р»РѕР±С‹ РїСЂРё РґР°РЅРЅРѕРј РґРёР°РіРЅРѕР·Рµ РІ РѕС„РёС†РёР°Р»СЊРЅРѕР№ РјРµРґРёС†РёРЅСЃРєРѕР№ С„РѕСЂРјСѓР»РёСЂРѕРІРєРµ",
  "anamnesis": "РўРёРїРёС‡РЅС‹Р№ Р°РЅР°РјРЅРµР· Р·Р°Р±РѕР»РµРІР°РЅРёСЏ",
  "objectiveStatus": "РўРёРїРёС‡РЅС‹Р№ РѕР±СЉРµРєС‚РёРІРЅС‹Р№ СЃС‚Р°С‚СѓСЃ (РѕР±С‰РёР№ РІРёРґ, РЅРµРІСЂРѕР»РѕРіРёС‡РµСЃРєРёР№ СЃС‚Р°С‚СѓСЃ)",
  "recommendations": "1. РўРёРїРёС‡РЅС‹Рµ СЂРµРєРѕРјРµРЅРґР°С†РёРё РїРѕ СЂРµР°Р±РёР»РёС‚Р°С†РёРё\n2. ...",
  "notes": ""
}`,
      `Р”РёР°РіРЅРѕР·: ${diagnosis}. РџР°С†РёРµРЅС‚: ${patientInfo.name || 'вЂ”'}, РІРѕР·СЂР°СЃС‚: ${patientInfo.age || 'вЂ”'} Р»РµС‚.`,
    ) as Partial<import('@hackathon/shared').MedicalData>;
    return data;
  },

  generateAssignment: async (
    context: {
      patientInfo: Record<string, string>;
      primaryExam: MedicalData | null;
      dischargeSummary?: string;
      command?: string;
    },
    locale: AppLocale,
  ): Promise<{ recommendations: string; notes?: string }> => {
    const lang = locale === 'kk' ? 'Kazakh' : locale === 'en' ? 'English' : 'Russian';
    const contextText = JSON.stringify(context).toLowerCase();
    const hasNeurologicOrSpeechContext = /невр|neurolog|реч|speech|афаз|дизарт|парез|паралич|цнс|инсульт|seizure|эпилеп|чмт/u.test(contextText);
    const noNeuroRehabTerms = /(логопед|speech therapist|лфк|lfk|реабилит|мышечн(?:ого)?\s+тонус|коррекц(?:ия|ии)\s+речи)/iu;

    const buildPrompt = (strictNoNeuroRehab: boolean): string => `You are a senior clinical assistant. Build treatment assignments for a hospital patient medical record.
Output language must be ${lang}.
Use ONLY provided clinical context (diagnosis, discharge summary snippet, exam notes, complaints). Do not invent facts.

Return strict JSON:
{
  "recommendations": "Numbered list of concrete assignments: meds/procedures/monitoring/consults with dosage-frequency-duration when possible.",
  "notes": "Optional short safety caveats and follow-up instructions."
}

Rules:
- recommendations is required and non-empty.
- keep clinical tone and concise formatting for medical records.
- assignments must match the symptom profile and diagnosis from context.
- do not add unrelated specialist consults or rehab-only procedures without explicit indication in context.
${strictNoNeuroRehab ? '- STRICT: do NOT mention speech therapist, LFK, muscle tone monitoring, neuro-rehab, or speech correction, because neurologic/speech deficits are not confirmed in this case.' : ''}
- if data is limited, provide safe, neutral assignments and explicitly state that final confirmation by doctor is required.`;

    const firstPass = await callGpt(
      buildPrompt(false),
      JSON.stringify(context),
    ) as { recommendations?: string; notes?: string };

    let recommendations = firstPass.recommendations?.trim() || '';
    let notes = firstPass.notes?.trim() || undefined;

    // Guardrail: if model drifts into neuro-rehab without neurologic context, regenerate with strict constraints.
    if (!hasNeurologicOrSpeechContext && noNeuroRehabTerms.test(`${recommendations}\n${notes ?? ''}`)) {
      const secondPass = await callGpt(
        buildPrompt(true),
        JSON.stringify({ context, previousDraft: { recommendations, notes } }),
      ) as { recommendations?: string; notes?: string };

      recommendations = secondPass.recommendations?.trim() || recommendations;
      notes = secondPass.notes?.trim() || notes;
    }

    return {
      recommendations: recommendations || '1. Назначения требуют уточнения у лечащего врача на основе полного эпикриза и текущих симптомов.',
      ...(notes ? { notes } : {}),
    };
  },

  analyzeMedicalDocument: async (rawText: string, locale: AppLocale): Promise<MedicalDocumentAnalysis> => {
    const lang = locale === 'kk' ? 'Kazakh' : locale === 'en' ? 'English' : 'Russian';
    const sourceText = rawText.replace(/\s+/g, ' ').trim();
    const textForModel = sourceText.slice(0, 12_000);
    const looksLikeScan = textForModel.length < 120;

    const modelData = await callGpt(
      `You are a clinical document extraction assistant.
Extract only factual medical information from the provided text.
Response language for generated summary: ${lang}.

Return strict JSON with this shape:
{
  "diagnoses": ["..."],
  "complaints": ["..."],
  "anamnesis": "...",
  "labFindings": ["..."],
  "physicianConclusions": ["..."],
  "assignments": ["..."],
  "hospitalizationDate": "YYYY-MM-DD or original if unclear",
  "dischargeDate": "YYYY-MM-DD or original if unclear",
  "summary": "short clinical summary"
}

Rules:
- Use only facts from source text.
- Do not invent values.
- Keep arrays concise and clinically relevant.
- If field is missing: use empty array or empty string.`,
      `Clinical document text:\n${textForModel}`,
    ) as Record<string, unknown>;

    const extractedBase = {
      diagnoses: normalizeList(modelData.diagnoses),
      complaints: normalizeList(modelData.complaints),
      anamnesis: normalizeTextField(modelData.anamnesis),
      labFindings: normalizeList(modelData.labFindings),
      physicianConclusions: normalizeList(modelData.physicianConclusions),
      assignments: normalizeList(modelData.assignments),
      hospitalizationDate: normalizeDateField(modelData.hospitalizationDate),
      dischargeDate: normalizeDateField(modelData.dischargeDate),
    };

    const summaryFromModel = normalizeTextField(modelData.summary);
    const summary = summaryFromModel || buildDocumentSummary(extractedBase);
    const warnings: string[] = [];

    if (looksLikeScan) {
      warnings.push('Похоже на скан/фото PDF: проверьте текст, возможны ошибки OCR.');
    }
    if (
      !extractedBase.diagnoses.length &&
      !extractedBase.labFindings.length &&
      !extractedBase.physicianConclusions.length &&
      !extractedBase.assignments.length
    ) {
      warnings.push('Структурированные медицинские поля извлечены с низкой полнотой.');
    }

    const extracted: MedicalDocumentExtractedData = {
      ...extractedBase,
      summary,
      warnings,
    };

    return {
      extracted,
      contextForPrompt: buildDocumentPromptContext(extracted),
    };
  },

  analyzeFileContent: async (rawText: string, locale: AppLocale): Promise<string> => {
    const analysis = await apiClient.analyzeMedicalDocument(rawText, locale);
    return analysis.extracted.summary;
  },

  describePatient: async (
    context: {
      patientInfo?: Record<string, string>;
      pageType?: string;
      fields?: Array<{ label: string; value: string }>;
      command?: string;
    },
    locale: AppLocale,
  ): Promise<{ summary: string }> => {
    const lang = locale === 'kk' ? 'Kazakh' : locale === 'en' ? 'English' : 'Russian';
    const data = await callGpt(
      `You are a clinical assistant for inpatient workflow.
Create a short, clear spoken summary of the current patient from available card/form data.
Response language: ${lang}.

Rules:
- Use only provided data. Do not invent diagnoses, test results, medications, or outcomes.
- Mention: who the patient is, key diagnosis/problem, current status/findings, and current plan/recommendations (if present).
- If command asks to analyze a document and includes "Контекст из документа", treat this block as verified source data and prioritize it.
- Explicitly list important diseases/diagnoses first (including comorbidities, if present).
- Include key complaints, critical labs, physician conclusions, assignments, and hospitalization/discharge dates if available.
- Highlight potentially risky findings (e.g., high fever, severe pain, abnormal labs) only if they are explicitly present in source data.
- If some sections are missing, say that data is not available.
- Keep it concise and practical for a doctor handoff.
- Use plain text only, but you may structure with short numbered points (1., 2., 3.) for readability.

Return strict JSON:
{
  "summary": "..."
}`,
      JSON.stringify(context),
    ) as { summary?: string };

    const summary = data.summary?.trim();
    if (!summary) {
      throw new Error('Patient summary is empty');
    }
    return { summary };
  },
};
