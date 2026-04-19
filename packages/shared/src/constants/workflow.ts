import type { WorkflowState } from '../types/workflow';

export const WORKFLOW_ORDER: WorkflowState[] = [
  'idle',
  'patient_opened',
  'primary_exam_opened',
  'primary_exam_filled',
  'schedule_ready',
  'service_completed',
  'diary_updated',
];
