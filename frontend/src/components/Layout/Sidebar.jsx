import React from 'react';
import { NavLink } from 'react-router-dom';
import { Gauge, Truck, Route, FileBarChart, Bell, LogOut, User } from 'lucide-react';
import LogoReversed from '../Brand/LogoReversed.jsx';
import LogoIcon from '../Brand/LogoIcon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/vehicles', label: 'Vehicles', icon: Truck },
  { to: '/history', label: 'History', icon: Route },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/alerts', label: 'Alerts', icon: Bell },
];

export default function Sidebar({ collapsed }) {
  const { user, logout } = useAuth();

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        {collapsed ? <LogoIcon size={28} /> : <LogoReversed height={26} />}
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <User size={18} aria-hidden="true" />
          <span className="sidebar-user-name label">{user?.username}</span>
        </div>
        <button type="button" className="sidebar-logout-btn" onClick={logout} aria-label="Log out">
          <LogOut size={18} aria-hidden="true" />
          <span className="label">Log out</span>
        </button>
      </div>
    </aside>
  );
}
