import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { initials } from '../lib/util.js';
import Layout from '../components/Layout.jsx';

const roleLabel = { owner: 'Владелец', manager: 'Менеджер', employee: 'Сотрудник' };
const WEEKDAYS = [
  { n: 1, l: 'Пн' }, { n: 2, l: 'Вт' }, { n: 3, l: 'Ср' }, { n: 4, l: 'Чт' },
  { n: 5, l: 'Пт' }, { n: 6, l: 'Сб' }, { n: 0, l: 'Вс' }
];

export default function Settings() {
  const { user } = useAuth();
  const isManager = ['owner', 'manager'].includes(user.role);
  const isOwner = user.role === 'owner';
  const [tab, setTab] = useState(isManager ? 'company' : 'profile');

  return (
    <Layout>
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><h2>Настройки</h2><p>Управление организацией и личным профилем.</p></div>
        <div className="tabs">
          {isManager && <button className={tab === 'company' ? 'active' : ''} onClick={() => setTab('company')}>Компания</button>}
          {isOwner && <button className={tab === 'billing' ? 'active' : ''} onClick={() => setTab('billing')}>Подписка</button>}
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>Мой профиль</button>
        </div>
        {tab === 'company' && isManager ? <CompanyTab />
          : tab === 'billing' && isOwner ? <BillingTab />
          : <ProfileTab />}
      </div>
    </Layout>
  );
}

