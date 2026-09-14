export const AGING_BUCKETS = [
  { value: 'current', label: 'Al día', min: null, max: 0 },
  { value: '1_30', label: '1–30 días', min: 1, max: 30 },
  { value: '31_60', label: '31–60 días', min: 31, max: 60 },
  { value: '61_90', label: '61–90 días', min: 61, max: 90 },
  { value: '90_plus', label: '+90 días', min: 91, max: null },
];

export function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getOverdueDays(dueDateValue, todayValue = new Date()) {
  const dueDate = parseDateOnly(dueDateValue);
  const today = parseDateOnly(todayValue);
  if (!dueDate || !today) return 0;
  const ms = today.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function getAgingBucket(dueDateValue, todayValue = new Date()) {
  const overdueDays = getOverdueDays(dueDateValue, todayValue);
  if (overdueDays <= 0) return 'current';
  if (overdueDays <= 30) return '1_30';
  if (overdueDays <= 60) return '31_60';
  if (overdueDays <= 90) return '61_90';
  return '90_plus';
}

export function getAgingMeta(bucket) {
  return AGING_BUCKETS.find((item) => item.value === bucket) || AGING_BUCKETS[0];
}
