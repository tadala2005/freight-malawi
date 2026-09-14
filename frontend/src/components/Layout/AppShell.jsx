import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import { AlertAPI } from '../../api/endpoints.js';
import { subscribe } from '../../socket/socket.js';

export default function AppShell({ title, children, searchValue, onSearchChange }) {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 1280);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const { data } = await AlertAPI.list();
      setUnreadAlertCount(data.alerts.filter((a) => !a.acknowledged).length);
    } catch {
      // Non-fatal: header simply shows the last known count.
    }
  }, []);

  useEffect(() => {
    refreshUnread();
    const offNewAlert = subscribe('alert:new', () => setUnreadAlertCount((c) => c + 1));

    function handleResize() {
      setCollapsed(window.innerWidth < 1280);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      offNewAlert();
      window.removeEventListener('resize', handleResize);
    };
  }, [refreshUnread]);

  return (
    <div className="app-shell">
      <Sidebar collapsed={collapsed} />
      <div className="main-column">
        <Header
          title={title}
          unreadAlertCount={unreadAlertCount}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
        />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
