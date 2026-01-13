// src/renderer/dashboard/components/RecentLogs.tsx
import React, { useEffect, useState } from 'react';

interface SyncLog {
  id: number;
  sync_type: string;
  entity_type: string;
  status: string;
  message?: string;
  records_count: number;
  timestamp: string;
}

interface ActiveSync {
  id: number;
  entity_type: string;
  sync_type: string;
  status: string;
  started_at: string;
  current_step?: string;
  progress?: {
    current: number;
    total: number;
  };
}

interface RecentLogsProps {
  logs: SyncLog[];
}

export const RecentLogs: React.FC<RecentLogsProps> = ({ logs: initialLogs }) => {
  const [logs, setLogs] = useState<SyncLog[]>(initialLogs);
  const [activeSyncs, setActiveSyncs] = useState<ActiveSync[]>([]);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 5; // Show 5 items initially

  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  useEffect(() => {
    loadActiveSyncs();
    const interval = setInterval(loadActiveSyncs, 3000); // Check every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const loadActiveSyncs = async () => {
    try {
      if (window.electronAPI?.getActiveSyncProcesses) {
        const active = await window.electronAPI.getActiveSyncProcesses();
        setActiveSyncs(active || []);
      }
    } catch (error) {
      console.error('Error loading active syncs:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
      case 'completed':
        return '#4caf50';
      case 'error':
      case 'failed':
        return '#f44336';
      case 'started':
      case 'fetching':
      case 'sending':
      case 'in_progress':
        return '#2196f3';
      default:
        return '#999';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return dateString;
    }
  };

  const visibleLogs = showAll ? logs : logs.slice(0, ITEMS_PER_PAGE);
  const hasMore = logs.length > ITEMS_PER_PAGE;

  return (
    <div className="card">
      <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-primary)' }}>
        Recent Activity
      </h2>
      
      {/* Active Sync Processes */}
      {activeSyncs.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ 
            fontSize: '12px', 
            color: 'var(--text-secondary)', 
            marginBottom: '8px',
            fontWeight: 600,
            textTransform: 'uppercase'
          }}>
            Active Sync Processes
          </div>
          {activeSyncs.map((sync) => (
            <div
              key={sync.id}
              style={{
                padding: '12px',
                background: 'var(--bg-tertiary)',
                borderRadius: '6px',
                borderLeft: `3px solid ${getStatusColor(sync.status)}`,
                marginBottom: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: getStatusColor(sync.status),
                    animation: sync.status === 'in_progress' || sync.status === 'STARTED' ? 'pulse 2s infinite' : 'none'
                  }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {sync.entity_type} Sync
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    ({sync.sync_type})
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Started: {formatDate(sync.started_at)}
                </span>
              </div>
              
              {sync.current_step && (
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '6px' }}>
                  {sync.current_step}
                </div>
              )}
              
              {sync.progress && sync.progress.total > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ 
                    fontSize: '11px', 
                    color: 'var(--text-secondary)', 
                    marginBottom: '4px' 
                  }}>
                    Progress: {sync.progress.current || 0} / {sync.progress.total || 0}
                  </div>
                  <div style={{
                    width: '100%',
                    height: '4px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${Math.min(((sync.progress.current || 0) / (sync.progress.total || 1)) * 100, 100)}%`,
                      height: '100%',
                      background: getStatusColor(sync.status),
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recent Sync History */}
      <div style={{
        fontSize: '12px', 
        color: 'var(--text-secondary)', 
        marginBottom: '8px',
        fontWeight: 600,
        textTransform: 'uppercase'
      }}>
        Recent Sync History
      </div>
      
      <div style={{
        maxHeight: showAll ? '400px' : 'none',
        overflowY: showAll ? 'auto' : 'visible',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {logs.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No sync logs yet
          </div>
        ) : (
          <>
            {visibleLogs.map(log => (
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
                    {log.records_count.toLocaleString()} records processed
                  </div>
                )}
              </div>
            ))}
            
            {hasMore && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                style={{
                  padding: '10px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  marginTop: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                See More ({logs.length - ITEMS_PER_PAGE} more)
              </button>
            )}
            
            {showAll && hasMore && (
              <button
                onClick={() => setShowAll(false)}
                style={{
                  padding: '10px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  marginTop: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                Show Less
              </button>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};
