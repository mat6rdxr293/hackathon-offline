import { useCallback, useEffect, useRef, useState } from 'react';

import { isWakeWordSupported, WakeWordDetector } from '../modules/voice/wakeWordDetector';

export const useWakeWord = (onWake: () => void, suspended: boolean) => {
  const [supported] = useState(() => isWakeWordSupported());
  const [active, setActive] = useState(false);

  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  const detectorRef = useRef<WakeWordDetector | null>(null);

  // Create detector once on mount
  useEffect(() => {
    if (!supported) return;

    const detector = new WakeWordDetector(() => {
      setActive(true);
      // Brief visual flash, then reset
      setTimeout(() => setActive(false), 1200);
      onWakeRef.current();
    });

    detectorRef.current = detector;
    detector.start();

    return () => {
      detector.stop();
      detectorRef.current = null;
    };
  }, [supported]);

  // Pause/resume based on whether main mic is active
  const suspendedRef = useRef(suspended);
  useEffect(() => {
    suspendedRef.current = suspended;
    if (!detectorRef.current) return;
    if (suspended) {
      detectorRef.current.suspend();
    } else {
      detectorRef.current.resume();
    }
  }, [suspended]);

  const stopPermanently = useCallback(() => {
    detectorRef.current?.stop();
  }, []);

  return { supported, wakeDetected: active, stopPermanently };
};
