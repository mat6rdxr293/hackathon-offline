import dayjs from 'dayjs';

import {
  minutesToTime,
  scheduleGenerationResultSchema,
  timeToMinutes,
  translateByLocale,
  type AppLocale,
  type BusySlot,
  type ScheduleGenerationInput,
  type ScheduleGenerationResult,
  type ScheduledItem,
} from '@hackathon/shared';

import { isWeekend } from '../../utils/dates';

type SessionTask = {
  procedureId: string;
  procedureTitle: string;
  specialistId: string;
  durationMinutes: number;
  round: number;
};

type TimeRange = {
  start: number;
  end: number;
};

const expandProcedureTasks = (input: ScheduleGenerationInput): SessionTask[] => {
  const maxSessions = Math.max(...input.procedures.map((item) => item.sessions));
  const tasks: SessionTask[] = [];

  for (let round = 0; round < maxSessions; round += 1) {
    for (const procedure of input.procedures) {
      if (round < procedure.sessions) {
        tasks.push({
          procedureId: procedure.id,
          procedureTitle: procedure.title,
          specialistId: procedure.specialistId,
          durationMinutes: procedure.durationMinutes,
          round,
        });
      }
    }
  }

  return tasks;
};

const workingDates = (startDate: string, days: number): string[] => {
  const result: string[] = [];
  let cursor = dayjs(startDate);

  while (result.length < days) {
    if (!isWeekend(cursor)) {
      result.push(cursor.format('YYYY-MM-DD'));
    }
    cursor = cursor.add(1, 'day');
  }

  return result;
};

const overlaps = (left: TimeRange, right: TimeRange): boolean => left.start < right.end && right.start < left.end;

const groupBusySlots = (busySlots: BusySlot[]): Map<string, TimeRange[]> => {
  const map = new Map<string, TimeRange[]>();

  for (const slot of busySlots) {
    const key = `${slot.specialistId}::${slot.date}`;
    const ranges = map.get(key) ?? [];
    ranges.push({ start: timeToMinutes(slot.start), end: timeToMinutes(slot.end) });
    map.set(key, ranges);
  }

  return map;
};

const getAvailability = (input: ScheduleGenerationInput, specialistId: string): { start: number; end: number } | null => {
  const entry = input.specialistAvailability.find((item) => item.specialistId === specialistId);
  if (!entry) {
    return null;
  }
  return { start: timeToMinutes(entry.workStart), end: timeToMinutes(entry.workEnd) };
};

export const generateSchedule = (input: ScheduleGenerationInput, locale: AppLocale = 'ru'): ScheduleGenerationResult => {
  const days = workingDates(input.startDate, input.workingDays || 9);
  const tasks = expandProcedureTasks(input);
  const busyBySpecialistDay = groupBusySlots(input.busySlots);
  const scheduled: ScheduledItem[] = [];
  const unplaced: Array<{ procedureId: string; reason: string }> = [];

  for (const task of tasks) {
    const availability = getAvailability(input, task.specialistId);

    if (!availability) {
      unplaced.push({
        procedureId: task.procedureId,
        reason: translateByLocale(locale, 'schedule.noAvailability', { specialistId: task.specialistId }),
      });
      continue;
    }

    let placed = false;

    for (const date of days) {
      const key = `${task.specialistId}::${date}`;
      const occupied = busyBySpecialistDay.get(key) ?? [];

      for (let start = availability.start; start + task.durationMinutes <= availability.end; start += task.durationMinutes) {
        const candidate: TimeRange = { start, end: start + task.durationMinutes };
        if (occupied.some((slot) => overlaps(slot, candidate))) {
          continue;
        }

        occupied.push(candidate);
        busyBySpecialistDay.set(key, occupied);

        scheduled.push({
          procedureId: task.procedureId,
          procedureTitle: task.procedureTitle,
          specialistId: task.specialistId,
          date,
          start: minutesToTime(candidate.start),
          end: minutesToTime(candidate.end),
        });
        placed = true;
        break;
      }

      if (placed) {
        break;
      }
    }

    if (!placed) {
      unplaced.push({
        procedureId: task.procedureId,
        reason: translateByLocale(locale, 'schedule.slotNotFound', {
          procedureTitle: task.procedureTitle,
          session: task.round + 1,
        }),
      });
    }
  }

  const result: ScheduleGenerationResult = {
    items: scheduled.sort((left, right) => `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`)),
    unplaced,
    explanation:
      unplaced.length === 0
        ? translateByLocale(locale, 'schedule.fullSuccess', { days: days.length })
        : translateByLocale(locale, 'schedule.partialSuccess', { count: unplaced.length }),
  };

  return scheduleGenerationResultSchema.parse(result);
};
