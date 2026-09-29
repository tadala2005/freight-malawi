import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Truck, BookOpen, MapPinned, FileBarChart, Bell, Settings as SettingsIcon,
  Menu, X, LogOut, Search, Wifi, WifiOff,
} from 'lucide-react';
import { LogoFull } from '../Brand/Logo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { vehicleApi, tripApi } from '../../api/endpoints';
import { SeverityBadge } from '../UI/Badge';
import { ConfirmModal } from '../UI/Modal';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/vehicles', label: 'Vehicles', icon: Truck },
  { to: '/logbook', label: 'Trips / Logbook', icon: BookOpen },
  { to: '/history', label: 'History', icon: MapPinned },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function displayAlertMessage(message) {
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object' && typeof message.message === 'string') return message.message;
  return 'Alert details available in incident details.';
}

function ConnectionIndicator({ status }) {
  if (status === 'live') {
    return <span className="fm-badge fm-badge-teal"><Wifi size={12} /> Live</span>;
  }
  if (status === 'reconnecting') {
    return <span className="fm-badge fm-badge-warning"><Wifi size={12} /> Reconnecting</span>;
  }
  return <span className="fm-badge fm-badge-muted"><WifiOff size={12} /> Offline</span>;
}

function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults(null);
      return undefined;
    }
    const handle = setTimeout(async () => {
      try {
        const q = query.trim().toLowerCase();
        const [vehicles, trips] = await Promise.all([
          vehicleApi.list(),
          tripApi.list({ search: query.trim(), limit: 5 }),
        ]);
        const matchedVehicles = vehicles.filter((v) => [v.name, v.license_plate, v.driver_name, v.device_id]
          .filter(Boolean).some((f) => f.toLowerCase().includes(q))).slice(0, 5);
        setResults({ vehicles: matchedVehicles, trips });
        setOpen(true);
      } catch (err) {
        setResults(null);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  const hasResults = results && (results.vehicles.length > 0 || results.trips.length > 0);

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
      <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fm-muted)' }} />
      <input
        className="fm-input"
        style={{ paddingLeft: 36 }}
        placeholder="Search vehicles, drivers, trips, destinations…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results && setOpen(true)}
        aria-label="Global search"
      />
      {open && (
        <div className="fm-card" style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 50, maxHeight: 360, overflowY: 'auto' }}>
          {!hasResults && <div style={{ padding: 14, color: 'var(--fm-muted)' }}>No matches for &ldquo;{query}&rdquo;.</div>}
          {results && results.vehicles.length > 0 && (
            <div>
              <div style={{ padding: '10px 14px 4px', fontSize: 12, fontWeight: 700, color: 'var(--fm-muted)', textTransform: 'uppercase' }}>Vehicles</div>
              {results.vehicles.map((v) => (
                <div
                  key={v.id}
                  onClick={() => { setOpen(false); setQuery(''); navigate(`/vehicles/${v.id}`); }}
                  style={{ padding: '10px 14px', cursor: 'pointer' }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <strong>{v.name}</strong> <span style={{ color: 'var(--fm-muted)' }}>· {v.license_plate} · {v.driver_name || 'Unassigned driver'}</span>
                </div>
              ))}
            </div>
          )}
          {results && results.trips.length > 0 && (
            <div>
              <div style={{ padding: '10px 14px 4px', fontSize: 12, fontWeight: 700, color: 'var(--fm-muted)', textTransform: 'uppercase' }}>Trips</div>
              {results.trips.map((t) => (
                <div
                  key={t.id}
                  onClick={() => { setOpen(false); setQuery(''); navigate(`/logbook?trip=${t.id}`); }}
                  style={{ padding: '10px 14px', cursor: 'pointer' }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <strong>{t.origin || 'Unknown'} → {t.destination || 'Unknown'}</strong>
                  <span style={{ color: 'var(--fm-muted)' }}> · {t.vehicle_name} ({t.license_plate})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { notificationCount, latestAlerts, refreshBadge } = useAuth();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="fm-btn fm-btn-ghost fm-btn-icon"
        onClick={() => { setOpen((o) => !o); if (!open) refreshBadge(); }}
        aria-label={`${notificationCount} active alerts`}
        style={{ position: 'relative' }}
      >
        <Bell size={18} />
        {notificationCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, background: 'var(--fm-red)', color: 'white',
            borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
          }}
          >
            {notificationCount}
          </span>
        )}
      </button>
      {open && (
        <div className="fm-card" style={{ position: 'absolute', top: '120%', right: 0, width: 340, zIndex: 50, maxHeight: 420, overflowY: 'auto' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--fm-border)', fontWeight: 700 }}>
            {notificationCount} active alert{notificationCount === 1 ? '' : 's'}
          </div>
          {latestAlerts.length === 0 && (
            <div style={{ padding: 16, color: 'var(--fm-muted)' }}>Your fleet is currently clear.</div>
          )}
          {latestAlerts.map((a) => (
            <div
              key={a.id}
              style={{ padding: '10px 14px', borderBottom: '1px solid var(--fm-border)', cursor: 'pointer' }}
              onClick={() => { setOpen(false); navigate(`/vehicles/${a.vehicle_id}`); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{a.vehicle_name} · {a.license_plate}</strong>
                <SeverityBadge severity={a.severity} />
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>{displayAlertMessage(a.message)}</p>
            </div>
          ))}
          <div style={{ padding: 10, textAlign: 'center' }}>
            <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => { setOpen(false); navigate('/alerts'); }}>
              View all alerts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ children }) {
  const { user, logout, connectionStatus, getSocket } = useAuth();
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const navigate = useNavigate();

  // Optional pop-up on new alerts, gated by the real preference in Settings.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onAlertNew = (alert) => {
      const enabled = localStorage.getItem('fm_toast_on_alert') !== 'false';
      if (!enabled) return;
      const tone = alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? 'error' : 'warning';
      toast[tone](`${alert.vehicle_name || 'Vehicle'}: ${displayAlertMessage(alert.message)}`, 6000);
    };
    socket.on('alert:new', onAlertNew);
    return () => socket.off('alert:new', onAlertNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSocket]);

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`app-sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <LogoFull height={22} />
        </div>
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setDrawerOpen(false)}
            >
              <item.icon size={17} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8 }}>Signed in as</div>
          <div style={{ color: 'white', fontWeight: 600, marginBottom: 10 }}>{user?.username}</div>
          <button
            type="button"
            className="fm-btn fm-btn-ghost fm-btn-sm"
            style={{ width: '100%', color: 'white', borderColor: 'rgba(255,255,255,0.25)' }}
            onClick={() => setConfirmLogout(true)}
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="fm-btn fm-btn-ghost fm-btn-icon"
            style={{ display: 'none' }}
            id="mobile-menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
          <div className="mobile-menu-trigger">
            <button type="button" className="fm-btn fm-btn-ghost fm-btn-icon" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu">
              <Menu size={20} />
            </button>
          </div>
          <GlobalSearch />
          <div style={{ flex: 1 }} />
          <ConnectionIndicator status={connectionStatus} />
          <NotificationBell />
        </header>
        <main className="app-content">{children}</main>
      </div>

      <ConfirmModal
        open={confirmLogout}
        title="Log out?"
        message="You'll need to sign in again to access your fleet dashboard."
        confirmLabel="Log out"
        danger
        onConfirm={() => { setConfirmLogout(false); logout(); navigate('/login'); }}
        onCancel={() => setConfirmLogout(false)}
      />

      <style>{`
        .mobile-menu-trigger { display: none; }
        @media (max-width: 900px) {
          .mobile-menu-trigger { display: flex; }
        }
      `}</style>
    </div>
  );
}
