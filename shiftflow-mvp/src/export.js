import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const assetsDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'assets');
const FONT = path.join(assetsDir, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(assetsDir, 'DejaVuSans-Bold.ttf');

// ---- CSV -----------------------------------------------------------------
function csvCell(value) {
  let s = value == null ? '' : String(value);
  // CSV/formula-injection guard: a leading =, +, -, @, tab or CR makes Excel/
  // Sheets treat the cell as a formula. Prefix such values with a single quote
  // so they are shown literally instead of executed.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a UTF-8 CSV string (with BOM so Excel detects the encoding). */
export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n');
}

const dt = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
};

const STATUS = { scheduled: 'Запланирована', open: 'Открыта', active: 'Активна', completed: 'Завершена', cancelled: 'Отменена' };
const ROLE = { owner: 'Владелец', manager: 'Менеджер', employee: 'Сотрудник' };

export function shiftsCsv(shifts) {
  const rows = shifts.map((s) => {
    const a = dt(s.starts_at), b = dt(s.ends_at);
    return [a.date, a.time, b.time, s.user_name || 'Открытая смена', s.job_title || s.title, s.location || '', STATUS[s.status] || s.status];
  });
  return toCsv(['Дата', 'Начало', 'Конец', 'Сотрудник', 'Роль', 'Локация', 'Статус'], rows);
}

export function staffCsv(staff) {
  const rows = staff.map((s) => [s.name, s.email, ROLE[s.role] || s.role, s.jobTitle || '', s.phone || '', s.status === 'active' ? 'Активен' : 'Неактивен']);
  return toCsv(['Имя', 'Email', 'Роль', 'Должность', 'Телефон', 'Статус'], rows);
}

// ---- PDF (schedule) ------------------------------------------------------
/** Stream a schedule PDF of the given shifts to the response. */
export function shiftsPdf(res, { orgName, from, to, shifts }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.registerFont('body', FONT);
  doc.registerFont('bold', FONT_BOLD);
  doc.pipe(res);

  doc.font('bold').fontSize(20).text('Расписание смен', { align: 'left' });
  doc.font('body').fontSize(11).fillColor('#6b7180')
    .text(`${orgName} · ${from.slice(0, 10)} – ${to.slice(0, 10)}`);
  doc.moveDown(1);

  const cols = [
    { key: 'date', label: 'Дата', w: 70 },
    { key: 'time', label: 'Время', w: 90 },
    { key: 'who', label: 'Сотрудник', w: 130 },
    { key: 'role', label: 'Роль', w: 110 },
    { key: 'status', label: 'Статус', w: 95 },
  ];
  const startX = doc.page.margins.left;
  let y = doc.y;

  const drawRow = (cells, { header = false } = {}) => {
    doc.font(header ? 'bold' : 'body').fontSize(header ? 11 : 10).fillColor(header ? '#1e2130' : '#33384a');
    let x = startX;
    if (header) {
      doc.rect(startX, y - 2, cols.reduce((s, c) => s + c.w, 0), 18).fill('#eef0ff');
      doc.fillColor('#1e2130');
    }
    cols.forEach((c) => { doc.text(cells[c.key] ?? '', x + 4, y + 2, { width: c.w - 8, ellipsis: true }); x += c.w; });
    y += 20;
    if (y > doc.page.height - 50) { doc.addPage(); y = doc.page.margins.top; }
  };

  drawRow(Object.fromEntries(cols.map((c) => [c.key, c.label])), { header: true });
  for (const s of shifts) {
    const a = dt(s.starts_at), b = dt(s.ends_at);
    drawRow({
      date: a.date, time: `${a.time}–${b.time}`,
      who: s.user_name || 'Открытая', role: s.job_title || s.title, status: STATUS[s.status] || s.status,
    });
  }
  if (!shifts.length) { doc.font('body').fontSize(11).fillColor('#9aa0ae').text('Смен за период нет.', startX, y + 6); }

  doc.end();
}
