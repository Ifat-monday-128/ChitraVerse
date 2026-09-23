"use client";
import type { User } from './api';
import AdminDashboard from './admin-dashboard';
import AccountProfile from './account-profile';
import './dashboard.css';
import './dashboard-cinema.css';

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
  updated: (user: User) => void;
  openTitle: (id: number) => void;
  openPerson: (id: number) => void;
  openGenre: (id: number) => void;
  openList: (id: number) => void;
};

export default function Dashboard(props: Props) {
  if (props.user?.role === 'admin') return <AdminDashboard {...props} user={props.user} />;
  if (props.user) return <AccountProfile {...props} user={props.user} />;
  return <section className="content-page dashboard-page"><p className="eyebrow">YOUR SPACE IN CHITRAVERSE</p><h1>Your account</h1><div className="dashboard-account"><p>Sign in to access your personal space.</p><button className="primary-button" onClick={props.signIn}>Sign in</button></div></section>;
}
