export const UI_STATUSES = ['idle', 'listening', 'processing', 'executing', 'success', 'error'] as const;

export type UIStatus = (typeof UI_STATUSES)[number];
