import React, { useEffect, useState } from 'react';
import { Search, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isConnected, subscribe } from '../../socket/socket.js';

export default function Header({
  title,
  unreadAlertCount = 0,
  onBellClick,
  searchValue = '',
  onSearchChange,
}) {
  const [connected, setConnected] = useState(isConnected());
  const navigate = useNavigate();

  useEffect(() => {
    const offConnect = subscribe('connect', () => setConnected(true));
    const offDisconnect = subscribe('disconnect', () => setConnected(false));

    setConnected(isConnected());

    return () => {
      offConnect();
      offDisconnect();
    };
  }, []);

  const handleBellClick = () => {
    if (typeof onBellClick === 'function') {
      onBellClick();
      return;
    }

    navigate('/alerts');
  };

  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>

      <div className="topbar-actions">
        <div className="search-input-wrap">
          <Search size={16} aria-hidden="true" />

          <input
            type="search"
            className="search-input"
            placeholder="Search fleet..."
            aria-label="Search fleet"
            value={searchValue}
            onChange={(event) => {
              if (typeof onSearchChange === 'function') {
                onSearchChange(event.target.value);
              }
            }}
          />
        </div>

        <div
          className={`conn-status ${connected ? 'live' : 'offline'}`}
          aria-label={`Socket connection ${connected ? 'live' : 'offline'}`}
        >
          <span
            className={`conn-dot ${connected ? 'live' : 'offline'}`}
            aria-hidden="true"
          />
          {connected ? 'Live' : 'Offline'}
        </div>

        <button
          type="button"
          className="bell-btn"
          onClick={handleBellClick}
          aria-label={
            unreadAlertCount > 0
              ? `Open alerts, ${unreadAlertCount} unread`
              : 'Open alerts'
          }
          title="Open alerts"
        >
          <Bell size={20} aria-hidden="true" />

          {unreadAlertCount > 0 && (
            <span className="bell-badge" aria-hidden="true">
              {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

