import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import Select, { TimeSelect } from '../components/Select.jsx';

const INDUSTRIES = [
  { value: '', label: 'Выберите…' },
  { value: 'retail', label: 'Розница' },
  { value: 'horeca', label: 'Кафе / Ресторан' },
  { value: 'warehouse', label: 'Склад / Логистика' },
  { value: 'other', label: 'Другое' }
];
const LANGUAGES = [{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }];

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
    openTime: '09:00', closeTime: '18:00', overtimeThreshold: 40
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
    // Try every invite: one failure (e.g. an email that already exists) must
    // not block the rest or leave onboarding stuck. Successfully created rows
    // are removed so a retry only re-sends the failed ones.
    const failed = [];
    const remaining = [];
    for (const inv of invites) {
      if (!inv.name.trim() || !inv.email.trim()) continue;
      try {
        await api.post('/staff', { name: inv.name, email: inv.email.trim(), jobTitle: inv.jobTitle });
      } catch (e) {
        failed.push(`${inv.email.trim()}: ${e.message}`);
        remaining.push(inv);
      }
    }
    setBusy(false);
    if (failed.length) {
      setInvites(remaining);
      setError(`Не удалось пригласить — ${failed.join('; ')}. Исправьте или очистите строки и попробуйте снова.`);
    } else {
      navigate('/', { replace: true });
    }
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
                <Select value={company.industry} onChange={(v) => setCompany({ ...company, industry: v })} options={INDUSTRIES} />
              </div>
              <div className="field"><label>Язык</label>
                <Select value={company.language} onChange={(v) => setCompany({ ...company, language: v })} options={LANGUAGES} />
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
            <div className="field">
              <label>Часы работы заведения</label>
              <div className="hours-row">
                <TimeSelect value={company.openTime} onChange={(v) => setCompany({ ...company, openTime: v })} />
                <span className="hours-sep">—</span>
                <TimeSelect value={company.closeTime} onChange={(v) => setCompany({ ...company, closeTime: v })} />
              </div>
            </div>
            <div className="field"><label>Порог переработки (ч/нед)</label><input type="number" min="1" value={company.overtimeThreshold} onChange={setC('overtimeThreshold')} /></div>
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
              <div className="invite-row" key={i}>
                <input className="invite-input" placeholder="Имя" value={inv.name} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <input className="invite-input" placeholder="Email" value={inv.email} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                <input className="invite-input" placeholder="Должность" value={inv.jobTitle} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, jobTitle: e.target.value } : x))} />
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
