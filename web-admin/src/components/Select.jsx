import { useEffect, useRef, useState } from 'react';

// Custom dropdown in the app's visual style. Native <select> popups are drawn
// by the OS and can't be themed, so option lists here are our own markup.
// options: [{ value, label }]
export default function Select({ value, onChange, options, placeholder = 'Выберите…', disabled, title }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const current = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    // Scroll the selected option into view when the list opens.
    const el = listRef.current?.querySelector('.sel-option.on');
    el?.scrollIntoView({ block: 'center' });
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={`sel ${disabled ? 'disabled' : ''}`} ref={rootRef} title={title}>
      <button type="button" className={`sel-trigger ${open ? 'open' : ''}`} disabled={disabled}
        onClick={() => setOpen((v) => !v)}>
        <span className={current ? '' : 'sel-placeholder'}>{current ? current.label : placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="sel-list" ref={listRef} role="listbox">
          {options.map((o) => (
            <button type="button" key={o.value} role="option" aria-selected={String(o.value) === String(value)}
              className={`sel-option ${String(o.value) === String(value) ? 'on' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Time-of-day options in fixed steps for TimeSelect.
const timeOptions = (stepMin = 30) => {
  const out = [];
  for (let m = 0; m < 24 * 60; m += stepMin) {
    const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    out.push({ value: v, label: v });
  }
  return out;
};

export function TimeSelect({ value, onChange, stepMin = 30 }) {
  const options = timeOptions(stepMin);
  // Keep a non-step value (e.g. 09:15 from an existing shift) selectable.
  if (value && !options.some((o) => o.value === value)) {
    options.push({ value, label: value });
    options.sort((a, b) => a.value.localeCompare(b.value));
  }
  return <Select value={value} onChange={onChange} options={options} placeholder="—:—" />;
}
