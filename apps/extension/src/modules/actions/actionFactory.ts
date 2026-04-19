import type { BackgroundToContentMessage } from '../../types/messages';

export const createNavigateAction = (target: string): BackgroundToContentMessage => ({
  type: 'CONTENT_NAVIGATE',
  payload: { target },
});
