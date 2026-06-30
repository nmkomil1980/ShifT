import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [shifts, setShifts] = useState(null);
  const [staff, setStaff] = useState([]);
  const [defaultHours, setDefaultHours] = useState(8);
  const [showAdd, setShowAdd] = useState(params.get('new') === '1');
  const [addDay, setAddDay] = useState(null);
  const [dropError, setDropError] = useState('');
  const [dragOverKey, setDragOverKey] = useState(null);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const todayKey = dayKey(new Date());

  const load = useCallback(() => {
    setShifts(null);
    api.get(`/shifts?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`)
      .then((d) => setShifts(d.shifts)).catch(() => setShifts([]));
  }, [weekStart.getTime()]);
  useEffect(load, [load]);
  useEffect(() => { api.get('/staff').then((d) => setStaff(d.staff)).catch(() => {}); }, []);
  useEffect(() => {
    api.get('/organization')
      .then((d) => setDefaultHours(d.organization.settings.defaultShiftHours || 8))
      .catch(() => {});
  }, []);

  // Drag-and-drop: drop a roster member onto a day to create a shift, or drag an
  // existing shift chip to another day to reschedule it (keeping time of day).
  function onDropDay(day, e) {
    e.preventDefault();
    setDragOverKey(null);
    setDropError('');
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }

    if (payload.kind === 'staff') {
      const start = new Date(day); start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + defaultHours * 3600000);
      api.post('/shifts', {
        title: 'Смена', userId: payload.id, location: '',
        startsAt: start.toISOString(), endsAt: end.toISOString()
      }).then(load).catch((err) => setDropError(err.message));
    } else if (payload.kind === 'shift') {
      const oldStart = new Date(payload.startsAt);
      const duration = new Date(payload.endsAt) - oldStart;
      const start = new Date(day);
      start.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      const end = new Date(start.getTime() + duration);
      if (dayKey(start) === dayKey(oldStart)) return;
      api.patch(`/shifts/${payload.id}`, {
        startsAt: start.toISOString(), endsAt: end.toISOString()
      }).then(load).catch((err) => setDropError(err.message));
    }
  }

  function closeAdd() {
    setShowAdd(false); setAddDay(null);
    if (params.get('new')) { params.delete('new'); setParams(params, { replace: true }); }
  }
  function openAdd(day) { setAddDay(day); setShowAdd(true); }
  function shiftWeek(delta) { const d = new Date(weekStart); d.setDate(d.getDate() + delta * 7); setWeekStart(d); }

  const byDay = {};
  (shifts || []).forEach((s) => { (byDay[dayKey(s.starts_at)] ||= []).push(s); });

  return (
    <Layout onQuickAdd={() => openAdd(new Date())}>
      <div className="page">
        <div className="page-head"><h2>Календарь смен</h2>
          <p>{weekStart.getDate()} {RU_MONTHS[weekStart.getMonth()]} – {days[6].getDate()} {RU_MONTHS[days[6].getMonth()]} {days[6].getFullYear()}</p>
        </div>

        <div className="cal-head">
          <div className="seg">
            <button>День</button><button className="active">Неделя</button><button>Месяц</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="icon-btn" onClick={() => shiftWeek(-1)}><I.ChevronLeft width={18} height={18} /></button>
            <button className="btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>Сегодня</button>
            <button className="icon-btn" onClick={() => shiftWeek(1)}><I.ChevronRight width={18} height={18} /></button>
          </div>
          {isManager && <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => openAdd(new Date())}><I.Plus width={18} height={18} /> Новая смена</button>}
        </div>

        {dropError && <div className="auth-error" style={{ marginBottom: 12 }}>{dropError}</div>}
        {!shifts ? <div className="card card-pad"><div className="spinner" /></div> : (
          <div className="cal-layout">
          <div className="cal-grid">
            {days.map((d) => {
              const key = dayKey(d);
              const list = byDay[key] || [];
              return (
                <div className={`cal-col ${dragOverKey === key ? 'drag-over' : ''}`} key={key}
                  onDragOver={isManager ? (e) => { e.preventDefault(); setDragOverKey(key); } : undefined}
                  onDragLeave={isManager ? () => setDragOverKey((k) => (k === key ? null : k)) : undefined}
                  onDrop={isManager ? (e) => onDropDay(d, e) : undefined}>
                  <div className={`cal-colhead ${key === todayKey ? 'today' : ''}`}>
                    <small>{RU_DAYS[d.getDay()]}</small><b>{d.getDate()}</b>
                  </div>
                  <div className="cal-body">
                    {list.map((s) => {
                      const st = statusMeta(s.status);
                      return (
                        <div key={s.id} className={`shift-chip ${st.cls}`} title={s.title}
                          draggable={isManager}
                          onDragStart={(e) => e.dataTransfer.setData('application/json',
                            JSON.stringify({ kind: 'shift', id: s.id, startsAt: s.starts_at, endsAt: s.ends_at }))}>
                          <b>{timeRange(s.starts_at, s.ends_at)}</b>
                          <div className="who">{s.user_name || 'Открытая'}</div>
                          <div className="role">{s.job_title || s.title}</div>
                        </div>
                      );
                    })}
                    {isManager && (
                      <button className="qa" style={{ padding: '10px', borderStyle: 'dashed', color: 'var(--text-faint)' }} onClick={() => openAdd(d)}>
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
                  onDragStart={(e) => e.dataTransfer.setData('application/json',
                    JSON.stringify({ kind: 'staff', id: s.id }))}>
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
        )}
      </div>

      {showAdd && <AddShiftModal day={addDay || new Date()} staff={staff} onClose={closeAdd} onSaved={() => { closeAdd(); load(); }} />}
    </Layout>
  );
}

function toLocalInput(date, hour) {
  const d = new Date(date); d.setHours(hour, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AddShiftModal({ day, staff, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: 'Смена', userId: '', location: '',
    startsAt: toLocalInput(day, 9), endsAt: toLocalInput(day, 17), notes: ''
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setError(''); setBusy(true);
    try {
      await api.post('/shifts', {
        ...form,
        userId: form.userId ? Number(form.userId) : null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString()
      });
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Новая смена" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save} disabled={busy || !form.title}>{busy ? 'Сохранение…' : 'Создать'}</button>
      </>}>
      {error && <div className="auth-error">{error}</div>}
      <div className="field"><label>Название</label><input value={form.title} onChange={set('title')} placeholder="Утренняя смена" /></div>
      <div className="field"><label>Сотрудник (необязательно — иначе открытая)</label>
        <select className="select" value={form.userId} onChange={set('userId')}>
          <option value="">— Открытая смена —</option>
          {staff.filter((s) => s.status === 'active').map((s) => <option key={s.id} value={s.id}>{s.name} · {s.jobTitle || s.role}</option>)}
        </select>
      </div>
      <div className="grid cols-2">
        <div className="field"><label>Начало</label><input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} /></div>
        <div className="field"><label>Окончание</label><input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} /></div>
      </div>
      <div className="field"><label>Локация</label><input value={form.location} onChange={set('location')} placeholder="Главный зал" /></div>
    </Modal>
  );
}
