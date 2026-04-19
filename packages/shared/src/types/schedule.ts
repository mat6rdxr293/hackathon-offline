export type ProcedureType = 'lfk' | 'massage' | 'physio';

export type ProcedureInput = {
  id: string;
  type: ProcedureType;
  title: string;
  specialistId: string;
  durationMinutes: number;
  sessions: number;
};

export type SpecialistAvailability = {
  specialistId: string;
  workStart: string;
  workEnd: string;
};

export type BusySlot = {
  specialistId: string;
  date: string;
  start: string;
  end: string;
};

export type ScheduledItem = {
  procedureId: string;
  procedureTitle: string;
  specialistId: string;
  room?: string;
  date: string;
  start: string;
  end: string;
};

export type ScheduleGenerationInput = {
  startDate: string;
  procedures: ProcedureInput[];
  specialistAvailability: SpecialistAvailability[];
  busySlots: BusySlot[];
  workingDays: number;
  workingDates?: string[];
};

export type ScheduleGenerationResult = {
  items: ScheduledItem[];
  unplaced: Array<{
    procedureId: string;
    reason: string;
  }>;
  explanation: string;
};
