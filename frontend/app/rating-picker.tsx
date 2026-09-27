"use client";

import { useId, useRef, useState } from 'react';
import './rating-picker.css';

const scores = ['', ...Array.from({ length: 10 }, (_, index) => String(index + 1))];

export default function RatingPicker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const expanded = open && !disabled;
  function choose(index: number) {
    onChange(scores[index]);
    setOpen(false);
    trigger.current?.focus();
  }
  function move(index: number) {
    setActive(index);
    document.getElementById(id + '-option-' + index)?.scrollIntoView({ block: 'nearest' });
  }
  return <div className="rating-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <span id={id + '-label'}>Your rating</span>
    <div className="rating-picker-control">
      <button ref={trigger} type="button" role="combobox" className="rating-picker-trigger" disabled={disabled}
        aria-expanded={expanded} aria-haspopup="listbox" aria-controls={id + '-options'}
        aria-labelledby={id + '-label'} aria-activedescendant={expanded ? id + '-option-' + active : undefined}
        onClick={() => { setActive(Math.max(0, scores.indexOf(value))); setOpen(current => !current); }}
        onKeyDown={event => {
          if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            if (!expanded) { setActive(Math.max(0, scores.indexOf(value))); setOpen(true); }
            else move(event.key === 'Home' ? 0 : event.key === 'End' ? 10 : Math.max(0, Math.min(10, active + (event.key === 'ArrowDown' ? 1 : -1))));
          } else if ((event.key === 'Enter' || event.key === ' ') && expanded) { event.preventDefault(); choose(active); }
          else if (/^[0-9]$/.test(event.key)) { event.preventDefault(); setOpen(true); move(event.key === '0' ? 10 : Number(event.key)); }
          else if (event.key === 'Tab') setOpen(false);
        }}>
        <span key={value} className="rating-picker-value">{value ? value + '/10' : 'Choose a rating'}</span>
        <span className="rating-picker-chevron" aria-hidden="true">⌄</span>
      </button>
      <ul id={id + '-options'} role="listbox" aria-labelledby={id + '-label'} className="rating-picker-options" data-open={expanded} aria-hidden={!expanded}>
        {scores.map((score, index) => <li key={score} id={id + '-option-' + index} role="option" aria-selected={value === score}
          className={active === index ? 'rating-option active' : 'rating-option'}
          onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
          {score ? score + '/10' : 'Choose a rating'}
        </li>)}
      </ul>
    </div>
  </div>;
}
