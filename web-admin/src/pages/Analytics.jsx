import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { RU_DAYS } from '../lib/util.js';
import Layout from '../components/Layout.jsx';

const DONUT_COLORS = ['#4f46e5', '#15935a', '#c7cad8', '#d98a00', '#d6455a', '#3f51c5'];

export default function Analytics() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/analytics').then(setData).catch(() => setData({ days: [], roles: [] })); }, []);

  if (!data) return <Layout><div className="page"><div className="card card-pad"><div className="spinner" /></div></div></Layout>;

  const totalHours = data.days.reduce((s, d) => s + (d.hours || 0), 0);
  const totalShifts = data.days.reduce((s, d) => s + (d.shifts || 0), 0);
  const avgPeople = data.days.length ? Math.round(data.days.reduce((s, d) => s + (d.people || 0), 0) / data.days.length) : 0;
  const totalStaff = data.roles.reduce((s, r) => s + r.count, 0);

  return (
    <Layout>
      <div className="page">
        <div className="page-head"><h2>Аналитика</h2><p>Сводка по сменам и нагрузке за последние две недели.</p></div>

        <div className="grid cols-4" style={{ marginBottom: 18 }}>
          <StatBox label="Всего часов" value={totalHours.toFixed(0)} hint="за период" />
          <StatBox label="Смен" value={totalShifts} hint="запланировано" />
          <StatBox label="Среднее покрытие" value={avgPeople} hint="чел./день" />
          <StatBox label="Сотрудников" value={totalStaff} hint="активных ролей" />
        </div>

        <div className="split">
          <div className="card card-pad">
            <div className="section-head"><h3>Отработанные часы по дням</h3></div>
            <HoursChart days={data.days} />
          </div>

          <div className="card card-pad">
            <div className="section-head"><h3>Смены по ролям</h3></div>
            <Donut roles={data.roles} total={totalStaff} />
          </div>
        </div>
      </div>
    </Layout>
  );
}

const StatBox = ({ label, value, hint }) => (
  <div className="card stat">
    <div className="label">{label}</div>
    <div className="value">{value}</div>
    <div className="trend" style={{ color: 'var(--text-faint)', marginTop: 4 }}>{hint}</div>
  </div>
);

function HoursChart({ days }) {
  if (!days.length) return <div className="empty">Недостаточно данных</div>;
  const W = 640, H = 260, pad = 36;
  const max = Math.max(...days.map((d) => d.hours || 0), 1);
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(days.length - 1, 1);
  const y = (v) => H - pad - ((v || 0) / max) * (H - pad * 2);
  const line = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.hours)}`).join(' ');
  const area = `${line} L${x(days.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="График часов">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={pad} x2={W - pad} y1={pad + t * (H - pad * 2)} y2={pad + t * (H - pad * 2)} stroke="#e8eaf1" />
      ))}
      <path d={area} fill="url(#g)" />
      <path d={line} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" />
      {days.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.hours)} r="3.5" fill="#fff" stroke="#4f46e5" strokeWidth="2" />
          <text x={x(i)} y={H - pad + 18} textAnchor="middle" fontSize="11" fill="#9aa0ae">
            {RU_DAYS[new Date(d.day).getDay()]}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Donut({ roles, total }) {
  if (!roles.length) return <div className="empty">Нет данных</div>;
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div>
      <svg viewBox="0 0 200 180" width="100%" height="200">
        <g transform="translate(100,90)">
          {roles.map((r, i) => {
            const frac = r.count / total;
            const dash = frac * C;
            const seg = (
              <circle key={i} r={R} fill="none" stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="22"
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} transform="rotate(-90)" />
            );
            offset += dash;
            return seg;
          })}
          <text textAnchor="middle" dy="6" fontSize="22" fontWeight="800" fill="#1e2130">{total}</text>
        </g>
      </svg>
      <div style={{ marginTop: 12 }}>
        {roles.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              {r.role}
            </span>
            <b>{Math.round((r.count / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}
