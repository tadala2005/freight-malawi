import React, { useCallback, useEffect, useState } from 'react';
import AppShell from '../components/Layout/AppShell.jsx';
import Card from '../components/UI/Card.jsx';
import Skeleton from '../components/UI/Skeleton.jsx';
import AlertPanel from '../components/Dashboard/AlertPanel.jsx';
import { AlertAPI } from '../api/endpoints.js';
import { subscribe } from '../socket/socket.js';
import { useToast } from '../context/ToastContext.jsx';

export default function Alerts() {
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acknowledgingId, setAcknowledgingId] = useState(null);

  const loadAlerts = useCallback(async () => {
    const { data } = await AlertAPI.list();
    setAlerts(data.alerts);
  }, []);

  useEffect(() => {
    loadAlerts().finally(() => setLoading(false));
  }, [loadAlerts]);

  useEffect(() => {
    const off = subscribe('alert:new', (alert) => {
      setAlerts((prev) => [{ ...alert, created_at: alert.createdAt || new Date().toISOString() }, ...prev]);
    });
    const offCompleted = subscribe('trip:completed', () => {
      loadAlerts().catch(() => {});
    });
    return () => { off(); offCompleted(); };
  }, [loadAlerts]);

  async function handleAcknowledge(alertId) {
    setAcknowledgingId(alertId);
    try {
      await AlertAPI.acknowledge(alertId);
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: 1 } : a)));
      showToast('Alert acknowledged', 'success');
    } catch (err) {
      showToast('Could not acknowledge alert', 'error');
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <AppShell title="Alerts">
      <Card title="Fleet Alerts" subtitle="Theft, abnormal consumption and refuelling events across your fleet">
        {loading ? <Skeleton height={240} /> : (
          <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} acknowledgingId={acknowledgingId} />
        )}
      </Card>
    </AppShell>
  );
}
