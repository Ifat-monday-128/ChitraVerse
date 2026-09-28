"use client";
import { ReactNode, useState, useRef, useEffect, Children, isValidElement } from 'react';
import './custom-select.css';

export default function Select(props: {
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function clickOutside(e: MouseEvent) {
      if (container.current && !container.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  const options: { value: string; label: ReactNode }[] = [];
  Children.forEach(props.children, child => {
    if (isValidElement(child) && child.type === 'option') {
      const val = child.props.value !== undefined ? String(child.props.value) : String(child.props.children);
      options.push({ value: val, label: child.props.children });
    }
  });

  const selectedOption = options.find(o => String(o.value) === String(props.value)) || options[0];

  return (
    <div className={`custom-select ${props.className || ''} ${props.disabled ? 'disabled' : ''} ${open ? 'open' : ''}`} ref={container}>
      <button 
        type="button" 
        className="select-trigger" 
        aria-label={props['aria-label']} 
        aria-haspopup="listbox" 
        aria-expanded={open}
        disabled={props.disabled}
        onClick={() => setOpen(!open)}
      >
        <span className="select-value">{selectedOption?.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <ul className="select-dropdown" role="listbox">
          {options.map((o, i) => (
            <li 
              key={i} 
              role="option" 
              aria-selected={o.value === String(props.value)}
              className={o.value === String(props.value) ? 'selected' : ''}
              onClick={() => {
                props.onChange({ target: { value: o.value } });
                setOpen(false);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
