import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { initials } from '../lib/util.js';
import * as I from './Icons.jsx';

const nav = [
  { to: '/', label: 'Панель', icon: I.Dashboard, end: true },
  { to: '/staff', label: 'Сотрудники', icon: I.Staff },
  { to: '/calendar', label: 'Календарь', icon: I.Calendar },
  { to: '/analytics', label: 'Аналитика', icon: I.Analytics },
  { to: '/notifications', label: 'Уведомления', icon: I.Bell }
];

export default function Layout({ children, onQuickAdd }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>ShiftFlow</h1>
          <span>Premium Management</span>
        </div>
        <button className="sidebar-cta" onClick={() => navigate('/calendar?new=1')}>
          <I.Plus width={18} height={18} /> Новая смена
        </button>
        <nav className="nav">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/settings"><I.Settings /> Настройки</NavLink>
          <a onClick={logout} style={{ cursor: 'pointer' }}><I.Logout /> Выйти</a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="search">
            <I.Search />
            <input placeholder="Поиск…" aria-label="Поиск" />
          </div>
          <div className="topbar-spacer" />
          <button className="quick-add" onClick={onQuickAdd}>
            <I.Plus width={18} height={18} /> Быстрое добавление
          </button>
          <NavLink to="/notifications" className="icon-btn" aria-label="Уведомления">
            <I.Bell width={20} height={20} /><span className="dot" />
          </NavLink>
          <button className="icon-btn" aria-label="Помощь"><I.Help width={20} height={20} /></button>
          <div className="avatar" title={user?.name}>{initials(user?.name)}</div>
        </header>
        {children}
      </div>
    </div>
  );
}
