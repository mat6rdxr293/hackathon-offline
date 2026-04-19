import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppLocale, UIStatus } from '@hackathon/shared';

import { VoiceController } from '../modules/voice/voiceController';

export const useVoiceInput = (
  locale: AppLocale,
  onFinalTranscript: (text: string) => void,
  onError: (message: string) => void,
) => {
  const [status, setStatus] = useState<UIStatus>('idle');
  const [transcript, setTranscript] = useState('');

  // Stable refs so VoiceController is created exactly once
  const onFinalRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const controllerRef = useRef<VoiceController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new VoiceController({
      onStatusChange: setStatus,
      onTranscript: (text, isFinal) => {
        setTranscript(text);
        if (isFinal && text.trim()) {
          onFinalRef.current(text.trim());
        }
      },
      onError: (message) => onErrorRef.current(message),
    });
  }

  const controller = controllerRef.current;

  useEffect(() => {
    controller.initialize();
  }, [controller]);

  useEffect(() => {
    controller.setLocale(locale);
  }, [controller, locale]);

  const start = useCallback(() => {
    void controller.start();
  }, [controller]);

  const stop = useCallback(() => {
    controller.stop();
  }, [controller]);

  const cancel = useCallback(() => {
    controller.cancel();
    setTranscript('');
    setStatus('idle');
  }, [controller]);

  return { status, transcript, start, stop, cancel };
};
