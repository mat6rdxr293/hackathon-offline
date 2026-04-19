export const NAVIGATION_TARGETS = [
  'patients_list',
  'patient_page',
  'primary_exam',
  'discharge_summary',
  'treatment_diary',
  'procedures',
  'schedule_block',
] as const;

export type NavigationTarget = (typeof NAVIGATION_TARGETS)[number];
