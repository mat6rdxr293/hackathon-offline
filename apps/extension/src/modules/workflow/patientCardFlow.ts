import type { AppLocale } from '@hackathon/shared';

export type PatientCardFlowStepId =
  | 'registrationDate'
  | 'complaints'
  | 'anamnesis'
  | 'objectiveStatus'
  | 'recommendations'
  | 'notes'
  | 'diaryNote';

export type PatientCardFlowAnswers = Partial<Record<PatientCardFlowStepId, string>>;

export const PATIENT_CARD_FLOW_STEPS: PatientCardFlowStepId[] = [
  'registrationDate',
  'complaints',
  'anamnesis',
  'objectiveStatus',
  'recommendations',
  'notes',
  'diaryNote',
];

const EXPLICIT_START_PATTERNS = [
  'заполнить карточку пациента',
  'заполни карточку пациента',
  'заполнить карту пациента',
  'заполни карту пациента',
  'давай заполним карточку пациента',
  'нужно заполнить карточку пациента',
  'надо заполнить карточку пациента',
  'пациент карточкасын толтыр',
  'науқас картасын толтыр',
  'fill patient card',
  'fill patient chart',
];

const ACTION_MARKERS = [
  'заполн',
  'давай заполним',
  'нужно заполнить',
  'надо заполнить',
  'оформи',
  'оформить',
  'внеси данные',
  'внести данные',
  'толтыр',
  'толтырай',
  'fill',
  'complete',
];

const PATIENT_MARKERS = ['пациент', 'науқас', 'patient'];
const CARD_MARKERS = ['карточк', 'карта', 'карт', 'card', 'chart'];

const containsAny = (text: string, patterns: string[]): boolean =>
  patterns.some((pattern) => text.includes(pattern));

const STEP_PROMPTS: Record<AppLocale, Record<PatientCardFlowStepId, string>> = {
  ru: {
    registrationDate: 'Перехожу на медицинские записи. Дата регистрации?',
    complaints: 'Жалобы пациента?',
    anamnesis: 'Анамнез заболевания?',
    objectiveStatus: 'Объективный статус?',
    recommendations: 'Рекомендации и назначения?',
    notes: 'Дополнительные заметки?',
    diaryNote: 'Перехожу в дневниковые записи. Короткая запись в дневник?',
  },
  kk: {
    registrationDate: 'Медициналық жазбаларға өттім. Тіркеу күні қандай?',
    complaints: 'Науқастың шағымдары?',
    anamnesis: 'Ауру анамнезі?',
    objectiveStatus: 'Объективті статус?',
    recommendations: 'Ұсыныстар мен тағайындаулар?',
    notes: 'Қосымша ескертпелер?',
    diaryNote: 'Күнделікке өтемін. Қысқа күнделік жазбасы?',
  },
  en: {
    registrationDate: 'Moving to medical records. Registration date?',
    complaints: 'Patient complaints?',
    anamnesis: 'Anamnesis?',
    objectiveStatus: 'Objective status?',
    recommendations: 'Recommendations and prescriptions?',
    notes: 'Additional notes?',
    diaryNote: 'Moving to diary entries. Short diary note?',
  },
};

const NEXT_PROMPT: Record<AppLocale, string> = {
  ru: 'Переходим к следующему пункту.',
  kk: 'Келесі тармаққа өтеміз.',
  en: 'Moving to the next item.',
};

const COMPLETION_PROMPT: Record<AppLocale, string> = {
  ru: 'Карточка пациента заполнена. Первичный прием и дневниковая запись обновлены.',
  kk: 'Науқас картасы толтырылды. Алғашқы қабылдау мен күнделік жаңартылды.',
  en: 'Patient chart is filled. Primary exam and diary entry are updated.',
};

const ERROR_PROMPT: Record<AppLocale, string> = {
  ru: 'Не удалось завершить пошаговое заполнение карточки.',
  kk: 'Картаны қадамдап толтыруды аяқтау мүмкін болмады.',
  en: 'Unable to complete guided patient chart filling.',
};

const CANCELED_PROMPT: Record<AppLocale, string> = {
  ru: 'Пошаговый режим заполнения карточки остановлен.',
  kk: 'Картаны қадамдап толтыру режимі тоқтатылды.',
  en: 'Guided patient chart mode has been stopped.',
};

export const isPatientCardFlowStartCommand = (normalizedCommand: string): boolean => {
  if (containsAny(normalizedCommand, EXPLICIT_START_PATTERNS)) {
    return true;
  }

  const hasAction = containsAny(normalizedCommand, ACTION_MARKERS);
  const hasPatient = containsAny(normalizedCommand, PATIENT_MARKERS);
  const hasCard = containsAny(normalizedCommand, CARD_MARKERS);

  return hasAction && hasPatient && hasCard;
};

export const getPatientCardStepPrompt = (locale: AppLocale, step: PatientCardFlowStepId): string =>
  STEP_PROMPTS[locale][step];

export const getPatientCardNextPrompt = (locale: AppLocale): string => NEXT_PROMPT[locale];

export const getPatientCardCompletionPrompt = (locale: AppLocale): string => COMPLETION_PROMPT[locale];

export const getPatientCardErrorPrompt = (locale: AppLocale): string => ERROR_PROMPT[locale];

export const getPatientCardCanceledPrompt = (locale: AppLocale): string => CANCELED_PROMPT[locale];

export const buildOpenPrimaryCommand = (locale: AppLocale): string => {
  if (locale === 'kk') return 'Алғашқы қабылдауды аш';
  if (locale === 'en') return 'Open primary exam';
  return 'Открой первичный прием';
};

export const buildOpenDiaryCommand = (locale: AppLocale): string => {
  if (locale === 'kk') return 'Емдеу күнделігін аш';
  if (locale === 'en') return 'Open treatment diary';
  return 'Открой дневник лечения';
};

export const buildPrimaryFillCommand = (answers: PatientCardFlowAnswers): string =>
  [
    'Заполни первичный прием.',
    `Дата регистрации: ${answers.registrationDate ?? ''}.`,
    'Тип записи: первичный осмотр.',
    `Жалобы: ${answers.complaints ?? ''}.`,
    `Анамнез: ${answers.anamnesis ?? ''}.`,
    `Объективный статус: ${answers.objectiveStatus ?? ''}.`,
    `Рекомендации: ${answers.recommendations ?? ''}.`,
    `Примечания: ${answers.notes ?? ''}.`,
  ].join(' ');

export const buildDiaryFillCommand = (answers: PatientCardFlowAnswers): string =>
  `Заполни дневник лечения. Запись: ${answers.diaryNote ?? ''}.`;
