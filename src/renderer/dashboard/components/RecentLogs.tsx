// src/renderer/dashboard/components/RecentLogs.tsx
import React from 'react';

interface SyncLog {
  id: number;
  sync_type: string;
  entity_type: string;
  status: string;
  message?: string;
  records_count: number;
  timestamp: string;
}

interface RecentLogsProps {
  logs: SyncLog[];
}

export const RecentLogs: React.FC<RecentLogsProps> = ({ logs }) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
        return '#4caf50';
      case 'error':
      case 'failed':
        return '#f44336';
      case 'started':
      case 'fetching':
      case 'sending':
        return '#2196f3';
      default:
        return '#999';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-primary)' }}>Recent Sync Logs</h2>
      
      <div style={{
        maxHeight: '400px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {logs.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No sync logs yet
          </div>
        ) : (
          logs.map(log => (
            <div
              key={log.id}
              style={{
                padding: '12px',
                background: 'var(--bg-tertiary)',
                borderRadius: '6px',
                borderLeft: `3px solid ${getStatusColor(log.status)}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: getStatusColor(log.status) + '20',
                    color: getStatusColor(log.status),
                    fontWeight: 500
                  }}>
                    {log.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {log.entity_type} • {log.sync_type}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {formatDate(log.timestamp)}
                </span>
              </div>
              
              {log.message && (
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '4px' }}>
                  {log.message}
                </div>
              )}
              
              {log.records_count > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {log.records_count} records
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
