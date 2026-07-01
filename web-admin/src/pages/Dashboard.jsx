import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { initials, timeRange, longDate, relativeTime, statusMeta } from '../lib/util.js';
import Layout from '../components/Layout.jsx';
import * as I from '../components/Icons.jsx';

const statCards = [
  { key: 'activeToday', label: 'Активны сегодня', icon: I.Clock },
  { key: 'staff', label: 'Всего сотрудников', icon: I.Staff },
  { key: 'pending', label: 'Заявки', icon: I.Bell },
  { key: 'openShifts', label: 'Открытые смены', icon: I.Calendar }
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <Layout onQuickAdd={() => navigate('/calendar?new=1')}>
      <div className="page">
        <div className="page-head">
          <h2>Панель управления</h2>
          <p>Обзор текущей ситуации на сегодня, {longDate()}.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {!data ? (
          <div className="card card-pad"><div className="spinner" /></div>
        ) : (
          <>
            <div className="grid cols-4" style={{ marginBottom: 18 }}>
              {statCards.map(({ key, label, icon: Icon }) => (
                <div key={key} className="card stat">
                  <div className="label">{label} <span className="stat-icon"><Icon width={18} height={18} /></span></div>
                  <div className="value">{data.stats[key] ?? 0}</div>
                </div>
              ))}
            </div>

            <div className="split">
              <div className="card card-pad">
                <div className="section-head">
                  <h3>Расписание на сегодня</h3>
                  <a className="link" onClick={() => navigate('/calendar')} style={{ cursor: 'pointer' }}>Смотреть всё →</a>
                </div>
                {data.shifts.length === 0 ? (
                  <div className="empty">На сегодня смен нет</div>
                ) : (
                  <table className="data">
                    <thead>
                      <tr><th>Сотрудник</th><th>Роль</th><th>Время</th><th>Статус</th></tr>
                    </thead>
                    <tbody>
                      {data.shifts.map((s) => {
                        const st = statusMeta(s.status);
                        return (
                          <tr key={s.id} className={`row-accent ${st.cls}`}>
                            <td><div className="cell-user"><div className="avatar">{initials(s.user_name || '—')}</div>{s.user_name || 'Открытая смена'}</div></td>
                            <td>{s.job_title || '—'}</td>
                            <td>{timeRange(s.starts_at, s.ends_at)}</td>
                            <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'grid', gap: 18 }}>
                <div className="card card-pad">
                  <div className="section-head"><h3>Быстрые действия</h3></div>
                  <div className="qa-grid">
                    <button className="qa" onClick={() => navigate('/calendar?new=1')}><I.Plus /> Добавить смену</button>
                    <button className="qa" onClick={() => navigate('/staff?new=1')}><I.UserPlus /> Добавить сотрудника</button>
                    <button className="qa qa-wide" onClick={() => navigate('/notifications')}><I.Swap /> Заявки на обмен</button>
                  </div>
                </div>

                <div className="card card-pad">
                  <div className="section-head"><h3>Активность</h3></div>
                  {data.activity.length === 0 ? (
                    <div className="empty">Пока пусто</div>
                  ) : data.activity.map((a) => (
                    <div className="feed-item" key={a.id}>
                      <div className="feed-icon"><I.Bell width={18} height={18} /></div>
                      <div>
                        <div className="body"><b>{a.user_name || 'Система'}</b> — {a.action} ({a.entity_type})</div>
                        <div className="time">{relativeTime(a.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
