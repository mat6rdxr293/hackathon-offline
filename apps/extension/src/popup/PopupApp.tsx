import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';

import { useVoiceInput } from '../hooks/useVoiceInput';
import { useWakeWord } from '../hooks/useWakeWord';
import { useI18n } from '../i18n/provider';
import { loadTtsEnabled, saveTtsEnabled } from '../modules/tts/ttsSettings';
import { ttsController } from '../modules/tts/ttsController';
import { normalizePanelCommand } from '../modules/parser/commandParser';
import type { WorkflowNextStep } from '@hackathon/shared';
import type { AgentViewState, BackgroundToUiMessage, PopupResponse, PopupStateSnapshot, PopupToBackgroundMessage } from '../types/messages';
import { ActiveTabStatus } from './components/ActiveTabStatus';
import { PopupCommandForm } from './components/PopupCommandForm';
import { PopupHeader } from './components/PopupHeader';
import { QuickActions } from './components/QuickActions';
import { AgentFeedbackCard } from './components/AgentFeedbackCard';

const EMPTY_SNAPSHOT: PopupStateSnapshot = {
  agent: { currentStatus: 'idle', lastTranscript: '', lastIntent: null, lastActionSummary: null, lastError: null, panelVisible: false, activeTabSupported: false },
  tab: { tabId: null, title: '', url: '', domain: '', contentScriptAvailable: false, activeTabSupported: false, reason: null, pageType: null, panelVisible: false },
};

const sendPopupMessage = async (message: PopupToBackgroundMessage): Promise<PopupResponse> =>
  (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage
    ? (chrome.runtime.sendMessage(message) as Promise<PopupResponse>)
    : Promise.resolve({ ok: false, error: 'Extension runtime API unavailable' }));

const BAR_HEIGHTS = [10, 18, 28, 16, 24, 12, 20, 30, 14, 18];
const BAR_DELAYS  = [0, 0.1, 0.2, 0.05, 0.15, 0.25, 0.08, 0.18, 0.3, 0.12];

