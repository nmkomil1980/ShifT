import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';

const STEPS = ['Регистрация', 'Компания', 'Роли', 'Команда'];
const WEEKDAYS = [
  { n: 1, l: 'Пн' }, { n: 2, l: 'Вт' }, { n: 3, l: 'Ср' }, { n: 4, l: 'Чт' },
  { n: 5, l: 'Пт' }, { n: 6, l: 'Сб' }, { n: 0, l: 'Вс' }
];

export default function Onboarding() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [account, setAccount] = useState({ name: '', email: '', password: '', company: '' });
  const [company, setCompany] = useState({
    industry: '', language: 'ru', operatingDays: [1, 2, 3, 4, 5],
    defaultShiftHours: 8, overtimeThreshold: 40
  });
  const [roles, setRoles] = useState(['Менеджер', 'Официант', 'Повар']);
  const [roleInput, setRoleInput] = useState('');
  const [invites, setInvites] = useState([{ name: '', email: '', jobTitle: '' }]);

  const setA = (k) => (e) => setAccount({ ...account, [k]: e.target.value });
  const setC = (k) => (e) => setCompany({ ...company, [k]: e.target.value });
  const toggleDay = (n) => setCompany({
    ...company,
    operatingDays: company.operatingDays.includes(n)
      ? company.operatingDays.filter((d) => d !== n)
      : [...company.operatingDays, n]
  });

  async function submitAccount() {
    setError(''); setBusy(true);
    try {
      await register({
        name: account.name, email: account.email.trim(),
        password: account.password, company: account.company
      });
      setStep(1);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveCompany() {
    setError(''); setBusy(true);
    try {
      await api.patch('/organization', { settings: { ...company, roles } });
      setStep(2);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveRoles() {
    setError(''); setBusy(true);
    try {
      await api.patch('/organization', { settings: { roles } });
      setStep(3);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function finish() {
    setError(''); setBusy(true);
    try {
      for (const inv of invites) {
        if (inv.name.trim() && inv.email.trim()) {
          await api.post('/staff', { name: inv.name, email: inv.email.trim(), jobTitle: inv.jobTitle });
        }
      }
      navigate('/', { replace: true });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="onb-wrap">
      <header className="onb-top">
        <div className="brand"><h1>ShiftFlow</h1></div>
        <div style={{ color: 'var(--text-muted)' }}>RU · Помощь</div>
      </header>

      <div className="onb-card">
        <div className="stepper">
          {STEPS.map((label, i) => (
            <div key={label} className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <span className="dot">{i < step ? '✓' : i + 1}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}

        {step === 0 && (
          <>
            <h2>Создайте аккаунт</h2>
            <p className="sub">Начните настройку рабочего пространства компании.</p>
            <div className="field"><label>Ваше имя</label><input value={account.name} onChange={setA('name')} placeholder="Иван Директоров" /></div>
            <div className="field"><label>Электронная почта</label><input type="email" value={account.email} onChange={setA('email')} placeholder="director@company.com" /></div>
            <div className="field"><label>Пароль</label><input type="password" value={account.password} onChange={setA('password')} placeholder="Минимум 8 символов" /></div>
            <div className="field"><label>Название компании</label><input value={account.company} onChange={setA('company')} placeholder="Acme Corp" /></div>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy || !account.name || !account.email || account.password.length < 8 || !account.company} onClick={submitAccount}>
              {busy ? 'Создание…' : 'Продолжить настройку'}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Профиль компании</h2>
            <p className="sub">Базовые настройки и рабочие политики по умолчанию.</p>
            <div className="grid cols-2">
              <div className="field"><label>Отрасль</label>
                <select className="select" value={company.industry} onChange={setC('industry')}>
                  <option value="">Выберите…</option>
                  <option value="retail">Розница</option>
                  <option value="horeca">Кафе / Ресторан</option>
                  <option value="warehouse">Склад / Логистика</option>
                  <option value="other">Другое</option>
                </select>
              </div>
              <div className="field"><label>Язык</label>
                <select className="select" value={company.language} onChange={setC('language')}>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Рабочие дни</label>
              <div className="day-row">
                {WEEKDAYS.map((d) => (
                  <button key={d.n} type="button" className={`day ${company.operatingDays.includes(d.n) ? 'on' : ''}`} onClick={() => toggleDay(d.n)}>{d.l}</button>
                ))}
              </div>
            </div>
            <div className="grid cols-2">
              <div className="field"><label>Смена по умолчанию (ч)</label><input type="number" min="1" max="24" value={company.defaultShiftHours} onChange={setC('defaultShiftHours')} /></div>
              <div className="field"><label>Порог переработки (ч/нед)</label><input type="number" min="1" value={company.overtimeThreshold} onChange={setC('overtimeThreshold')} /></div>
            </div>
            <div className="btn-group" style={{ justifyContent: 'space-between' }}>
              <button className="btn" onClick={() => setStep(0)}>Назад</button>
              <button className="btn primary" disabled={busy} onClick={saveCompany}>{busy ? 'Сохранение…' : 'Далее'}</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Роли сотрудников</h2>
            <p className="sub">Добавьте должности, которые есть в вашей команде.</p>
            <div className="field">
              <label>Новая роль</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={roleInput} onChange={(e) => setRoleInput(e.target.value)} placeholder="Например, Бариста"
                  onKeyDown={(e) => { if (e.key === 'Enter' && roleInput.trim()) { setRoles([...roles, roleInput.trim()]); setRoleInput(''); } }} />
                <button className="btn" onClick={() => { if (roleInput.trim()) { setRoles([...roles, roleInput.trim()]); setRoleInput(''); } }}>Добавить</button>
              </div>
            </div>
            <div className="chips">
              {roles.map((r, i) => (
                <span key={i} className="chip">{r}<button onClick={() => setRoles(roles.filter((_, j) => j !== i))}>×</button></span>
              ))}
            </div>
            <div className="btn-group" style={{ justifyContent: 'space-between', marginTop: 20 }}>
              <button className="btn" onClick={() => setStep(1)}>Назад</button>
              <button className="btn primary" disabled={busy} onClick={saveRoles}>{busy ? 'Сохранение…' : 'Далее'}</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Пригласите команду</h2>
            <p className="sub">Добавьте сотрудников — они появятся в системе. Можно пропустить.</p>
            {invites.map((inv, i) => (
              <div className="grid" key={i} style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="Имя" value={inv.name} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <input placeholder="Email" value={inv.email} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                <input placeholder="Должность" value={inv.jobTitle} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, jobTitle: e.target.value } : x))} />
              </div>
            ))}
            <button className="link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setInvites([...invites, { name: '', email: '', jobTitle: '' }])}>+ Добавить ещё</button>
            <div className="btn-group" style={{ justifyContent: 'space-between', marginTop: 20 }}>
              <button className="btn" onClick={() => setStep(2)}>Назад</button>
              <button className="btn primary" disabled={busy} onClick={finish}>{busy ? 'Завершение…' : 'Завершить и войти'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
