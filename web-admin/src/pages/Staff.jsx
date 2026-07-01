import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { initials } from '../lib/util.js';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import * as I from '../components/Icons.jsx';

const TABS = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'inactive', label: 'Неактивные' }
];
const roleLabel = { owner: 'Владелец', manager: 'Менеджер', employee: 'Сотрудник' };

export default function Staff() {
  const { user } = useAuth();
  const isManager = ['owner', 'manager'].includes(user?.role);
  const [params, setParams] = useSearchParams();
  const [staff, setStaff] = useState(null);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(params.get('new') === '1');

  const load = useCallback(() => {
    api.get('/staff').then((d) => setStaff(d.staff)).catch(() => setStaff([]));
  }, []);
  useEffect(load, [load]);

  function closeAdd() {
    setShowAdd(false);
    if (params.get('new')) { params.delete('new'); setParams(params, { replace: true }); }
  }

  const filtered = (staff || [])
    .filter((s) => tab === 'all' || s.status === tab)
    .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()) || (s.jobTitle || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <Layout onQuickAdd={() => setShowAdd(true)}>
      <div className="page">
        <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2>Сотрудники</h2>
            <p>Управление персоналом и графиками.</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="search" style={{ maxWidth: 260 }}>
              <I.Search />
              <input placeholder="Поиск сотрудника…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {isManager && <button className="btn primary" onClick={() => setShowAdd(true)}><I.UserPlus width={18} height={18} /> Добавить</button>}
          </div>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {!staff ? <div className="card card-pad"><div className="spinner" /></div> : filtered.length === 0 ? (
          <div className="card card-pad empty">Сотрудники не найдены</div>
        ) : (
          <div className="staff-grid">
            {filtered.map((s) => (
              <div key={s.id} className={`card staff-card ${s.status !== 'active' ? 'away' : ''}`}>
                <div className="pic">{initials(s.name)}</div>
                <h4>{s.name}</h4>
                <div className="role">{s.jobTitle || roleLabel[s.role]}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className={`badge ${s.status === 'active' ? 'green' : 'gray'}`}>{s.status === 'active' ? 'Активен' : 'Неактивен'}</span>
                  <span className="badge blue">{roleLabel[s.role]}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddStaffModal onClose={closeAdd} onSaved={() => { closeAdd(); load(); }} />}
    </Layout>
  );
}

function AddStaffModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', jobTitle: '', role: 'employee', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setError(''); setBusy(true);
    try {
      await api.post('/staff', form);
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Новый сотрудник" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save} disabled={busy || !form.name || !form.email}>{busy ? 'Сохранение…' : 'Добавить'}</button>
      </>}>
      {error && <div className="auth-error">{error}</div>}
      <div className="field"><label>Имя</label><input value={form.name} onChange={set('name')} placeholder="Иван Петров" /></div>
      <div className="field"><label>Email</label><input type="email" value={form.email} onChange={set('email')} placeholder="ivan@company.com" /></div>
      <div className="grid cols-2">
        <div className="field"><label>Должность</label><input value={form.jobTitle} onChange={set('jobTitle')} placeholder="Официант" /></div>
        <div className="field"><label>Роль</label>
          <select className="select" value={form.role} onChange={set('role')}>
            <option value="employee">Сотрудник</option>
            <option value="manager">Менеджер</option>
          </select>
        </div>
      </div>
      <div className="grid cols-2">
        <div className="field"><label>Телефон</label><input value={form.phone} onChange={set('phone')} placeholder="+7 999 …" /></div>
        <div className="field"><label>Временный пароль</label><input value={form.password} onChange={set('password')} placeholder="Welcome123!" /></div>
      </div>
    </Modal>
  );
}