function CompanyTab() {
  const [org, setOrg] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [roleInput, setRoleInput] = useState('');

  useEffect(() => {
    api.get('/organization').then((d) => setOrg(d.organization)).catch((e) => setError(e.message));
  }, []);

  if (!org) return <div className="card card-pad"><div className="spinner" /></div>;
  const s = org.settings;
  const setS = (patch) => { setOrg({ ...org, settings: { ...s, ...patch } }); setSaved(false); };
  const toggleDay = (n) => setS({ operatingDays: s.operatingDays.includes(n) ? s.operatingDays.filter((d) => d !== n) : [...s.operatingDays, n] });

  async function save() {
    setBusy(true); setError('');
    try {
      await api.patch('/organization', { name: org.name, settings: s });
      setSaved(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="split">
      <div style={{ display: 'grid', gap: 18 }}>
        <div className="card card-pad">
          <div className="section-head"><h3>Профиль организации</h3></div>
          <div className="field"><label>Название компании</label><input value={org.name} onChange={(e) => { setOrg({ ...org, name: e.target.value }); setSaved(false); }} /></div>
          <div className="grid cols-2">
            <div className="field"><label>Отрасль</label>
              <select className="select" value={s.industry} onChange={(e) => setS({ industry: e.target.value })}>
                <option value="">Не указана</option>
                <option value="retail">Розница</option>
                <option value="horeca">Кафе / Ресторан</option>
                <option value="warehouse">Склад / Логистика</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <div className="field"><label>Язык по умолчанию</label>
              <select className="select" value={s.language} onChange={(e) => setS({ language: e.target.value })}>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head"><h3>Рабочие политики</h3></div>
          <div className="field">
            <label>Рабочие дни</label>
            <div className="day-row">
              {WEEKDAYS.map((d) => (
                <button key={d.n} type="button" className={`day ${s.operatingDays.includes(d.n) ? 'on' : ''}`} onClick={() => toggleDay(d.n)}>{d.l}</button>
              ))}
            </div>
          </div>
          <div className="grid cols-2">
            <div className="field"><label>Смена по умолчанию (ч)</label><input type="number" min="1" max="24" value={s.defaultShiftHours} onChange={(e) => setS({ defaultShiftHours: Number(e.target.value) })} /></div>
            <div className="field"><label>Порог переработки (ч/нед)</label><input type="number" min="1" value={s.overtimeThreshold} onChange={(e) => setS({ overtimeThreshold: Number(e.target.value) })} /></div>
          </div>
          <div className="field">
            <label>Роли</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={roleInput} onChange={(e) => setRoleInput(e.target.value)} placeholder="Новая роль"
                onKeyDown={(e) => { if (e.key === 'Enter' && roleInput.trim()) { setS({ roles: [...(s.roles || []), roleInput.trim()] }); setRoleInput(''); } }} />
              <button className="btn" onClick={() => { if (roleInput.trim()) { setS({ roles: [...(s.roles || []), roleInput.trim()] }); setRoleInput(''); } }}>Добавить</button>
            </div>
            <div className="chips">
              {(s.roles || []).map((r, i) => (
                <span key={i} className="chip">{r}<button onClick={() => setS({ roles: s.roles.filter((_, j) => j !== i) })}>×</button></span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        <div className="card card-pad">
          <div className="section-head"><h3>Управление</h3></div>
          <div className="toggle-row">
            <div><b>Авто-одобрение обменов</b><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Для сотрудников одной роли</div></div>
            <button className={`toggle ${s.autoApproveSwaps ? 'on' : ''}`} onClick={() => setS({ autoApproveSwaps: !s.autoApproveSwaps })} aria-label="Авто-одобрение" />
          </div>
          <div className="toggle-row">
            <div><b>Override менеджера</b><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Разрешить нарушать лимит переработки</div></div>
            <button className={`toggle ${s.managerOverrides ? 'on' : ''}`} onClick={() => setS({ managerOverrides: !s.managerOverrides })} aria-label="Override" />
          </div>
        </div>

        <div className="card card-pad">
          {error && <div className="auth-error">{error}</div>}
          {saved && <div className="auth-error" style={{ background: 'var(--green-bg)', color: 'var(--green-fg)' }}>Сохранено</div>}
          <button className="btn primary" style={{ width: '100%' }} onClick={save} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить изменения'}</button>
        </div>
      </div>
    </div>
  );
}

function Check({ light }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={light ? '#c7f9e0' : 'var(--indigo-500)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function BillingTab() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [card, setCard] = useState({ show: false, number: '', exp: '' });

  const load = () => api.get('/billing').then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="card card-pad"><div className="spinner" /></div>;
  const { billing, plans, invoices } = data;
  const money = (c) => `$${c % 100 === 0 ? c / 100 : (c / 100).toFixed(2)}`;

  async function subscribe(planId) {
    setBusy(planId);
    try { await api.post('/billing/subscribe', { plan: planId }); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(''); }
  }
  async function saveCard() {
    setBusy('card');
    try {
      await api.post('/billing/payment-method', { brand: 'CARD', last4: card.number.replace(/\D/g, '').slice(-4), exp: card.exp });
      setCard({ show: false, number: '', exp: '' });
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(''); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Подписка и оплата</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Управление тарифом, картой и историей платежей.</p>
        </div>
        <div className="current-plan">
          {billing.plan
            ? <>Текущий тариф: <b>{plans.find((p) => p.id === billing.plan)?.title}</b> · осталось {billing.daysLeft} дн.</>
            : <>Пробный период · осталось {billing.daysLeft} дн.</>}
        </div>
      </div>

      {!billing.plan && billing.daysLeft <= 7 && (
        <div className="trial-warn">
          <b>Требуется действие: пробный период заканчивается.</b> Через {billing.daysLeft} дн. доступ к планированию и аналитике будет ограничен. Выберите тариф ниже.
        </div>
      )}

      <div className="plan-grid">
        {plans.map((p) => {
          const active = billing.plan === p.id;
          return (
            <div key={p.id} className={`plan ${p.highlight ? 'hl' : ''}`}>
              {p.save > 0 && <span className="save-badge">SAVE {p.save}%</span>}
              <h4>{p.title}</h4>
              <div className="plan-sub">{p.billed}</div>
              <div className="price">{money(p.price)}<small>{p.period}</small></div>
              <div className="billed">{p.billed}</div>
              <div>
                {p.features.map((f, i) => (
                  <div className="feat" key={i}><Check light={p.highlight} /> {f}</div>
                ))}
              </div>
              <div className="plan-cta">
                <button className="btn primary" disabled={active || busy === p.id} onClick={() => subscribe(p.id)}>
                  {active ? 'Текущий тариф' : busy === p.id ? 'Оформление…' : 'Подписаться'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <div className="card card-pad">
          <div className="section-head"><h3>Способ оплаты</h3>
            {!card.show && <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setCard({ ...card, show: true })}>Добавить</button>}
          </div>
          {card.show ? (
            <div className="grid cols-2">
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Номер карты</label><input value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} placeholder="4242 4242 4242 4242" /></div>
              <div className="field"><label>Срок</label><input value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} placeholder="12/25" /></div>
              <div className="field" style={{ alignSelf: 'end' }}><button className="btn primary" onClick={saveCard} disabled={busy === 'card'}>Сохранить</button></div>
            </div>
          ) : billing.paymentMethod ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="badge gray">{billing.paymentMethod.brand}</span>
              <span>Карта •••• {billing.paymentMethod.last4}</span>
              <span style={{ color: 'var(--text-faint)' }}>{billing.paymentMethod.exp}</span>
            </div>
          ) : <div className="empty" style={{ padding: 12, textAlign: 'left' }}>Карта не добавлена</div>}
        </div>

        <div className="card card-pad">
          <div className="section-head"><h3>История платежей</h3></div>
          {invoices.length === 0 ? (
            <div className="empty">Платежей пока нет. Счета появятся после оформления подписки.</div>
          ) : (
            <table className="data">
              <thead><tr><th>Дата</th><th>Тариф</th><th>Сумма</th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}><td>{inv.createdAt.slice(0, 10)}</td><td>{plans.find((p) => p.id === inv.plan)?.title || inv.plan}</td><td>{money(inv.amountCents)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, jobTitle: user.jobTitle || '', phone: user.phone || '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setSaved(false); };

  async function save() {
    setBusy(true); setError('');
    try {
      const data = await api.patch('/me', form);
      setUser(data.user);
      setSaved(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 64, height: 64, fontSize: 22, borderRadius: '50%', background: 'var(--indigo-100)', color: 'var(--indigo-600)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{initials(user.name)}</div>
        <div>
          <h3 style={{ margin: 0 }}>{user.name}</h3>
          <div style={{ color: 'var(--text-muted)' }}>{user.email} · {roleLabel[user.role]} · {user.organizationName}</div>
        </div>
      </div>
      {error && <div className="auth-error">{error}</div>}
      {saved && <div className="auth-error" style={{ background: 'var(--green-bg)', color: 'var(--green-fg)' }}>Сохранено</div>}
      <div className="grid cols-2">
        <div className="field"><label>Имя</label><input value={form.name} onChange={set('name')} /></div>
        <div className="field"><label>Должность</label><input value={form.jobTitle} onChange={set('jobTitle')} /></div>
      </div>
      <div className="field"><label>Телефон</label><input value={form.phone} onChange={set('phone')} placeholder="+7 999 …" /></div>
      <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить изменения'}</button>
    </div>
  );
}
