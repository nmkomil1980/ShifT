import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@shiftflow.local');
  const [password, setPassword] = useState('Demo123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="14" height="5" rx="1.5" transform="rotate(-12 10 8)" />
            <rect x="6" y="13" width="14" height="5" rx="1.5" transform="rotate(-12 13 15)" />
          </svg>
        </div>
        <h2>Вход в систему</h2>
        <p className="sub">Добро пожаловать в ShiftFlow</p>

        {error && <div className="auth-error">{error}</div>}

        <div className="field">
          <label htmlFor="email">Электронная почта</label>
          <input id="email" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
        </div>
        <div className="field">
          <label htmlFor="password">
            Пароль <a className="link" href="#" onClick={(e) => e.preventDefault()}>Забыли пароль?</a>
          </label>
          <input id="password" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </button>

        <p className="auth-switch">
          Нет аккаунта? <a className="link" href="/register" onClick={(e) => { e.preventDefault(); navigate('/register'); }}>Зарегистрировать компанию</a>
        </p>
      </form>
    </div>
  );
}
