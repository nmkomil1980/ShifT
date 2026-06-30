import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { initials } from '../lib/util.js';
import Layout from '../components/Layout.jsx';

const roleLabel = { owner: 'Владелец', manager: 'Менеджер', employee: 'Сотрудник' };

export default function Settings() {
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
    <Layout>
      <div className="page" style={{ maxWidth: 720 }}>
        <div className="page-head"><h2>Настройки профиля</h2><p>Личные данные вашей учётной записи.</p></div>

        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div className="pic" style={{ width: 64, height: 64, margin: 0, fontSize: 22, borderRadius: '50%', background: 'var(--indigo-100)', color: 'var(--indigo-600)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{initials(user.name)}</div>
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

          <div className="btn-group" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить изменения'}</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
