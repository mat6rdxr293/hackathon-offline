import {
  translateByLocale,
  workflowStateSchema,
  type AppLocale,
  type WorkflowEvent,
  type WorkflowNextStep,
  type WorkflowState,
} from '@hackathon/shared';

const transitions: Record<WorkflowState, Partial<Record<WorkflowEvent, WorkflowState>>> = {
  idle: { patient_opened: 'patient_opened', reset: 'idle' },
  patient_opened: { primary_exam_opened: 'primary_exam_opened', reset: 'idle' },
  primary_exam_opened: { primary_exam_filled: 'primary_exam_filled', reset: 'idle' },
  primary_exam_filled: { schedule_generated: 'schedule_ready', reset: 'idle' },
  schedule_ready: { service_completed: 'service_completed', reset: 'idle' },
  service_completed: { diary_updated: 'diary_updated', reset: 'idle' },
  diary_updated: { reset: 'idle' },
};

const nextActionByState: Record<WorkflowState, WorkflowNextStep['nextRecommendedAction']> = {
  idle: 'navigate',
  patient_opened: 'navigate',
  primary_exam_opened: 'fill_primary_exam',
  primary_exam_filled: 'generate_schedule',
  schedule_ready: 'complete_service',
  service_completed: 'open_diary',
  diary_updated: 'navigate',
};

export const advanceWorkflow = (
  state: WorkflowState,
  event?: WorkflowEvent,
  locale: AppLocale = 'ru',
): { state: WorkflowState; next: WorkflowNextStep } => {
  const safeState = workflowStateSchema.parse(state);
  const nextState = event ? transitions[safeState][event] ?? safeState : safeState;

  return {
    state: nextState,
    next: {
      nextRecommendedAction: nextActionByState[nextState],
      message: translateByLocale(locale, `workflow.${nextState}.message`),
    },
  };
};
