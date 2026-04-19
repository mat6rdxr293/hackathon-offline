import type { ActionLogItem } from '@hackathon/shared';

export const summarizeAction = (item: ActionLogItem): string => `${item.timestamp} - ${item.title}`;
