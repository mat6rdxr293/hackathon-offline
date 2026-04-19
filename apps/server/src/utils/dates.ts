import dayjs from 'dayjs';

export const isWeekend = (date: dayjs.Dayjs): boolean => {
  const day = date.day();
  return day === 0 || day === 6;
};