export const PopupApp = () => {
  const { locale, t } = useI18n();
  const [snapshot, setSnapshot] = useState<PopupStateSnapshot>(EMPTY_SNAPSHOT);
  const [agentFull, setAgentFull] = useState<AgentViewState | null>(null);
  const [command, setCommand] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const prevStatusRef = useRef<string>('idle');

  const applyResponse = useCallback((response: PopupResponse) => {
    if (!response.ok) { setRequestError(response.error ?? t('popup.requestFailed')); return; }
    setRequestError(null);
    if (response.payload) setSnapshot(response.payload);
  }, [t]);

  const runCommand = useCallback(async (text: string, source: 'voice' | 'text' | 'quick_action') => {
    const normalized = normalizePanelCommand(text);
    if (!normalized) return;
    const response = await sendPopupMessage({ type: 'RUN_COMMAND', payload: { text: normalized, source } });
    applyResponse(response);
  }, [applyResponse]);

  const { status: voiceStatus, transcript: voiceTranscript, start, stop, cancel } = useVoiceInput(
    locale,
    (finalText: string) => { void runCommand(finalText, 'voice'); },
    (message: string) => { setRequestError(message); },
  );

  const toggleVoice = useCallback(() => {
    if (voiceStatus === 'listening') stop(); else start();
  }, [voiceStatus, start, stop]);

  const cancelVoiceInput = useCallback(() => {
    cancel();
    setCommand('');
  }, [cancel]);

  const wakeSuspended = voiceStatus === 'listening' || voiceStatus === 'processing';
  const { supported: wakeSupported, wakeDetected } = useWakeWord(start, wakeSuspended);

  useEffect(() => {
    let disposed = false;
    void loadTtsEnabled().then((enabled) => {
      if (disposed) return;
      setTtsEnabled(enabled);
      ttsController.setEnabled(enabled);
    });
    return () => { disposed = true; };
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      ttsController.setEnabled(next);
      void saveTtsEnabled(next);
      return next;
    });
  }, []);

  const handleConfirmSave = useCallback(() => {
    void sendPopupMessage({ type: 'POPUP_CONFIRM_SAVE' });
  }, []);

  const handleCancelSave = useCallback(() => {
    void sendPopupMessage({ type: 'POPUP_CANCEL_SAVE' });
  }, []);

  const handleConfirmSuggestion = useCallback((action: WorkflowNextStep['nextRecommendedAction']) => {
    void sendPopupMessage({ type: 'POPUP_CONFIRM_SUGGESTION', payload: { action } });
  }, []);

  const disabledActions = useMemo(
    () => !snapshot.tab.contentScriptAvailable || !snapshot.tab.activeTabSupported,
    [snapshot.tab.activeTabSupported, snapshot.tab.contentScriptAvailable],
  );

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      setRequestError(t('popup.requestFailed'));
      return;
    }

    const listener = (message: BackgroundToUiMessage | unknown) => {
      const msg = message as BackgroundToUiMessage;
      if (msg?.type === 'POPUP_STATE' && msg.payload) {
        setSnapshot(msg.payload as PopupStateSnapshot);
      }
      if (msg?.type === 'AGENT_STATE' && msg.payload) {
        const payload = msg.payload as AgentViewState;
        const wasSuccess = payload.currentStatus === 'success' && prevStatusRef.current !== 'success';

        if (wasSuccess && ttsEnabled && !snapshot.tab.panelVisible) {
          ttsController.speak(
            payload.assistantReply || payload.completionMessage || payload.lastExecutedAction || 'Команда выполнена',
            locale,
          );
        }

        prevStatusRef.current = payload.currentStatus;
        setAgentFull(payload);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    void sendPopupMessage({ type: 'POPUP_READY' }).then(applyResponse);
    return () => { chrome.runtime.onMessage.removeListener(listener); };
  }, [applyResponse, locale, snapshot.tab.panelVisible, t, ttsEnabled]);

  const isListening  = voiceStatus === 'listening';
  const isProcessing = voiceStatus === 'processing' || snapshot.agent.currentStatus === 'processing' || snapshot.agent.currentStatus === 'executing';

  const hasActivity = !!(
    voiceTranscript || snapshot.agent.lastTranscript ||
    agentFull?.assistantReply || snapshot.agent.lastIntent ||
    snapshot.agent.lastActionSummary || requestError || snapshot.agent.lastError ||
    (agentFull?.actionLog?.length ?? 0) > 0
  );

  const showEmpty = !isListening && !hasActivity;

  return (
    <motion.main
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ width: 390, background: '#F8FAFC', color: '#0F172A' }}
    >
      <style>{`
        @keyframes popBar  { from { transform: scaleY(0.3); opacity: 0.5; } to { transform: scaleY(1); opacity: 1; } }
        @keyframes wakePing { 0%,100%{opacity:1}50%{opacity:.35} }
        @keyframes spinIcon { to { transform: rotate(360deg); } }
      `}</style>

      <PopupHeader
        status={snapshot.agent.currentStatus}
        statusLabel={t(`status.${snapshot.agent.currentStatus}`)}
        subtitle={t('popup.header.subtitle')}
      />

      <div style={{ padding: '10px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Tab status */}
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <ActiveTabStatus
            tab={snapshot.tab}
            labels={{
              supported: t('popup.tab.supported'),
              unsupported: t('popup.tab.unsupported'),
              unavailable: t('popup.tab.unavailable'),
              noActive: t('popup.activeTab.none'),
            }}
          />
        </motion.div>

        {/* Command zone */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: 'spring', stiffness: 320, damping: 28 }}
          style={{
            borderRadius: 16,
            background: '#FFFFFF',
            border: '1px solid #E8ECEF',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}
        >
          <AnimatePresence mode="wait">

            {/* Listening */}
            {isListening && (
              <motion.div
                key="listening"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                style={{ padding: '16px 16px 10px', textAlign: 'center' }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 3, height: 32, marginBottom: 10 }}>
                  {BAR_HEIGHTS.map((h, i) => (
                    <div key={i} style={{
                      width: 3, height: h, borderRadius: 999,
                      background: 'linear-gradient(to top, #F87171, #EF4444)',
                      animation: `popBar 0.7s ease-in-out ${BAR_DELAYS[i]}s infinite alternate`,
                      transformOrigin: 'bottom',
                    }} />
                  ))}
                </div>
                {voiceTranscript
                  ? <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, padding: '0 8px', marginBottom: 6 }}>"{voiceTranscript}"</p>
                  : <p style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>Слушаю...</p>
                }
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={cancelVoiceInput}
                    style={{
                      borderRadius: 9999,
                      padding: '5px 12px',
                      border: '1px solid #FCA5A5',
                      background: '#FFF1F2',
                      color: '#B91C1C',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Отменить
                  </button>
                </div>
              </motion.div>
            )}

            {/* Activity - agent feedback */}
            {!isListening && hasActivity && (
              <motion.div
                key="activity"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <AgentFeedbackCard
                  status={snapshot.agent.currentStatus}
                  transcript={voiceTranscript || snapshot.agent.lastTranscript}
                  assistantReply={agentFull?.assistantReply ?? null}
                  intent={snapshot.agent.lastIntent}
                  action={snapshot.agent.lastActionSummary}
                  error={requestError || snapshot.agent.lastError}
                  nextSuggestion={agentFull?.nextSuggestion ?? null}
                  workflowState={agentFull?.workflowState ?? 'idle'}
                  recentActions={agentFull?.actionLog.slice(0, 3) ?? []}
                  isProcessing={isProcessing}
                  awaitingSaveConfirmation={agentFull?.awaitingSaveConfirmation}
                  onConfirmSave={handleConfirmSave}
                  onCancelSave={handleCancelSave}
                  onConfirmSuggestion={handleConfirmSuggestion}
                />
              </motion.div>
            )}

            {/* Empty state */}
            {showEmpty && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ padding: '18px 16px 10px', textAlign: 'center' }}
              >
                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: '#F1F5F9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 8px',
                  }}
                >
                  <Mic size={16} style={{ color: '#94A3B8' }} />
                </motion.div>
                <p style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.5, marginBottom: 8 }}>
                  Скажите команду или введите текст
                </p>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Separator */}
          <div style={{ height: 1, background: '#F1F5F9' }} />

          {/* Input row - always visible */}
          <PopupCommandForm
            command={isListening ? (voiceTranscript || '') : command}
            onCommandChange={setCommand}
            onSubmit={() => { void runCommand(command, 'text'); }}
            voiceStatus={voiceStatus}
            onToggleVoice={toggleVoice}
            disabled={disabledActions}
            placeholder={t('popup.command.placeholder')}
            isProcessing={isProcessing}
          />
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.2 }}
        >
          <QuickActions
            disabled={disabledActions}
            actions={[
              { label: t('popup.quick.openPrimary'), command: t('bg.action.openPrimary'), icon: 'clipboard' },
              { label: t('popup.quick.openDiary'), command: t('bg.action.openDiary'), icon: 'book' },
              { label: t('popup.quick.generateSchedule'), command: t('bg.action.generateSchedule'), icon: 'calendar' },
            ]}
            onQuickCommand={(cmd) => {
              setCommand(cmd);
              void runCommand(cmd, 'quick_action');
            }}
          />
        </motion.div>

        {/* Footer strip: wake word + Озвучка */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.18 }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2, paddingRight: 2 }}
        >
          {wakeSupported && voiceStatus === 'idle' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: wakeDetected ? '#059669' : '#94A3B8' }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: wakeDetected ? '#10B981' : '#CBD5E1',
                display: 'inline-block',
                animation: wakeDetected ? 'wakePing 1s ease-in-out infinite' : 'none',
              }} />
              {wakeDetected ? 'Запись запускается...' : 'Скажите: «Даму»'}
            </div>
          ) : <div />}

          <button
            type="button"
            onClick={toggleTts}
            title={ttsEnabled ? 'Выключить озвучку' : 'Включить озвучку'}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 9px', borderRadius: 6,
              border: `1px solid ${ttsEnabled ? '#A7F3D0' : '#E2E8F0'}`,
              background: ttsEnabled ? '#ECFDF5' : '#F8FAFC',
              color: ttsEnabled ? '#059669' : '#94A3B8',
              fontSize: 10, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {ttsEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
            <span>{ttsEnabled ? 'Озвучка вкл' : 'Озвучка выкл'}</span>
          </button>
        </motion.div>

      </div>
    </motion.main>
  );
};

