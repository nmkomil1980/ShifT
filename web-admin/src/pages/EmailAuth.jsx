import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api, setToken } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

function Shell({ title, sub, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="14" height="5" rx="1.5" transform="rotate(-12 10 8)" />
            <rect x="6" y="13" width="14" height="5" rx="1.5" transform="rotate(-12 13 15)" />
          </svg>
        </div>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await api.post('/auth/forgot-password', { email: email.trim() }); } catch { /* ignore */ }
    setBusy(false);
    setSent(true);
  }

  return (
    <Shell title="Сброс пароля" sub="Введите почту — пришлём ссылку для смены пароля.">
      {sent ? (
        <>
          <div className="auth-error" style={{ background: 'var(--green-bg)', color: 'var(--green-fg)' }}>
            Если аккаунт с таким адресом существует, письмо со ссылкой отправлено.
          </div>
          <p className="auth-switch"><Link className="link" to="/login">Вернуться ко входу</Link></p>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="field">
            <label>Электронная почта</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
          </div>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy || !email}>{busy ? 'Отправка…' : 'Отправить ссылку'}</button>
          <p className="auth-switch"><Link className="link" to="/login">Вернуться ко входу</Link></p>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Пароль должен быть не короче 8 символов');
    if (password !== confirm) return setError('Пароли не совпадают');
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (!token) return <Shell title="Сброс пароля"><div className="auth-error">Ссылка недействительна.</div></Shell>;

  return (
    <Shell title="Новый пароль" sub="Задайте новый пароль для входа.">
      {done ? (
        <>
          <div className="auth-error" style={{ background: 'var(--green-bg)', color: 'var(--green-fg)' }}>Пароль обновлён.</div>
          <p className="auth-switch"><Link className="link" to="/login">Войти</Link></p>
        </>
      ) : (
        <form onSubmit={submit}>
          {error && <div className="auth-error">{error}</div>}
          <div className="field"><label>Новый пароль</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 8 символов" required /></div>
          <div className="field"><label>Повторите пароль</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить пароль'}</button>
        </form>
      )}
    </Shell>
  );
}

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Пароль должен быть не короче 8 символов');
    if (password !== confirm) return setError('Пароли не совпадают');
    setBusy(true);
    try {
      const data = await api.post('/auth/accept-invite', { token, password });
      setToken(data.token);
      setUser(data.user);
      navigate('/', { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  }

  if (!token) return <Shell title="Приглашение"><div className="auth-error">Приглашение недействительно.</div></Shell>;

  return (
    <Shell title="Добро пожаловать в команду" sub="Задайте пароль, чтобы активировать аккаунт.">
      <form onSubmit={submit}>
        {error && <div className="auth-error">{error}</div>}
        <div className="field"><label>Пароль</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 8 символов" required /></div>
        <div className="field"><label>Повторите пароль</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Активация…' : 'Принять приглашение'}</button>
      </form>
    </Shell>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, refresh } = useAuth();
  const [state, setState] = useState('pending'); // pending | ok | error

  useEffect(() => {
    if (!token) { setState('error'); return; }
    api.post('/auth/verify-email', { token })
      .then(() => { setState('ok'); if (user) refresh().catch(() => {}); })
      .catch(() => setState('error'));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Shell title="Подтверждение почты">
      {state === 'pending' && <div className="spinner" style={{ margin: '0 auto' }} />}
      {state === 'ok' && (
        <>
          <div className="auth-error" style={{ background: 'var(--green-bg)', color: 'var(--green-fg)' }}>Почта подтверждена. Спасибо!</div>
          <p className="auth-switch"><Link className="link" to="/">На главную</Link></p>
        </>
      )}
      {state === 'error' && (
        <>
          <div className="auth-error">Ссылка недействительна или устарела.</div>
          <p className="auth-switch"><Link className="link" to="/login">Ко входу</Link></p>
        </>
      )}
    </Shell>
  );
}
