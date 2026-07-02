import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import Layout from '../components/Layout.jsx';
import { initials, relativeTime } from '../lib/util.js';

const TYPE_META = {
  time_off: { label: 'Отгул / отпуск', cls: 'blue' },
  availability: { label: 'Доступность', cls: 'green' },
  swap: { label: 'Обмен сменами', cls: 'gray' }
};
const STATUS_META = {
  pending: { label: 'Ожидает', cls: 'amber' },
  approved: { label: 'Одобрено', cls: 'green' },
  rejected: { label: 'Отклонено', cls: 'red' }
};
const TABS = [
  { key: 'pending', label: 'Ожидают' },
  { key: 'all', label: 'Все' },
  { key: 'approved', label: 'Одобренные' },
  { key: 'rejected', label: 'Отклонённые' }
];

const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function Requests() {
  const { user } = useAuth();
  const isManager = ['owner', 'manager'].includes(user?.role);
  const [requests, setRequests] = useState(null);
  const [tab, setTab] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/requests').then((d) => setRequests(d.requests)).catch(() => setRequests([]));
  useEffect(() => { load(); }, []);

  async function review(id, status) {
    setError(''); setBusyId(id);
    try { await api.patch(`/requests/${id}/review`, { status }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  const filtered = (requests || []).filter((r) => tab === 'all' || r.status === tab);
  const pendingCount = (requests || []).filter((r) => r.status === 'pending').length;

  return (
    <Layout>
      <div className="page">
        <div className="page-head">
          <h2>Заявки</h2>
          <p>{isManager ? 'Рассматривайте заявки сотрудников на отгулы, доступность и обмен сменами.' : 'Ваши заявки и их статус.'}</p>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}{t.key === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}

        {!requests ? (
          <div className="card card-pad"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="card card-pad empty">
            {tab === 'pending' ? 'Нет заявок, ожидающих рассмотрения' : 'Заявок нет'}
          </div>
        ) : (
          <div className="request-list">
            {filtered.map((r) => {
              const type = TYPE_META[r.type] || { label: r.type, cls: 'gray' };
              const status = STATUS_META[r.status] || { label: r.status, cls: 'gray' };
              return (
                <div key={r.id} className="card request-card">
                  <div className="avatar">{initials(r.user_name)}</div>
                  <div className="request-body">
                    <div className="request-top">
                      <strong>{r.user_name}</strong>
                      <span className={`badge ${type.cls}`}>{type.label}</span>
                      <span className={`badge ${status.cls}`}>{status.label}</span>
                    </div>
                    <div className="request-dates">{fmtDate(r.starts_at)} — {fmtDate(r.ends_at)}</div>
                    {r.reason && <div className="request-reason">{r.reason}</div>}
                    <div className="request-meta">{relativeTime(r.created_at)}</div>
                  </div>
                  {isManager && r.status === 'pending' && (
                    <div className="request-actions">
                      <button className="btn primary" disabled={busyId === r.id} onClick={() => review(r.id, 'approved')}>Одобрить</button>
                      <button className="btn danger-ghost" disabled={busyId === r.id} onClick={() => review(r.id, 'rejected')}>Отклонить</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
