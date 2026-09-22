"use client";
import type { User } from './api';
import './dashboard.css';

type Props = {
  user: User | null;
  busy: boolean;
  error: string;
  signIn: () => void;
  logout: () => void;
  watchlists: () => void;
  favorites: () => void;
  community: () => void;
  homepage: () => void;
  activity: () => void;
};

export default function Dashboard(props: Props) {
  const { user, busy, error } = props;
  const admin = user?.role === 'admin';
  const cards = admin ? [
    { title: 'Manage homepage', text: 'Choose and arrange the movies and series in the spotlight.', icon: '◈', action: props.homepage },
    { title: 'Users & activity', text: 'Review member accounts and their activity across the library.', icon: '◎', action: props.activity },
  ] : [
    { title: 'My Watchlists', text: 'Keep your next watch ready. Organize titles into your own collections.', icon: '▤', action: props.watchlists },
    { title: 'Favorites', text: 'Return to the movies and series you love, all in one place.', icon: '♡', action: props.favorites },
  ];
  return <section className="content-page dashboard-page">
    <p className="eyebrow">YOUR SPACE IN CHITRAVERSE</p>
    <h1>{admin ? 'Admin dashboard' : 'User dashboard'}</h1>
    {!user ? <div className="dashboard-account"><p>Sign in to access your personal space.</p><button className="primary-button" onClick={props.signIn}>Sign in</button></div> : <>
      <div className="dashboard-account"><span className="dashboard-avatar" aria-hidden="true">{user.name.slice(0,2).toUpperCase()}</span><div className="dashboard-identity"><p className="dashboard-greeting">Welcome back</p><h2>{user.name}</h2><p>{user.email}</p></div><span className="dashboard-role">{admin ? 'Administrator' : 'Member'}</span></div>
      <h2 className="dashboard-section-title">{admin ? 'Manage your community' : 'Make yourself at home'}</h2>
      <div className="dashboard-grid">{[...cards, { title: 'CVcommunity', text: 'Share your perspective, explore stories, and join the conversation.', icon: '✎', action: props.community }].map(card =>
        <button className="dashboard-card" key={card.title} aria-label={card.title} onClick={card.action}><span className="dashboard-card-icon" aria-hidden="true">{card.icon}</span><strong>{card.title}</strong><span>{card.text}</span><span className="dashboard-card-link" aria-hidden="true">Explore <span>↗</span></span></button>
      )}</div>
      <div className="dashboard-session"><p>You’re signed in as <strong>{user.name}</strong>.</p><button className="secondary-button" disabled={busy} onClick={props.logout}>{busy ? 'Signing out…' : 'Sign out'}</button></div>
      {error && <p className="message error" role="alert">{error}</p>}
    </>}
  </section>;
}
