"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import './auth-screen.css';

type AuthScreenProps = {
  register: boolean;
  busy: boolean;
  error: string;
  close: () => void;
  toggleMode: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function AuthScreen({ register, busy, error, close, toggleMode, submit }: AuthScreenProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  return <dialog ref={dialog} className="auth-screen" aria-labelledby="auth-heading" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="auth-stage">
      <div className="auth-atmosphere" aria-hidden="true"><span className="auth-orbit auth-orbit-one" /><span className="auth-orbit auth-orbit-two" /><span className="auth-orbit auth-orbit-three" /><span className="auth-sphere" /><span className="auth-light-line" /></div>
      <header className="auth-header"><button type="button" className="auth-brand" onClick={close} aria-label="Back to ChitraVerse">CHITRA<span>VERSE</span><small>MOVIES BEYOND THE FRAME</small></button><button type="button" className="auth-close" onClick={close} aria-label="Close sign in"><span aria-hidden="true">×</span></button></header>
      <div className="auth-layout">
        <section className="auth-story" aria-label="Welcome to ChitraVerse">
          <p className="auth-kicker"><span /> YOUR NEXT GREAT STORY STARTS HERE</p>
          <h1>Beyond the screen.<br /><span>Into your world.</span></h1>
          <p className="auth-story-description">The films you love. The stories you haven’t found yet. A little universe of cinema, made yours.</p>
          <div className="auth-story-note"><span className="auth-frame-mark" aria-hidden="true"><i /></span><p>Discover something unforgettable.<br /><strong>Keep it in your watchlist.</strong></p></div>
          <div className="auth-story-bottom"><span>DISCOVER</span><i /><span>COLLECT</span><i /><span>GET INSPIRED</span></div>
        </section>
        <div className="auth-panel-area">
          <section className="auth-glass" aria-labelledby="auth-heading">
            <div className="auth-panel-top"><span className="auth-monogram" aria-hidden="true">CV<span /></span><span>YOUR CHITRAVERSE ACCOUNT</span></div>
            <div className="auth-intro"><p className="auth-kicker">{register ? 'MAKE YOURSELF AT HOME' : 'THE NEXT CHAPTER'}</p><h2 id="auth-heading">{register ? 'Join the story.' : 'Welcome back.'}</h2><p>{register ? 'Create an account and start your own movie collection.' : 'Sign in to pick up where you left off.'}</p></div>
            <form className="auth-form" onSubmit={submit} aria-busy={busy} aria-describedby={error ? 'auth-error' : undefined}>
              <fieldset disabled={busy}>
                {register && <div className="auth-field"><label htmlFor="auth-name">Your name</label><input id="auth-name" name="name" autoComplete="name" placeholder="How should we call you?" required maxLength={255} /></div>}
                <div className="auth-field"><label htmlFor="auth-email">Email address</label><input id="auth-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required maxLength={255} autoFocus /></div>
                <div className="auth-field"><label htmlFor="auth-password">Password</label><div className="auth-password"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'Create a strong password' : 'Enter your password'} required minLength={register ? 8 : undefined} maxLength={128} aria-describedby={register ? 'auth-password-hint' : undefined} /><button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="auth-password" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>{register && <small id="auth-password-hint">Use at least 8 characters.</small>}</div>
              </fieldset>
              {error && <p id="auth-error" className="auth-error" role="alert">{error}</p>}
              <button type="submit" className="auth-submit" disabled={busy}><span>{busy ? (register ? 'Creating your account…' : 'Signing you in…') : (register ? 'Create account' : 'Sign in')}</span>{busy ? <span className="auth-spinner" aria-hidden="true" /> : <span aria-hidden="true">↗</span>}</button>
              <p className="auth-security"><span className="auth-lock" aria-hidden="true" />Your next great watch is waiting.</p>
            </form>
            <div className="auth-switch"><span>{register ? 'Already part of ChitraVerse?' : 'New to ChitraVerse?'}</span><button type="button" disabled={busy} onClick={() => { setShowPassword(false); toggleMode(); }}>{register ? 'Sign in' : 'Create an account'} <span aria-hidden="true">→</span></button></div>
          </section>
          <p className="auth-panel-caption">A WORLD OF CINEMA. ONE PLACE TO CALL YOURS.</p>
        </div>
      </div>
      <footer className="auth-footer"><span>CURATED FOR THE LOVE OF CINEMA</span><button type="button" onClick={close}>← Back to exploring</button></footer>
    </div>
  </dialog>;
}
