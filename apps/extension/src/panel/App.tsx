import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, CheckCircle2, FileText, Mic, Save, Sparkles, Volume2, VolumeX, Workflow, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ActionLogList } from '../components/ActionLogList';
import { AgentHeader } from '../components/AgentHeader';
import { CommandInput } from '../components/CommandInput';
import { ErrorLogList } from '../components/ErrorLogList';
import { StructuredOutputCard } from '../components/StructuredOutputCard';
import { SuggestionCard } from '../components/SuggestionCard';
import { VoiceControls } from '../components/VoiceControls';
import { VoiceListeningOverlay } from '../components/VoiceListeningOverlay';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useWakeWord } from '../hooks/useWakeWord';
import { useI18n } from '../i18n/provider';
import { playCompletionBell } from '../modules/audio/notificationBell';
import { normalizePanelCommand } from '../modules/parser/commandParser';
import { loadTtsEnabled, saveTtsEnabled } from '../modules/tts/ttsSettings';
import { ttsController } from '../modules/tts/ttsController';
import {
  buildDiaryFillCommand,
  buildOpenDiaryCommand,
  buildOpenPrimaryCommand,
  buildPrimaryFillCommand,
  isPatientCardFlowStartCommand,
  PATIENT_CARD_FLOW_STEPS,
  type PatientCardFlowAnswers,
} from '../modules/workflow/patientCardFlow';
import { apiClient, type MedicalDocumentAnalysis } from '../lib/apiClient';
import { useAgentStore } from '../store/agentStore';
import type { BackgroundToUiMessage, PanelToBackgroundMessage } from '../types/messages';

const sendRuntimeMessage = async (message: PanelToBackgroundMessage, retries = 3): Promise<void> => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Extension runtime API unavailable');
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await chrome.runtime.sendMessage(message);
      return;
    } catch {
      if (attempt === retries - 1) throw new Error('Background service worker unavailable');
      await new Promise<void>((res) => setTimeout(res, 400 * (attempt + 1)));
    }
  }
};

type PatientCardFlowRuntimeState = {
  active: boolean;
  stepIndex: number;
  answers: PatientCardFlowAnswers;
  executing: boolean;
};

const INITIAL_PATIENT_CARD_FLOW_STATE: PatientCardFlowRuntimeState = {
  active: false,
  stepIndex: 0,
  answers: {},
  executing: false,
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const NAV_KEYWORDS = [
  'открой', 'открыть', 'перейди', 'перейти', 'покажи', 'показать',
  'зайди', 'зайти', 'войди', 'войти', 'переключись', 'переключи',
  'нажми', 'перейдем', 'зайдем',
];
const FILL_KEYWORDS = [
  'запиши', 'заполни', 'заполнить', 'записать', 'внеси', 'добавь',
  'жалоб', 'анамн', 'объектив', 'рекомендац', 'эпикриз', 'выписк',
  'дневник', 'температур', 'пульс', 'расписан',
];
const isNavigationVoiceCommand = (text: string): boolean => {
  const norm = text.toLowerCase().normalize('NFKC');
  const hasFill = FILL_KEYWORDS.some((kw) => norm.includes(kw));
  if (hasFill) return false;
  return NAV_KEYWORDS.some((kw) => norm.includes(kw));
};

const DOCUMENT_CONTEXT_PATTERN =
  /эпикриз|выписк|discharge|epicrisis|шығару|қорытынды|проанализ|анализ.*документ|разбор.*документ|analy[sz]e.*document|document analysis/u;

const shouldAttachDocumentContext = (text: string): boolean =>
  DOCUMENT_CONTEXT_PATTERN.test(text.toLowerCase().normalize('NFKC'));

const extractTextFromUploadedFile = async (file: File): Promise<string> => {
  if (file.type !== 'application/pdf') {
    return file.text();
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const raw = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
  const blocks = raw.match(/BT[\s\S]*?ET/g) ?? [];
  const textFromPdfObjects = blocks
    .flatMap((b) => (b.match(/\(([^)]+)\)\s*Tj/g) ?? []).map((s) => s.replace(/\(([^)]+)\)\s*Tj/, '$1')))
    .join(' ');

  if (textFromPdfObjects.trim()) {
    return textFromPdfObjects;
  }

  return raw.replace(/[^\x20-\x7E\u0400-\u04FF]/g, ' ').replace(/\s+/g, ' ').slice(0, 8000);
};

