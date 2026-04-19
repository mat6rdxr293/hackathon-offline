import type { IntentType, WorkflowEvent } from '@hackathon/shared';

export const intentToWorkflowEvent = (intent: IntentType): WorkflowEvent | undefined => {
  switch (intent) {
    case 'navigate':
      return 'primary_exam_opened';
    case 'fill_primary_exam':
      return 'primary_exam_filled';
    case 'generate_schedule':
      return 'schedule_generated';
    case 'complete_service':
      return 'service_completed';
    case 'open_diary':
      return 'diary_updated';
    default:
      return undefined;
  }
};
