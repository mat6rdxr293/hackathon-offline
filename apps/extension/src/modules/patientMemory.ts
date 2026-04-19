const STORAGE_PREFIX = 'medflow_pmem_';
const MAX_ENTRIES = 20;

export type PatientMemoryEntry = {
  id: string;
  timestamp: number;
  command: string;
  intent: string;
  action: string | null;
};

const getPatientKey = (patientInfo: Record<string, string>): string | null => {
  if (patientInfo.iin) return patientInfo.iin;
  if (patientInfo.name && patientInfo.dob) return `${patientInfo.name}_${patientInfo.dob}`;
  if (patientInfo.name) return patientInfo.name;
  return null;
};

export const loadPatientMemory = async (patientInfo: Record<string, string>): Promise<PatientMemoryEntry[]> => {
  const key = getPatientKey(patientInfo);
  if (!key) return [];
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const result = await chrome.storage.local.get(storageKey);
  return (result[storageKey] as PatientMemoryEntry[]) ?? [];
};

export const savePatientMemoryEntry = async (
  patientInfo: Record<string, string>,
  entry: Omit<PatientMemoryEntry, 'id' | 'timestamp'>,
): Promise<void> => {
  const key = getPatientKey(patientInfo);
  if (!key) return;
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const existing = await loadPatientMemory(patientInfo);
  const next = [
    { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
    ...existing,
  ].slice(0, MAX_ENTRIES);
  await chrome.storage.local.set({ [storageKey]: next });
};

export const formatPatientMemoryForPrompt = (entries: PatientMemoryEntry[]): string => {
  if (entries.length === 0) return '';
  return entries
    .slice(0, 10)
    .map((e, i) => {
      const date = new Date(e.timestamp).toLocaleDateString('ru-RU');
      return `${i + 1}. [${date}] "${e.command}" → ${e.intent}${e.action ? `: ${e.action}` : ''}`;
    })
    .join('\n');
};
