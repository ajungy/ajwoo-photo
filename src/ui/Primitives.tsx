import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Minimal switch: applies immediately. 44×26 track, label is clickable. */
export function Switch({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="switch-row">
      <span className="switch-label">{children}</span>
      {hint}
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

/** Underline tabs with a sliding 2px indicator. The indicator's track is always reserved. */
export function Tabs<T extends string>({ items, value, onChange, label, scroll }: {
  items: { id: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  scroll?: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el) return;
    setBar({ x: el.offsetLeft, w: el.offsetWidth });
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value, items.length, scroll]);
  return (
    <div ref={list} className={'tabs' + (scroll ? ' is-scroll' : '')} role="tablist" aria-label={label}>
      {items.map(it => (
        <button key={it.id} role="tab" type="button" className="tab" aria-selected={it.id === value} title={it.title} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
      <span className="tab-indicator" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} aria-hidden />
    </div>
  );
}
