export type ActionLogType = 'navigate' | 'fill' | 'schedule' | 'complete' | 'error';

export type ActionLogItem = {
  id: string;
  timestamp: string;
  type: ActionLogType;
  title: string;
  details?: string;
  success: boolean;
};
