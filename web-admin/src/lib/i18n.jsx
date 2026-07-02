import { createContext, useContext, useState, useCallback } from 'react';

// Lightweight i18n: a dictionary per language and a t() lookup. New strings are
// added by giving them a key here; components call t('some.key'). Falls back to
// the key itself so missing translations are visible but non-breaking.
const dict = {
  ru: {
    'nav.dashboard': 'Панель', 'nav.staff': 'Сотрудники', 'nav.calendar': 'Календарь',
    'nav.analytics': 'Аналитика', 'nav.notifications': 'Уведомления', 'nav.requests': 'Заявки',
    'nav.settings': 'Настройки', 'nav.logout': 'Выйти',
    'action.newShift': 'Новая смена', 'action.quickAdd': 'Быстрое добавление',
    'action.cancel': 'Отмена', 'action.save': 'Сохранить', 'action.add': 'Добавить',
    'action.delete': 'Удалить', 'search': 'Поиск…', 'lang.label': 'Язык',
    'login.title': 'Вход в систему', 'login.welcome': 'Добро пожаловать в ShiftFlow',
    'login.email': 'Электронная почта', 'login.password': 'Пароль',
    'login.forgot': 'Забыли пароль?', 'login.submit': 'Войти', 'login.busy': 'Вход…',
    'login.noAccount': 'Нет аккаунта?', 'login.register': 'Зарегистрировать компанию',
    'login.error': 'Не удалось войти',
  },
  en: {
    'nav.dashboard': 'Dashboard', 'nav.staff': 'Staff', 'nav.calendar': 'Calendar',
    'nav.analytics': 'Analytics', 'nav.notifications': 'Notifications', 'nav.requests': 'Requests',
    'nav.settings': 'Settings', 'nav.logout': 'Log out',
    'action.newShift': 'New shift', 'action.quickAdd': 'Quick add',
    'action.cancel': 'Cancel', 'action.save': 'Save', 'action.add': 'Add',
    'action.delete': 'Delete', 'search': 'Search…', 'lang.label': 'Language',
    'login.title': 'Sign in', 'login.welcome': 'Welcome to ShiftFlow',
    'login.email': 'Email', 'login.password': 'Password',
    'login.forgot': 'Forgot password?', 'login.submit': 'Sign in', 'login.busy': 'Signing in…',
    'login.noAccount': 'No account?', 'login.register': 'Register a company',
    'login.error': 'Could not sign in',
  },
};

const I18nContext = createContext(null);
const STORAGE_KEY = 'sf_lang';

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ru');
  const setLang = useCallback((l) => { localStorage.setItem(STORAGE_KEY, l); setLangState(l); }, []);
  const t = useCallback((key) => (dict[lang] && dict[lang][key]) || key, [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
