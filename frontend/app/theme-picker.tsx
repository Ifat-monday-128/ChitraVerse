"use client";
import { useEffect, useState, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';
import './theme-picker.css';

const themes = [
  { id: 'red', name: 'Red', color: '#e50914' },
  { id: 'golden', name: 'Golden', color: '#d4af37' },
  { id: 'emerald', name: 'Emerald', color: '#059669' },
  { id: 'sapphire', name: 'Sapphire', color: '#2563eb' },
  { id: 'amethyst', name: 'Amethyst', color: '#9333ea' }
];

function hexToRgb(hex: string) {
  const normalizedHex = hex.replace(/^#/, '');
  const r = parseInt(normalizedHex.slice(0, 2), 16) || 0;
  const g = parseInt(normalizedHex.slice(2, 4), 16) || 0;
  const b = parseInt(normalizedHex.slice(4, 6), 16) || 0;
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function RgbInput({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
  const [localVal, setLocalVal] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(String(value));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      if (val !== '' && parseInt(val, 10) > 255) return;
      setLocalVal(val);
      if (val !== '') {
        onChange(parseInt(val, 10));
      }
    }
  };

  return (
    <label className="rgb-input-group">
      <input 
        type="text" 
        value={localVal} 
        onChange={handleChange} 
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          if (localVal === '') {
            setLocalVal('0');
            onChange(0);
          }
        }}
        maxLength={3}
      />
      <span>{label}</span>
    </label>
  );
}

export default function ThemePicker() {
  const [activeTheme, setActiveTheme] = useState('red');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [mounted, setMounted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('chitraverse-theme') || 'red';
    const savedColor = localStorage.getItem('chitraverse-custom-color') || '#00ff00';
    setActiveTheme(savedTheme);
    setCustomColor(savedColor);
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (savedTheme === 'custom') {
      document.documentElement.style.setProperty('--custom-accent', savedColor);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    if (pickerOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pickerOpen]);

  const changeTheme = (themeId: string) => {
    setActiveTheme(themeId);
    localStorage.setItem('chitraverse-theme', themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    if (themeId === 'custom') {
      document.documentElement.style.setProperty('--custom-accent', customColor);
    }
  };

  const handleCustomColor = (color: string) => {
    setCustomColor(color);
    setActiveTheme('custom');
    localStorage.setItem('chitraverse-theme', 'custom');
    localStorage.setItem('chitraverse-custom-color', color);
    document.documentElement.setAttribute('data-theme', 'custom');
    document.documentElement.style.setProperty('--custom-accent', color);
  };

  const handleRgbChange = (channel: 'r' | 'g' | 'b', num: number) => {
    const { r, g, b } = hexToRgb(customColor);
    let newColor = customColor;
    
    if (channel === 'r') newColor = rgbToHex(num, g, b);
    if (channel === 'g') newColor = rgbToHex(r, num, b);
    if (channel === 'b') newColor = rgbToHex(r, g, num);
    
    handleCustomColor(newColor);
  };

  if (!mounted) return null;

  const { r, g, b } = hexToRgb(customColor);

  return (
    <div className="theme-picker" aria-label="Theme Selection">
      <p className="theme-picker-label">Theme</p>
      <div className="theme-options">
        {themes.map(t => (
          <button 
            key={t.id} 
            className={`theme-option ${activeTheme === t.id ? 'active' : ''}`}
            onClick={() => { changeTheme(t.id); setPickerOpen(false); }}
            style={{ backgroundColor: t.color }}
            aria-label={`Select ${t.name} theme`}
            title={t.name}
          />
        ))}
        <div className="custom-picker-container" ref={popoverRef}>
          <button 
            className={`theme-option custom-picker ${activeTheme === 'custom' ? 'active' : ''}`}
            style={{ background: activeTheme === 'custom' ? customColor : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
            title="Custom Color"
            onClick={() => setPickerOpen(!pickerOpen)}
          >
            <span className="picker-icon" aria-hidden="true">+</span>
          </button>
          
          {pickerOpen && (
            <div className="color-popover">
              <HexColorPicker color={customColor} onChange={handleCustomColor} />
              <div className="rgb-inputs">
                <RgbInput label="R" value={r} onChange={(v) => handleRgbChange('r', v)} />
                <RgbInput label="G" value={g} onChange={(v) => handleRgbChange('g', v)} />
                <RgbInput label="B" value={b} onChange={(v) => handleRgbChange('b', v)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
