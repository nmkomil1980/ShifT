import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, download } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { timeRange, dayKey, RU_DAYS, RU_MONTHS, statusMeta, initials } from '../lib/util.js';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import * as I from '../components/Icons.jsx';

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}

export default function Calendar() {
  const { user } = useAuth();
  const isManager = ['owner', 'manager'].includes(user?.role);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('week'); // 'week' | 'month'
  const [anchor, setAnchor] = useState(() => new Date());
  const [shifts, setShifts] = useState(null);
  const [staff, setStaff] = useState([]);
  const [defaultHours, setDefaultHours] = useState(8);
  const [modal, setModal] = useState(null); // { day } to create, { shift } to edit
  const [dropError, setDropError] = useState('');
  const [dragOverKey, setDragOverKey] = useState(null);

  // Visible range depends on the view: a Mon-start week, or a 6-week month grid.
  const weekStart = startOfWeek(anchor);
  const gridStart = view === 'week'
    ? weekStart
    : startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const dayCount = view === 'week' ? 7 : 42;
  const rangeDays = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(gridStart); d.setDate(d.getDate() + i); return d;
  });
  const rangeEnd = new Date(gridStart); rangeEnd.setDate(rangeEnd.getDate() + dayCount);
  const todayKey = dayKey(new Date());

  const load = useCallback(() => {
    setShifts(null);
    api.get(`/shifts?from=${gridStart.toISOString()}&to=${rangeEnd.toISOString()}`)
      .then((d) => setShifts(d.shifts)).catch(() => setShifts([]));
  }, [gridStart.getTime(), dayCount]);
  useEffect(load, [load]);
  useEffect(() => { api.get('/staff').then((d) => setStaff(d.staff)).catch(() => {}); }, []);
  useEffect(() => {
    api.get('/organization')
      .then((d) => setDefaultHours(d.organization.settings.defaultShiftHours || 8))
      .catch(() => {});
  }, []);

  // Open the create modal if navigated to with ?new=1.
  useEffect(() => {
    if (params.get('new') === '1') { setModal({ day: new Date() }); params.delete('new'); setParams(params, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag-and-drop (week view): drop a roster member onto a day to create a
  // shift, or drag a shift chip to another day to reschedule it.
  function onDropDay(day, e) {
    e.preventDefault();
    setDragOverKey(null);
    setDropError('');
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (payload.kind === 'staff') {
      const start = new Date(day); start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + defaultHours * 3600000);
      api.post('/shifts', { title: 'Смена', userId: payload.id, location: '', startsAt: start.toISOString(), endsAt: end.toISOString() })
        .then(load).catch((err) => setDropError(err.message));
    } else if (payload.kind === 'shift') {
      const oldStart = new Date(payload.startsAt);
      const duration = new Date(payload.endsAt) - oldStart;
      const start = new Date(day);
      start.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      if (dayKey(start) === dayKey(oldStart)) return;
      const end = new Date(start.getTime() + duration);
      api.patch(`/shifts/${payload.id}`, { startsAt: start.toISOString(), endsAt: end.toISOString() })
        .then(load).catch((err) => setDropError(err.message));
    }
  }

  function navigate(delta) {
    const d = new Date(anchor);
    if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  }
  const dragProps = (day) => (isManager && view === 'week') ? {
    onDragOver: (e) => { e.preventDefault(); setDragOverKey(dayKey(day)); },
    onDragLeave: () => setDragOverKey((k) => (k === dayKey(day) ? null : k)),
    onDrop: (e) => onDropDay(day, e),
  } : {};

  const byDay = {};
  (shifts || []).forEach((s) => { (byDay[dayKey(s.starts_at)] ||= []).push(s); });

  const periodLabel = view === 'week'
    ? `${rangeDays[0].getDate()} ${RU_MONTHS[rangeDays[0].getMonth()]} – ${rangeDays[6].getDate()} ${RU_MONTHS[rangeDays[6].getMonth()]} ${rangeDays[6].getFullYear()}`
    : `${RU_MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;

  const Chip = ({ s, compact }) => {
    const st = statusMeta(s.status);
    return (
      <div className={`shift-chip ${st.cls} ${compact ? 'compact' : ''}`} title={`${s.user_name || 'Открытая'} · ${s.title}`}
        draggable={isManager && view === 'week'}
        onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'shift', id: s.id, startsAt: s.starts_at, endsAt: s.ends_at }))}
        onClick={() => isManager && setModal({ shift: s })}>
        <b>{timeRange(s.starts_at, s.ends_at)}</b>
        {!compact && <div className="who">{s.user_name || 'Открытая'}</div>}
        {!compact && <div className="role">{s.job_title || s.title}</div>}
        {compact && <span className="who"> {s.user_name || 'Открытая'}</span>}
      </div>
    );
  };

  return (
    <Layout onQuickAdd={() => setModal({ day: new Date() })}>
      <div className="page">
        <div className="page-head"><h2>Календарь смен</h2><p>{periodLabel}</p></div>

        <div className="cal-head">
          <div className="seg">
            <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Неделя</button>
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Месяц</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="icon-btn" onClick={() => navigate(-1)}><I.ChevronLeft width={18} height={18} /></button>
            <button className="btn" onClick={() => setAnchor(new Date())}>Сегодня</button>
            <button className="icon-btn" onClick={() => navigate(1)}><I.ChevronRight width={18} height={18} /></button>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => download(`/export/shifts.csv?from=${gridStart.toISOString()}&to=${rangeEnd.toISOString()}`, 'shifts.csv').catch((e) => setDropError(e.message))}>Экспорт CSV</button>
            <button className="btn" onClick={() => download(`/export/shifts.pdf?from=${gridStart.toISOString()}&to=${rangeEnd.toISOString()}`, 'schedule.pdf').catch((e) => setDropError(e.message))}>PDF</button>
            {isManager && <button className="btn primary" onClick={() => setModal({ day: new Date() })}><I.Plus width={18} height={18} /> Новая смена</button>}
          </div>
        </div>

        {dropError && <div className="auth-error" style={{ marginBottom: 12 }}>{dropError}</div>}

        {!shifts ? <div className="card card-pad"><div className="spinner" /></div> : view === 'week' ? (
          <div className="cal-layout">
            <div className="cal-grid">
              {rangeDays.map((d) => {
                const key = dayKey(d);
                const list = (byDay[key] || []).sort((a, b) => a.starts_at < b.starts_at ? -1 : 1);
                return (
                  <div className={`cal-col ${dragOverKey === key ? 'drag-over' : ''}`} key={key} {...dragProps(d)}>
                    <div className={`cal-colhead ${key === todayKey ? 'today' : ''}`}>
                      <small>{RU_DAYS[d.getDay()]}</small><b>{d.getDate()}</b>
                    </div>
                    <div className="cal-body">
                      {list.map((s) => <Chip key={s.id} s={s} />)}
                      {isManager && (
                        <button className="qa" style={{ padding: '10px', borderStyle: 'dashed', color: 'var(--text-faint)' }} onClick={() => setModal({ day: d })}>
                          <I.Plus width={16} height={16} /> Добавить
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isManager && (
              <aside className="roster card card-pad">
                <h3 style={{ margin: '0 0 4px' }}>Свободные</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>Перетащите на день для назначения</p>
                {staff.filter((s) => s.status === 'active').map((s) => (
                  <div key={s.id} className="roster-item" draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'staff', id: s.id }))}>
                    <div className="avatar">{initials(s.name)}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                      <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>{s.jobTitle || s.role}</div>
                    </div>
                    <I.Plus width={16} height={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
                  </div>
                ))}
              </aside>
            )}
          </div>
        ) : (
          <div className="cal-month card">
            {RU_DAYS.slice(1).concat(RU_DAYS[0]).map((d) => <div className="month-dow" key={d}>{d}</div>)}
            {rangeDays.map((d) => {
              const key = dayKey(d);
              const list = (byDay[key] || []).sort((a, b) => a.starts_at < b.starts_at ? -1 : 1);
              const otherMonth = d.getMonth() !== anchor.getMonth();
              return (
                <div className={`month-cell ${otherMonth ? 'other' : ''} ${key === todayKey ? 'today' : ''}`} key={key}
                  onClick={(e) => { if (isManager && e.target.classList.contains('month-cell')) setModal({ day: d }); }}>
                  <div className="month-num">{d.getDate()}</div>
                  {list.slice(0, 3).map((s) => <Chip key={s.id} s={s} compact />)}
                  {list.length > 3 && <div className="month-more">+{list.length - 3}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <ShiftModal
          shift={modal.shift}
          day={modal.day || new Date()}
          staff={staff}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </Layout>
  );
}

function splitLocalInput(startIso, endIso) {
  const pad = (n) => String(n).padStart(2, '0');
  const parts = (iso) => {
    const d = new Date(iso);
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  };
  const s = parts(startIso), e = parts(endIso);
  return { startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time };
}
function dayAt(date, hour) { const d = new Date(date); d.setHours(hour, 0, 0, 0); return d; }

function ShiftModal({ shift, day, staff, onClose, onSaved }) {
  const editing = !!shift;
  const [form, setForm] = useState({
    title: shift?.title || 'Смена',
    userId: shift?.user_id ? String(shift.user_id) : '',
    location: shift?.location || '',
    ...splitLocalInput(shift?.starts_at || dayAt(day, 9), shift?.ends_at || dayAt(day, 17)),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setError(''); setBusy('save');
    const body = {
      title: form.title,
      userId: form.userId ? Number(form.userId) : null,
      location: form.location,
      startsAt: new Date(`${form.startDate}T${form.startTime}`).toISOString(),
      endsAt: new Date(`${form.endDate}T${form.endTime}`).toISOString(),
    };
    try {
      if (editing) await api.patch(`/shifts/${shift.id}`, body);
      else await api.post('/shifts', body);
      onSaved();
    } catch (e) { setError(e.message); setBusy(''); }
  }
  async function remove() {
    if (!confirm('Удалить смену?')) return;
    setBusy('del');
    try { await api.del(`/shifts/${shift.id}`); onSaved(); }
    catch (e) { setError(e.message); setBusy(''); }
  }

  return (
    <Modal title={editing ? 'Смена' : 'Новая смена'} onClose={onClose}
      footer={<>
        {editing && <button className="btn" style={{ color: 'var(--red-fg)', marginRight: 'auto' }} onClick={remove} disabled={!!busy}>Удалить</button>}
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save} disabled={!!busy || !form.title}>{busy === 'save' ? 'Сохранение…' : editing ? 'Сохранить' : 'Создать'}</button>
      </>}>
      {error && <div className="auth-error">{error}</div>}
      <div className="field"><label>Название</label><input value={form.title} onChange={set('title')} placeholder="Утренняя смена" /></div>
      <div className="field"><label>Сотрудник (необязательно — иначе открытая)</label>
        <select className="select" value={form.userId} onChange={set('userId')}>
          <option value="">— Открытая смена —</option>
          {staff.filter((s) => s.status === 'active').map((s) => <option key={s.id} value={s.id}>{s.name} · {s.jobTitle || s.role}</option>)}
        </select>
      </div>
      <div className="shift-time-grid">
        <div className="field"><label>Дата начала</label><input type="date" value={form.startDate} onChange={set('startDate')} /></div>
        <div className="field"><label>Время начала</label><input type="time" value={form.startTime} onChange={set('startTime')} /></div>
        <div className="field"><label>Дата окончания</label><input type="date" value={form.endDate} onChange={set('endDate')} /></div>
        <div className="field"><label>Время окончания</label><input type="time" value={form.endTime} onChange={set('endTime')} /></div>
      </div>
      <div className="field"><label>Локация</label><input value={form.location} onChange={set('location')} placeholder="Главный зал" /></div>
    </Modal>
  );
}
