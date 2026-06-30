import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { relativeTime } from '../lib/util.js';
import { pushSupported, currentPushState, enablePush, disablePush } from '../lib/push.js';
import Layout from '../components/Layout.jsx';
import * as I from '../components/Icons.jsx';

function PushToggle() {
  const [state, setState] = useState('disabled');
  const [busy, setBusy] = useState(false);

  useEffect(() => { currentPushState().then(setState); }, []);

  if (!pushSupported() || state === 'unsupported') return null;

  async function toggle() {
    setBusy(true);
    try {
      setState(state === 'enabled' ? await disablePush() : await enablePush());
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const denied = state === 'denied';
  return (
    <button className={`btn sm ${state === 'enabled' ? 'primary' : ''}`} disabled={busy || denied} onClick={toggle} title={denied ? 'Уведомления заблокированы в браузере' : ''}>
      <I.Bell width={15} height={15} />
      {denied ? 'Заблокировано' : state === 'enabled' ? 'Push включены' : busy ? '…' : 'Включить push'}
    </button>
  );
}

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'leave', label: 'Отгулы' },
  { key: 'swap', label: 'Обмены' },
  { key: 'availability', label: 'Доступность' }
];
const statusBadge = { pending: 'blue', approved: 'green', rejected: 'red' };
const statusText = { pending: 'Ожидает', approved: 'Одобрено', rejected: 'Отклонено' };

export default function Notifications() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.get('/notifications').then((d) => setItems(d.notifications)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function review(id, status) {
    setBusyId(id);
    try { await api.patch(`/requests/${id}/review`, { status }); load(); }
    catch (e) { alert(e.message); } finally { setBusyId(null); }
  }

  const filtered = (items || []).filter((n) => filter === 'all' || n.category === filter);

  return (
    <Layout>
      <div className="page">
        <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div><h2>Центр уведомлений</h2><p>Заявки команды и системные события.</p></div>
          <PushToggle />
        </div>

        <div className="tabs" style={{ gap: 12, border: 'none', marginBottom: 18 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`btn sm ${filter === f.key ? 'primary' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>

        {!items ? <div className="card card-pad"><div className="spinner" /></div> : filtered.length === 0 ? (
          <div className="card card-pad empty">Уведомлений нет</div>
        ) : (
          <div className="card card-pad">
            {filtered.map((n) => (
              <div className="feed-item" key={n.id}>
                <div className="feed-icon"><I.Bell width={18} height={18} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <b>{n.title}</b>
                    <span className="time">{relativeTime(n.createdAt)}</span>
                  </div>
                  <div className="body" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{n.body}</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`badge ${statusBadge[n.status]}`}>{statusText[n.status]}</span>
                    {n.actionable && (
                      <>
                        <button className="btn sm primary" disabled={busyId === n.id} onClick={() => review(n.id, 'approved')}><I.Check width={15} height={15} /> Одобрить</button>
                        <button className="btn sm" disabled={busyId === n.id} onClick={() => review(n.id, 'rejected')}><I.X width={15} height={15} /> Отклонить</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
