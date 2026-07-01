import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { initials } from '../lib/util.js';
import * as I from './Icons.jsx';

const nav = [
  { to: '/', key: 'nav.dashboard', icon: I.Dashboard, end: true },
  { to: '/staff', key: 'nav.staff', icon: I.Staff },
  { to: '/calendar', key: 'nav.calendar', icon: I.Calendar },
  { to: '/analytics', key: 'nav.analytics', icon: I.Analytics },
  { to: '/notifications', key: 'nav.notifications', icon: I.Bell }
];

export default function Layout({ children, onQuickAdd }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>ShiftFlow</h1>
          <span>Premium Management</span>
        </div>
        <button className="sidebar-cta" onClick={() => navigate('/calendar?new=1')}>
          <I.Plus width={18} height={18} /> {t('action.newShift')}
        </button>
        <nav className="nav">
          {nav.map(({ to, key, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon /> {t(key)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/settings"><I.Settings /> {t('nav.settings')}</NavLink>
          <a onClick={logout} style={{ cursor: 'pointer' }}><I.Logout /> {t('nav.logout')}</a>
          <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('lang.label')}>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="search">
            <I.Search />
            <input placeholder={t('search')} aria-label={t('search')} />
          </div>
          <div className="topbar-spacer" />
          <button className="quick-add" onClick={onQuickAdd}>
            <I.Plus width={18} height={18} /> {t('action.quickAdd')}
          </button>
          <NavLink to="/notifications" className="icon-btn" aria-label={t('nav.notifications')}>
            <I.Bell width={20} height={20} /><span className="dot" />
          </NavLink>
          <button className="icon-btn" aria-label="?"><I.Help width={20} height={20} /></button>
          <div className="avatar" title={user?.name}>{initials(user?.name)}</div>
        </header>
        {children}
      </div>
    </div>
  );
}