export const App = () => {
  const { locale, setLocale, t } = useI18n();
  const [commandText, setCommandText] = useState('');
  const [pendingVoiceDraft, setPendingVoiceDraft] = useState<{ text: string; source: 'voice' } | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const {
    currentStatus,
    parsedMedicalData,
    currentIntent,
    workflowState,
    nextSuggestion,
    actionLog,
    errorLog,
    latestSchedule,
    completionMessage,
    assistantReply,
    awaitingSaveConfirmation,
    diagnosisPreset,
    uploadedFileContext,
    uploadedFileName,
    setStateFromBackground,
    setLocalStatus,
    setTranscript,
    pushError,
    dismissCompletion,
    setFileContext,
  } = useAgentStore();

  const patientCardFlowRef = useRef<PatientCardFlowRuntimeState>(INITIAL_PATIENT_CARD_FLOW_STATE);
  const promptCaptureTimerRef = useRef<number | null>(null);
  const medVoiceHandlerRef = useRef<(text: string) => void>(() => undefined);
  const [pendingFileAnalysis, setPendingFileAnalysis] = useState<{
    fileName: string;
    analysis: MedicalDocumentAnalysis;
  } | null>(null);

  const clearPromptCaptureTimer = useCallback(() => {
    if (promptCaptureTimerRef.current !== null) {
      window.clearTimeout(promptCaptureTimerRef.current);
      promptCaptureTimerRef.current = null;
    }
  }, []);

  const updatePatientCardFlow = useCallback((nextState: PatientCardFlowRuntimeState) => {
    patientCardFlowRef.current = nextState;
  }, []);

  const submitCommand = useCallback(
    async (text: string, source: 'voice' | 'text' = 'text'): Promise<boolean> => {
      const fileCtx = useAgentStore.getState().uploadedFileContext;
      const enriched =
        fileCtx && shouldAttachDocumentContext(text)
          ? `${text}\n[Контекст из документа: ${fileCtx}]`
          : text;
      const normalized = normalizePanelCommand(enriched);
      if (!normalized) return false;

      setTranscript(normalized);
      setLocalStatus('processing');

      try {
        await sendRuntimeMessage({
          type: 'PANEL_SUBMIT_COMMAND',
          payload: { text: normalized, source },
        });
        return true;
      } catch (error) {
        pushError(error instanceof Error ? error.message : String(error));
        setLocalStatus('error');
        return false;
      }
    },
    [pushError, setLocalStatus, setTranscript],
  );

  const { status: medVoiceStatus, transcript: medTranscript, start: medStart, stop: medStop, cancel: medCancel } = useVoiceInput(
    locale,
    (finalText: string) => {
      setCommandText(finalText);
      medVoiceHandlerRef.current(finalText);
    },
    (message) => {
      pushError(message);
      setLocalStatus('error');
    },
  );

  const { status: schedVoiceStatus, transcript: schedTranscript, start: schedStart, stop: schedStop, cancel: schedCancel } = useVoiceInput(
    locale,
    (finalText: string) => {
      const cmd = `Сформируй расписание процедур. Дополнительные условия: ${finalText}`;
      setCommandText(cmd);
      setPendingVoiceDraft({ text: cmd, source: 'voice' });
    },
    (message) => {
      pushError(message);
      setLocalStatus('error');
    },
  );

  const queueMedicalListeningAfterPrompt = useCallback(() => {
    clearPromptCaptureTimer();
    promptCaptureTimerRef.current = window.setTimeout(() => {
      if (!patientCardFlowRef.current.active || patientCardFlowRef.current.executing) return;
      medStart();
    }, 260);
  }, [clearPromptCaptureTimer, medStart]);

  const cancelPatientCardFlow = useCallback(() => {
    clearPromptCaptureTimer();
    updatePatientCardFlow(INITIAL_PATIENT_CARD_FLOW_STATE);
  }, [clearPromptCaptureTimer, updatePatientCardFlow]);

  const handlePatientCardFlowAnswer = useCallback(
    async (text: string) => {
      const flow = patientCardFlowRef.current;
      if (!flow.active || flow.executing) return;

      const answer = text.trim();
      const currentStep = PATIENT_CARD_FLOW_STEPS[flow.stepIndex];
      if (!currentStep) {
        cancelPatientCardFlow();
        return;
      }

      if (!answer) {
        queueMedicalListeningAfterPrompt();
        return;
      }

      const nextAnswers: PatientCardFlowAnswers = { ...flow.answers, [currentStep]: answer };
      const nextIndex = flow.stepIndex + 1;

      if (nextIndex < PATIENT_CARD_FLOW_STEPS.length) {
        updatePatientCardFlow({
          active: true,
          stepIndex: nextIndex,
          answers: nextAnswers,
          executing: false,
        });

        queueMedicalListeningAfterPrompt();
        return;
      }

      updatePatientCardFlow({
        active: true,
        stepIndex: flow.stepIndex,
        answers: nextAnswers,
        executing: true,
      });

      const fillPrimaryOk = await submitCommand(buildPrimaryFillCommand(nextAnswers), 'voice');
      if (!fillPrimaryOk) {
        cancelPatientCardFlow();
        return;
      }

      await sleep(350);
      const openDiaryOk = await submitCommand(buildOpenDiaryCommand(locale), 'voice');
      if (!openDiaryOk) {
        cancelPatientCardFlow();
        return;
      }

      await sleep(350);
      const fillDiaryOk = await submitCommand(buildDiaryFillCommand(nextAnswers), 'voice');
      if (!fillDiaryOk) {
        cancelPatientCardFlow();
        return;
      }

      playCompletionBell();
      cancelPatientCardFlow();
    },
    [cancelPatientCardFlow, queueMedicalListeningAfterPrompt, submitCommand, updatePatientCardFlow],
  );

  const startPatientCardFlow = useCallback(async (): Promise<boolean> => {
    setPendingVoiceDraft(null);
    setCommandText('');
    medStop();
    schedStop();
    clearPromptCaptureTimer();

    updatePatientCardFlow({
      active: true,
      stepIndex: 0,
      answers: {},
      executing: false,
    });

    const openPrimaryOk = await submitCommand(buildOpenPrimaryCommand(locale), 'text');
    if (!openPrimaryOk) {
      cancelPatientCardFlow();
      return false;
    }

    queueMedicalListeningAfterPrompt();
    return true;
  }, [
    cancelPatientCardFlow,
    clearPromptCaptureTimer,
    locale,
    medStop,
    queueMedicalListeningAfterPrompt,
    schedStop,
    submitCommand,
    updatePatientCardFlow,
  ]);

  const runCommand = useCallback(
    async (text: string, source: 'voice' | 'text' = 'text'): Promise<boolean> => {
      const normalized = normalizePanelCommand(text);
      if (!normalized) return false;

      if (isPatientCardFlowStartCommand(normalized)) {
        return startPatientCardFlow();
      }

      if (patientCardFlowRef.current.active) {
        cancelPatientCardFlow();
      }

      return submitCommand(normalized, source);
    },
    [cancelPatientCardFlow, startPatientCardFlow, submitCommand],
  );

  useEffect(() => {
    medVoiceHandlerRef.current = (finalText: string) => {
      if (patientCardFlowRef.current.active) {
        void handlePatientCardFlowAnswer(finalText);
        return;
      }
      // Navigation commands auto-submit — no confirmation needed.
      // Fill / save / schedule commands keep the confirmation step.
      if (isNavigationVoiceCommand(finalText)) {
        setCommandText(finalText);
        void runCommand(finalText, 'voice');
      } else {
        setPendingVoiceDraft({ text: finalText, source: 'voice' });
      }
    };
  }, [handlePatientCardFlowAnswer, runCommand]);

  const startMedVoice = useCallback(() => {
    setPendingVoiceDraft(null);
    setCommandText('');
    medStart();
  }, [medStart]);

  const isVoiceBusy = (status: typeof medVoiceStatus): boolean => status === 'listening' || status === 'processing';
  const mainMicActive = isVoiceBusy(medVoiceStatus) || isVoiceBusy(schedVoiceStatus);

  const { supported: wakeSupported, wakeDetected } = useWakeWord(
    startMedVoice,
    mainMicActive,
  );

  const startSchedVoice = useCallback(() => {
    cancelPatientCardFlow();
    setPendingVoiceDraft(null);
    setCommandText('');
    schedStart();
  }, [cancelPatientCardFlow, schedStart]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rawText = await extractTextFromUploadedFile(file);
      const analysis = await apiClient.analyzeMedicalDocument(rawText, locale);
      setPendingFileAnalysis({ fileName: file.name, analysis });
      // Keep file name in UI, but do not attach context until doctor confirms preview.
      setFileContext(null, file.name);
    } catch (err) {
      pushError(err instanceof Error ? err.message : 'Ошибка загрузки файла');
    }
    e.target.value = '';
  }, [locale, pushError, setFileContext]);

  const applyFileAnalysisContext = useCallback(() => {
    if (!pendingFileAnalysis) return;
    setFileContext(pendingFileAnalysis.analysis.contextForPrompt, pendingFileAnalysis.fileName);
    setPendingFileAnalysis(null);
  }, [pendingFileAnalysis, setFileContext]);

  const clearFileContextAndPreview = useCallback(() => {
    setPendingFileAnalysis(null);
    setFileContext(null, null);
  }, [setFileContext]);

  const cancelPendingVoiceDraft = useCallback(() => {
    setPendingVoiceDraft(null);
    setCommandText('');
    setLocalStatus('idle');
  }, [setLocalStatus]);

  const submitPendingVoiceDraft = useCallback(async () => {
    if (!pendingVoiceDraft) {
      return;
    }
    const ok = await runCommand(pendingVoiceDraft.text, pendingVoiceDraft.source);
    if (ok) {
      setPendingVoiceDraft(null);
      setCommandText('');
    }
  }, [pendingVoiceDraft, runCommand]);

  useEffect(() => {
    let disposed = false;
    void loadTtsEnabled().then((enabled) => {
      if (disposed) return;
      setTtsEnabled(enabled);
      ttsController.setEnabled(enabled);
    });

    return () => {
      disposed = true;
    };
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      ttsController.setEnabled(next);
      void saveTtsEnabled(next);
      return next;
    });
  }, []);

  const prevStatusRef = useRef<string>('idle');

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      pushError('Extension runtime API unavailable in this context.');
      return () => {
        clearPromptCaptureTimer();
      };
    }

    const listener = (message: BackgroundToUiMessage) => {
      if (message?.type === 'AGENT_STATE') {
        const { currentStatus: newStatus } = message.payload;
        const flowActive = patientCardFlowRef.current.active;

        if (!flowActive && newStatus === 'success' && prevStatusRef.current !== 'success') {
          playCompletionBell();
          if (ttsEnabled) {
            const spokenText =
              message.payload.assistantReply
              || message.payload.lastExecutedAction
              || message.payload.completionMessage
              || 'Команда выполнена';
            ttsController.speak(spokenText, locale);
          }
        }

        prevStatusRef.current = newStatus;
        setStateFromBackground(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    // Wake up the service worker — retry handles the MV3 sleep case
    sendRuntimeMessage({ type: 'PANEL_READY' }).catch(() => {
      // SW was sleeping; retries exhausted — panel will recover on next user action
    });

    // MV3 BFCache can close long-lived ports with runtime.lastError noise.
    // Use lightweight heartbeat messages instead of a persistent Port.
    const sendHeartbeat = () => {
      if (document.hidden) {
        return;
      }
      void sendRuntimeMessage({ type: 'PANEL_STATUS' }).catch(() => {
        // SW can be sleeping; retries inside sendRuntimeMessage handle recovery.
      });
    };

    const onPageVisible = () => {
      if (!document.hidden) {
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', onPageVisible);
    window.addEventListener('pageshow', onPageVisible);
    sendHeartbeat();

    const keepAlive = setInterval(sendHeartbeat, 20_000);

    return () => {
      clearInterval(keepAlive);
      document.removeEventListener('visibilitychange', onPageVisible);
      window.removeEventListener('pageshow', onPageVisible);
      chrome.runtime.onMessage.removeListener(listener);
      clearPromptCaptureTimer();
    };
  }, [clearPromptCaptureTimer, locale, pushError, setStateFromBackground, ttsEnabled]);

  useEffect(() => {
    if (medVoiceStatus === 'listening' || schedVoiceStatus === 'listening') {
      setLocalStatus('listening');
    }
  }, [setLocalStatus, medVoiceStatus, schedVoiceStatus]);

  const activeVoiceMode = medVoiceStatus === 'listening' || medVoiceStatus === 'processing'
    ? 'medical'
    : schedVoiceStatus === 'listening' || schedVoiceStatus === 'processing'
      ? 'schedule'
      : null;

  const activeTranscript = activeVoiceMode === 'medical' ? medTranscript : schedTranscript;
  const activeStop = activeVoiceMode === 'medical' ? medStop : schedStop;
  const activeCancel = activeVoiceMode === 'medical' ? medCancel : schedCancel;
  const activeProcessing = activeVoiceMode === 'medical'
    ? medVoiceStatus === 'processing'
    : schedVoiceStatus === 'processing';
  const hasPostFillActions = workflowState === 'primary_exam_filled' && !awaitingSaveConfirmation;
  const postFillActionsDisabled = currentStatus === 'processing' || currentStatus === 'executing' || activeProcessing;

  const resolveActionLabel = useCallback((action: string): string => {
    const actionKeyMap: Record<string, string> = {
      navigate: 'bg.action.openPrimary',
      fill_primary_exam: 'bg.action.fillPrimary',
      generate_assignment: 'bg.action.generateAssignment',
      generate_schedule: 'bg.action.generateSchedule',
      complete_service: 'bg.action.completeService',
      open_diary: 'bg.action.openDiary',
    };

    const key = actionKeyMap[action];
    return key ? t(key) : action;
  }, [t]);

  const runPostFillAction = useCallback((commandKey: string) => {
    void submitCommand(t(commandKey), 'text');
  }, [submitCommand, t]);

  return (
    <main className="h-full overflow-auto p-3" style={{ background: '#02090A' }}>
      <div className="space-y-3">
        <AgentHeader
          status={currentStatus}
          statusLabel={t(`status.${currentStatus}`)}
          subtitle={t('panel.header.subtitle')}
        />

        <AnimatePresence>
          {(assistantReply || completionMessage) && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.22 }}
              className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
              style={{
                background: 'rgba(54,244,164,0.07)',
                border: '1px solid rgba(54,244,164,0.22)',
              }}
            >
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: '#36F4A4' }} />
              <p className="flex-1 text-xs font-medium" style={{ color: '#C1FBD4' }}>{assistantReply || completionMessage}</p>
              <button
                type="button"
                onClick={dismissCompletion}
                className="shrink-0 rounded-full p-0.5 transition"
                style={{ color: 'rgba(54,244,164,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#36F4A4')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(54,244,164,0.5)')}
              >
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="space-y-2 rounded-2xl p-3"
          style={{
            background: '#061A1C',
            border: '1px solid #1E2C31',
            boxShadow: 'rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px, rgba(255,255,255,0.03) 0px 1px 0px inset',
          }}
        >
          {activeVoiceMode ? (
            <VoiceListeningOverlay
              transcript={activeTranscript}
              onStop={activeStop}
              onCancel={() => {
                activeCancel();
                cancelPendingVoiceDraft();
              }}
              processing={activeProcessing}
              mode={activeVoiceMode}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium" style={{ color: '#71717A', letterSpacing: '0.04em' }}>{t('panel.controls.title')}</p>
                <VoiceControls
                  medListening={medVoiceStatus === 'listening'}
                  schedListening={schedVoiceStatus === 'listening'}
                  onMedStart={startMedVoice}
                  onMedStop={medStop}
                  onSchedStart={startSchedVoice}
                  onSchedStop={schedStop}
                  medStartLabel="Медзапись"
                  medStopLabel="Стоп"
                  schedStartLabel="Расписание"
                  schedStopLabel="Стоп"
                />
              </div>

              <CommandInput
                value={commandText}
                onChange={setCommandText}
                onSubmit={(value) => {
                  setPendingVoiceDraft(null);
                  void runCommand(value, 'text');
                  setCommandText('');
                }}
                placeholder={t('panel.command.placeholder')}
                submitLabel={t('panel.command.submit')}
              />

              {wakeSupported && !mainMicActive && (
                <div
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition-colors duration-300"
                  style={{
                    border: `1px solid ${wakeDetected ? 'rgba(54,244,164,0.3)' : '#1E2C31'}`,
                    background: wakeDetected ? 'rgba(54,244,164,0.06)' : '#102620',
                    color: wakeDetected ? '#36F4A4' : '#52525B',
                  }}
                >
                  <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                    {wakeDetected && (
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                        style={{ background: '#36F4A4' }}
                      />
                    )}
                    <Mic size={12} style={{ color: wakeDetected ? '#36F4A4' : '#52525B' }} />
                  </span>
                  <span>
                    {wakeDetected
                      ? 'Команда распознана — запись запускается…'
                      : 'Ожидание команды: «Даму»'}
                  </span>
                </div>
              )}

              <div
                className="flex items-center justify-between rounded-xl px-2.5 py-2"
                style={{ background: '#102620', border: '1px solid #1E2C31' }}
              >
                <div className="flex items-center gap-2 text-xs" style={{ color: '#A1A1AA' }}>
                  {ttsEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                  <span className="font-medium">{t('panel.tts.label')}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ttsEnabled}
                  onClick={toggleTts}
                  className="text-xs font-medium transition"
                  style={{
                    borderRadius: 9999,
                    padding: '4px 12px',
                    border: ttsEnabled ? '1px solid rgba(54,244,164,0.3)' : '1px solid #3F3F46',
                    background: ttsEnabled ? 'rgba(54,244,164,0.1)' : 'rgba(255,255,255,0.04)',
                    color: ttsEnabled ? '#36F4A4' : '#71717A',
                    cursor: 'pointer',
                  }}
                >
                  {ttsEnabled ? t('panel.tts.on') : t('panel.tts.off')}
                </button>
              </div>

              {pendingVoiceDraft && (
                <div
                  className="rounded-xl p-2.5"
                  style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.22)' }}
                >
                  <p className="text-xs font-medium" style={{ color: '#d97706' }}>
                    Распознан голосовой текст. Проверьте и подтвердите отправку или отмените.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void submitPendingVoiceDraft(); }}
                      className="text-xs font-semibold transition"
                      style={{
                        borderRadius: 9999,
                        padding: '6px 14px',
                        background: '#FFFFFF',
                        color: '#000000',
                        border: '2px solid transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      Отправить голос
                    </button>
                    <button
                      type="button"
                      onClick={cancelPendingVoiceDraft}
                      className="text-xs font-semibold transition"
                      style={{
                        borderRadius: 9999,
                        padding: '6px 14px',
                        background: 'transparent',
                        color: '#A1A1AA',
                        border: '1px solid #3F3F46',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      Отменить
                    </button>
                  </div>
                </div>
              )}

              {/* File upload */}
              <div className="flex items-center gap-2">
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-medium transition"
                  style={{
                    borderRadius: 9999,
                    padding: '6px 14px 6px 10px',
                    background: '#102620',
                    border: '1px solid #1E2C31',
                    color: uploadedFileName ? '#36F4A4' : '#52525B',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3F3F46')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1E2C31')}
                >
                  <FileText size={12} />
                  {uploadedFileName
                    ? <span className="max-w-[160px] truncate">{uploadedFileName}</span>
                    : 'Загрузить анализ / справку'}
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.csv"
                    className="hidden"
                    onChange={(e) => { void handleFileUpload(e); }}
                  />
                </label>
                {uploadedFileName && (
                  <button
                    type="button"
                    onClick={clearFileContextAndPreview}
                    style={{
                      borderRadius: '50%',
                      padding: 2,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#52525B',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#52525B')}
                    title="Удалить"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {uploadedFileContext && !pendingFileAnalysis && (
                <p className="text-xs" style={{ color: '#36F4A4' }}>
                  Контекст из документа подтвержден и будет использован для эпикриза и анализа документа.
                </p>
              )}
              {pendingFileAnalysis && (
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: 'rgba(14,165,233,0.06)',
                    border: '1px solid rgba(14,165,233,0.24)',
                  }}
                >
                  <p className="text-xs font-semibold mb-2" style={{ color: '#7DD3FC' }}>
                    Превью извлеченных данных из файла: {pendingFileAnalysis.fileName}
                  </p>
                  <div className="space-y-1 text-xs" style={{ color: '#E4E4E7' }}>
                    <p><span style={{ color: '#A1A1AA' }}>Диагнозы:</span> {pendingFileAnalysis.analysis.extracted.diagnoses.join('; ') || '—'}</p>
                    <p><span style={{ color: '#A1A1AA' }}>Жалобы:</span> {pendingFileAnalysis.analysis.extracted.complaints.join('; ') || '—'}</p>
                    <p><span style={{ color: '#A1A1AA' }}>Анамнез:</span> {pendingFileAnalysis.analysis.extracted.anamnesis || '—'}</p>
                    <p><span style={{ color: '#A1A1AA' }}>Лабораторные показатели:</span> {pendingFileAnalysis.analysis.extracted.labFindings.join('; ') || '—'}</p>
                    <p><span style={{ color: '#A1A1AA' }}>Заключения врачей:</span> {pendingFileAnalysis.analysis.extracted.physicianConclusions.join('; ') || '—'}</p>
                    <p><span style={{ color: '#A1A1AA' }}>Назначения:</span> {pendingFileAnalysis.analysis.extracted.assignments.join('; ') || '—'}</p>
                    <p>
                      <span style={{ color: '#A1A1AA' }}>Даты:</span>{' '}
                      госпитализация {pendingFileAnalysis.analysis.extracted.hospitalizationDate || '—'}, выписка {pendingFileAnalysis.analysis.extracted.dischargeDate || '—'}
                    </p>
                    <p><span style={{ color: '#A1A1AA' }}>Резюме:</span> {pendingFileAnalysis.analysis.extracted.summary || '—'}</p>
                  </div>
                  {pendingFileAnalysis.analysis.extracted.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {pendingFileAnalysis.analysis.extracted.warnings.map((warning) => (
                        <p key={warning} className="text-xs" style={{ color: '#FCA5A5' }}>
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs" style={{ color: '#A1A1AA' }}>
                    Проверьте данные. Контекст будет применен только после подтверждения.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={applyFileAnalysisContext}
                      className="text-xs font-semibold transition"
                      style={{
                        borderRadius: 9999,
                        padding: '6px 14px',
                        background: '#FFFFFF',
                        color: '#000000',
                        border: '2px solid transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      Использовать в эпикризе
                    </button>
                    <button
                      type="button"
                      onClick={clearFileContextAndPreview}
                      className="text-xs font-semibold transition"
                      style={{
                        borderRadius: 9999,
                        padding: '6px 14px',
                        background: 'transparent',
                        color: '#A1A1AA',
                        border: '1px solid #3F3F46',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      Не использовать
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.18 }}
          className="space-y-2"
        >
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div
              className="flex flex-col items-center gap-1 rounded-xl p-2.5"
              style={{
                background: '#061A1C',
                border: '1px solid #1E2C31',
                boxShadow: 'rgba(255,255,255,0.03) 0px 1px 0px inset',
              }}
            >
              <Workflow size={14} style={{ color: '#36F4A4' }} />
              <p className="font-medium" style={{ color: '#52525B', fontSize: 10, letterSpacing: '0.05em' }}>{t('panel.workflow.label')}</p>
              <p className="text-center font-medium" style={{ color: '#FFFFFF' }}>{workflowState}</p>
            </div>
            <div
              className="flex flex-col items-center gap-1 rounded-xl p-2.5"
              style={{
                background: '#061A1C',
                border: '1px solid #1E2C31',
                boxShadow: 'rgba(255,255,255,0.03) 0px 1px 0px inset',
              }}
            >
              <CalendarDays size={14} style={{ color: '#5eead4' }} />
              <p className="font-medium" style={{ color: '#52525B', fontSize: 10, letterSpacing: '0.05em' }}>{t('panel.scheduleItems.label')}</p>
              <p className="text-center font-medium" style={{ color: '#FFFFFF' }}>{latestSchedule?.items.length ?? 0}</p>
            </div>
          </div>

          {/* Save confirmation — Human-in-the-Loop */}
          <AnimatePresence>
            {awaitingSaveConfirmation && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl p-3"
                style={{
                  background: 'rgba(54,244,164,0.05)',
                  border: '1px solid rgba(54,244,164,0.2)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Save size={14} className="shrink-0" style={{ color: '#36F4A4' }} />
                  <p className="text-xs font-medium" style={{ color: '#C1FBD4' }}>Поля заполнены. Сохранить в систему?</p>
                </div>
                <p className="text-xs mb-2" style={{ color: '#71717A' }}>Проверьте данные ниже и подтвердите сохранение или отмените.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void sendRuntimeMessage({ type: 'PANEL_SAVE_FORM' }).catch((err) =>
                        pushError(err instanceof Error ? err.message : String(err)),
                      );
                    }}
                    className="text-xs font-semibold transition"
                    style={{
                      borderRadius: 9999,
                      padding: '7px 16px',
                      background: '#FFFFFF',
                      color: '#000000',
                      border: '2px solid transparent',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Сохранить в систему
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void sendRuntimeMessage({ type: 'PANEL_CANCEL_SAVE' }).catch((err) =>
                        pushError(err instanceof Error ? err.message : String(err)),
                      );
                    }}
                    className="text-xs font-semibold transition"
                    style={{
                      borderRadius: 9999,
                      padding: '7px 16px',
                      background: 'transparent',
                      color: '#A1A1AA',
                      border: '1px solid #3F3F46',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    Не сохранять
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Diagnosis preset suggestion */}
          <AnimatePresence>
            {diagnosisPreset && !awaitingSaveConfirmation && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl p-3"
                style={{
                  background: 'rgba(54,244,164,0.04)',
                  border: '1px solid rgba(54,244,164,0.14)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} className="shrink-0" style={{ color: '#36F4A4' }} />
                    <p className="text-xs font-medium" style={{ color: '#C1FBD4' }}>Шаблон по диагнозу</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void sendRuntimeMessage({ type: 'PANEL_APPLY_PRESET' }).catch((err) =>
                        pushError(err instanceof Error ? err.message : String(err)),
                      );
                    }}
                    className="text-xs font-semibold transition"
                    style={{
                      borderRadius: 9999,
                      padding: '5px 12px',
                      background: '#FFFFFF',
                      color: '#000000',
                      border: '2px solid transparent',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Применить
                  </button>
                </div>
                <p className="text-xs truncate" style={{ color: '#71717A' }}>{diagnosisPreset.diagnosis}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <StructuredOutputCard
            data={parsedMedicalData}
            title={t('structured.title')}
            emptyLabel={t('structured.empty')}
            labels={{
              complaints: t('structured.complaints'),
              anamnesis: t('structured.anamnesis'),
              objectiveStatus: t('structured.objectiveStatus'),
              recommendations: t('structured.recommendations'),
              notes: t('structured.notes'),
            }}
            emptyValue={t('panel.empty')}
          />

          <SuggestionCard
            suggestion={nextSuggestion}
            onConfirm={(action) =>
              void sendRuntimeMessage({ type: 'PANEL_CONFIRM_SUGGESTION', payload: { action } }).catch((error) =>
                pushError(error instanceof Error ? error.message : String(error)),
              )
            }
            title={t('suggestion.title')}
            confirmLabel={(action) => t('suggestion.confirm', { action: resolveActionLabel(action) })}
          />

          <AnimatePresence>
            {hasPostFillActions && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl p-3"
                style={{
                  background: '#061A1C',
                  border: '1px solid #1E2C31',
                  boxShadow: 'rgba(255,255,255,0.03) 0px 1px 0px inset',
                }}
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <Workflow size={13} className="shrink-0" style={{ color: '#36F4A4' }} />
                  <p className="text-xs font-medium" style={{ color: '#A1A1AA' }}>{t('suggestion.afterFill.title')}</p>
                </div>
                <p className="text-xs mb-2" style={{ color: '#52525B' }}>{t('suggestion.afterFill.subtitle')}</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: t('bg.action.generateAssignment'), onClick: () => { void sendRuntimeMessage({ type: 'PANEL_GENERATE_ASSIGNMENT' }).catch((err) => pushError(err instanceof Error ? err.message : String(err))); } },
                    { label: t('bg.action.openProcedures'), onClick: () => runPostFillAction('bg.action.openProcedures') },
                    { label: t('bg.action.generateSchedule'), onClick: () => runPostFillAction('bg.action.generateSchedule') },
                    { label: t('bg.action.openDiary'), onClick: () => runPostFillAction('bg.action.openDiary') },
                  ].map(({ label, onClick }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={postFillActionsDisabled}
                      onClick={onClick}
                      className="text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        borderRadius: 9999,
                        padding: '6px 14px',
                        background: 'transparent',
                        color: '#A1A1AA',
                        border: '1px solid #3F3F46',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { if (!postFillActionsDisabled) { e.currentTarget.style.borderColor = '#36F4A4'; e.currentTarget.style.color = '#36F4A4'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#3F3F46'; e.currentTarget.style.color = '#A1A1AA'; }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ActionLogList items={actionLog} title={t('actionLog.title')} emptyLabel={t('actionLog.empty')} locale={locale} />
          <ErrorLogList errors={errorLog} title={t('errorLog.title')} emptyLabel={t('errorLog.empty')} />
        </motion.section>
      </div>
    </main>
  );
};
