const SECTION_NAMES: Record<string, string> = {
  schedule_block:    'Расписание процедур',
  primary_exam:      'Первичный приём',
  patient_page:      'Карточка пациента',
  discharge_summary: 'Выписной эпикриз',
  diary:             'Дневник наблюдений',
  procedures:        'Процедуры',
  lfk:               'ЛФК',
  massage:           'Массаж',
  physio:            'Физиотерапия',
};

export const humanize = (text: string | null | undefined): string => {
  if (!text) return '';
  let result = text;
  for (const [key, val] of Object.entries(SECTION_NAMES)) {
    result = result.replaceAll(key, val);
  }
  return result;
};
