export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');

const pad = (n) => String(n).padStart(2, '0');

export const timeRange = (startsAt, endsAt) => {
  const s = new Date(startsAt), e = new Date(endsAt);
  return `${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(e.getHours())}:${pad(e.getMinutes())}`;
};

export const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);

export const RU_DAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
export const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const longDate = (d = new Date()) => `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;

export const relativeTime = (iso) => {
  const diff = Date.now() - new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
};

export const statusMeta = (status) => ({
  active: { label: 'Активна', cls: 'green' },
  scheduled: { label: 'Запланирована', cls: 'blue' },
  open: { label: 'Открыта', cls: 'gray' },
  completed: { label: 'Завершена', cls: 'gray' },
  cancelled: { label: 'Отменена', cls: 'red' }
}[status] || { label: status, cls: 'gray' });
