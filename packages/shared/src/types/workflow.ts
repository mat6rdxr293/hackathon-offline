export const WORKFLOW_STATES = [
  'idle',
  'patient_opened',
  'primary_exam_opened',
  'primary_exam_filled',
  'schedule_ready',
  'service_completed',
  'diary_updated',
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export type WorkflowEvent =
  | 'patient_opened'
  | 'primary_exam_opened'
  | 'primary_exam_filled'
  | 'schedule_generated'
  | 'service_completed'
  | 'diary_updated'
  | 'reset';

export type WorkflowNextStep = {
  nextRecommendedAction: 'navigate' | 'fill_primary_exam' | 'generate_schedule' | 'complete_service' | 'open_diary';
  message: string;
};
