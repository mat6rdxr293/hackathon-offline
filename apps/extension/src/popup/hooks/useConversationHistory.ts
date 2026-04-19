import { useCallback, useEffect, useState } from 'react';

export type HistoryEntry = {
  id: string;
  timestamp: number;
  command: string;
  reply: string | null;
  intent: string | null;
  action: string | null;
  success: boolean;
};

const STORAGE_KEY = 'medflow_popup_history_v1';
const MAX_ENTRIES = 8;

export const relativeTime = (ts: number): string => {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин`;
  if (m < 1440) return `${Math.floor(m / 60)} ч`;
  return `${Math.floor(m / 1440)} дн`;
};

export const useConversationHistory = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    void chrome.storage.local.get(STORAGE_KEY).then((r) => {
      const stored = r[STORAGE_KEY];
      if (Array.isArray(stored)) setHistory(stored as HistoryEntry[]);
    });
  }, []);

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setHistory((prev) => {
      const next = [
        { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
        ...prev,
      ].slice(0, MAX_ENTRIES);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        void chrome.storage.local.set({ [STORAGE_KEY]: next });
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.remove(STORAGE_KEY);
    }
  }, []);

  return { history, addEntry, clearHistory };
};
