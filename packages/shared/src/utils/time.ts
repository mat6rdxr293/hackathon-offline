export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const padTime = (value: number): string => `${value}`.padStart(2, '0');

export const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${padTime(hours)}:${padTime(mins)}`;
};

export const timeToMinutes = (time: string): number => {
  const parts = time.split(':');
  const hours = Number(parts[0] ?? '0');
  const minutes = Number(parts[1] ?? '0');
  return hours * 60 + minutes;
};
