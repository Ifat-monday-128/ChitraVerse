"use client";
import { useState, type FormEvent } from 'react';
import { api } from './api';

export default function PasswordReset({ back }: { back: () => void }) {
  const [email,setEmail] = useState(''), [sent,setSent] = useState(false), [done,setDone] = useState(false);
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [resendAt,setResendAt] = useState(0);
  async function send() {
    setBusy(true); setError('');
    try {
      const data = await api<{message:string}>('/api/account/forgot-password',{method:'POST',body:JSON.stringify({email})});
      setSent(true); setNotice(data.message); setResendAt(Date.now()+60000);
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not send the code.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sent) { await send(); return; }
    const fields = new FormData(event.currentTarget);
    if (fields.get('password') !== fields.get('confirmation')) { setError('The passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const data = await api<{message:string}>('/api/account/reset-password',{method:'POST',body:JSON.stringify({email,code:fields.get('code'),password:fields.get('password')})});
      setDone(true); setNotice(data.message);
      if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('chitraverse-account'); channel.postMessage('changed'); channel.close(); }
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not reset the password.'); }
    finally { setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit} aria-busy={busy}>
    {!done && <fieldset disabled={busy}>
      <div className="auth-field"><label htmlFor="reset-email">Account email</label><input id="reset-email" type="email" autoComplete="email" autoFocus required maxLength={255} value={email} readOnly={sent} onChange={e=>setEmail(e.target.value)} /></div>
      {sent && <><div className="auth-field"><label htmlFor="reset-code">Six-digit email code</label><input id="reset-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /><small>Valid for 10 minutes. Five incorrect attempts invalidate the code.</small></div>
        <div className="auth-field"><label htmlFor="reset-password">New password</label><input id="reset-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></div>
        <div className="auth-field"><label htmlFor="reset-confirm">Confirm new password</label><input id="reset-confirm" name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></div></>}
    </fieldset>}
    {notice && <p role="status" className="reset-notice">{notice}</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {!done && <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Verify code & reset password' : 'Email me a reset code'}</button>}
    {sent && !done && <button type="button" className="text-button" disabled={busy} onClick={()=>{if(Date.now()<resendAt) setError('Please wait one minute before requesting another code.'); else void send();}}>Resend code</button>}
    <button type="button" className="text-button" disabled={busy} onClick={back}>Back to sign in</button>
  </form>;
}
