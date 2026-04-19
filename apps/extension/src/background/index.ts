import type { PanelToBackgroundMessage, PopupResponse, PopupToBackgroundMessage } from '../types/messages';
import { getCurrentPopupSnapshot, handleApplyPreset, handleCancelSave, handleCommand, handleGenerateAssignment, handleSaveForm, handleSuggestion, openPanelOnActiveTab, sendCurrentState, setVoiceStatus } from './orchestrator';

const isPanelMessage = (message: unknown): message is PanelToBackgroundMessage =>
  message !== null &&
  typeof message === 'object' &&
  'type' in message &&
  ['PANEL_READY', 'PANEL_SUBMIT_COMMAND', 'PANEL_CONFIRM_SUGGESTION', 'PANEL_GENERATE_ASSIGNMENT', 'PANEL_STATUS', 'PANEL_SAVE_FORM', 'PANEL_CANCEL_SAVE', 'PANEL_APPLY_PRESET'].includes(
    String((message as { type: string }).type),
  );

const isPopupMessage = (message: unknown): message is PopupToBackgroundMessage =>
  message !== null &&
  typeof message === 'object' &&
  'type' in message &&
  ['POPUP_READY', 'GET_ACTIVE_TAB_STATE', 'OPEN_PANEL', 'RUN_COMMAND', 'START_VOICE', 'STOP_VOICE', 'POPUP_CONFIRM_SAVE', 'POPUP_CANCEL_SAVE', 'POPUP_CONFIRM_SUGGESTION'].includes(
    String((message as { type: string }).type),
  );

chrome.runtime.onInstalled.addListener(() => {
  // service worker init
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const run = async (): Promise<void> => {
    if (isPanelMessage(message)) {
      if (message.type === 'PANEL_READY') {
        await sendCurrentState();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'PANEL_SUBMIT_COMMAND') {
        await handleCommand(message.payload.text, undefined, message.payload.source);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'PANEL_CONFIRM_SUGGESTION') {
        await handleSuggestion(message.payload.action);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'PANEL_GENERATE_ASSIGNMENT') {
        await handleGenerateAssignment();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'PANEL_STATUS') {
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'PANEL_SAVE_FORM') {
        await handleSaveForm();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'PANEL_CANCEL_SAVE') {
        await handleCancelSave();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'PANEL_APPLY_PRESET') {
        await handleApplyPreset();
        sendResponse({ ok: true });
        return;
      }
    }

    if (isPopupMessage(message)) {
      let payload: PopupResponse['payload'] | undefined;

      if (message.type === 'POPUP_READY' || message.type === 'GET_ACTIVE_TAB_STATE') {
        payload = await getCurrentPopupSnapshot();
      }

      if (message.type === 'OPEN_PANEL') {
        payload = await openPanelOnActiveTab();
      }

      if (message.type === 'RUN_COMMAND') {
        payload = await handleCommand(message.payload.text, undefined, message.payload.source);
      }

      if (message.type === 'START_VOICE') {
        payload = await setVoiceStatus('listening');
      }

      if (message.type === 'STOP_VOICE') {
        payload = await setVoiceStatus('idle');
      }

      if (message.type === 'POPUP_CONFIRM_SAVE') {
        await handleSaveForm();
      }

      if (message.type === 'POPUP_CANCEL_SAVE') {
        await handleCancelSave();
      }

      if (message.type === 'POPUP_CONFIRM_SUGGESTION') {
        await handleSuggestion(message.payload.action);
      }

      sendResponse({ ok: true, payload } satisfies PopupResponse);
      return;
    }

    sendResponse({ ok: false, error: 'Unsupported message type.' });
  };

  run().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies PopupResponse);
  });

  return true;
});
