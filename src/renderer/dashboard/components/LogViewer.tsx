// src/renderer/dashboard/components/LogViewer.tsx
import React, { useEffect, useState } from 'react';

type LogType = 'system' | 'api' | 'tally-sync' | 'all';

interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  type: string;
  message: string;
  metadata?: any;
  entity_type?: string;
  status?: string;
  endpoint?: string;
  method?: string;
  status_code?: number;
  duration_ms?: number;
}

interface LogViewerProps {
  logType: LogType;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logType }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // Auto-refresh every 5 seconds
    return () => clearInterval(interval);
  }, [logType, levelFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let logsData: LogEntry[] = [];
      
      if (logType === 'system' || logType === 'all') {
        try {
          const systemLogs = await window.electronAPI?.getLogs?.() || [];
          if (Array.isArray(systemLogs)) {
            logsData = [...logsData, ...systemLogs.map((log: any) => {
              if (!log || !log.id) return null;
              let metadata = null;
              if (log.metadata) {
                try {
                  // If metadata is already an object, use it directly
                  if (typeof log.metadata === 'object') {
                    metadata = log.metadata;
                  } else if (typeof log.metadata === 'string') {
                    // Try to parse as JSON
                    metadata = JSON.parse(log.metadata);
                  }
                } catch (e) {
                  // If parsing fails, use the string as-is or set to null
                  console.warn('Failed to parse log metadata:', e, log.metadata);
                  metadata = typeof log.metadata === 'string' ? log.metadata : null;
                }
              }
              return {
                id: log.id,
                timestamp: log.created_at || log.timestamp || new Date().toISOString(),
                level: log.level || 'INFO',
                type: 'system',
                message: log.message || 'No message',
                metadata
              };
            }).filter(Boolean) as LogEntry[]];
          }
        } catch (error: any) {
          console.error('Error fetching system logs:', error);
        }
      }
      
      if (logType === 'api' || logType === 'all') {
        try {
          const apiLogs = await window.electronAPI?.getApiLogs?.() || [];
          if (Array.isArray(apiLogs)) {
            logsData = [...logsData, ...apiLogs.map((log: any) => {
              if (!log || !log.id) return null;
              return {
                id: log.id,
                timestamp: log.created_at || log.timestamp || new Date().toISOString(),
                level: log.status === 'success' ? 'INFO' : (log.status === 'error' ? 'ERROR' : 'WARN'),
                type: 'api',
                message: `${log.method || 'UNKNOWN'} ${log.endpoint || 'N/A'}`,
                endpoint: log.endpoint,
                method: log.method,
                status_code: log.status_code,
                duration_ms: log.duration_ms,
                metadata: { request: log.request_payload, response: log.response_payload }
              };
            }).filter(Boolean) as LogEntry[]];
          }
        } catch (error: any) {
          console.error('Error fetching API logs:', error);
        }
      }
      
      if (logType === 'tally-sync' || logType === 'all') {
        try {
          const syncLogs = await window.electronAPI?.getTallySyncLogs?.() || [];
          if (Array.isArray(syncLogs)) {
            logsData = [...logsData, ...syncLogs.map((log: any) => {
              if (!log || !log.id) return null;
              return {
                id: log.id,
                timestamp: log.created_at || log.timestamp || new Date().toISOString(),
                level: log.status === 'SUCCESS' ? 'INFO' : (log.status === 'FAILED' ? 'ERROR' : 'WARN'),
                type: 'tally-sync',
                message: `${log.entity_type || 'Unknown'} ${log.sync_type || ''} - ${log.sync_mode || ''}`,
                entity_type: log.entity_type,
                status: log.status,
                metadata: { 
                  request: log.request_payload, 
                  response: log.response_payload,
                  records_fetched: log.records_fetched,
                  records_stored: log.records_stored,
                  records_sent: log.records_sent
                }
              };
            }).filter(Boolean) as LogEntry[]];
          }
        } catch (error: any) {
          console.error('Error fetching tally sync logs:', error);
        }
      }

      // Sort by timestamp descending
      logsData.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA;
      });
      
      // Apply filters
      let filtered = logsData;
      if (filter) {
        filtered = filtered.filter(log => 
          log.message.toLowerCase().includes(filter.toLowerCase()) ||
          log.type.toLowerCase().includes(filter.toLowerCase())
        );
      }
      if (levelFilter !== 'all') {
        filtered = filtered.filter(log => log.level.toLowerCase() === levelFilter.toLowerCase());
      }
      
      setLogs(filtered.slice(0, 500)); // Limit to 500 most recent
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
      case 'FAILED':
        return '#f44336';
      case 'WARN':
      case 'WARNING':
        return '#ff9800';
      case 'INFO':
      case 'SUCCESS':
        return '#4caf50';
      case 'DEBUG':
        return '#2196f3';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'system':
        return '#9c27b0';
      case 'api':
        return '#2196f3';
      case 'tally-sync':
        return '#ff9800';
      default:
        return 'var(--text-secondary)';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '24px', color: 'var(--text-primary)' }}>
          Log Viewer - {logType === 'all' ? 'All Logs' : logType.toUpperCase()}
        </h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '13px'
            }}
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <input
            type="text"
            placeholder="Search logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              width: '200px',
              fontSize: '13px'
            }}
          />
          <button
            onClick={fetchLogs}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Log Table */}
      <div style={{
        flex: 1,
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        overflow: 'auto'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No logs found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-tertiary)', zIndex: 10 }}>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600 }}>Timestamp</th>
                <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600 }}>Level</th>
                <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600 }}>Message</th>
                <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600 }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr 
                  key={log.id} 
                  style={{ 
                    borderBottom: '1px solid var(--border-color)',
                    background: log.level === 'ERROR' ? 'rgba(244, 67, 54, 0.05)' : 'transparent'
                  }}
                >
                  <td style={{ padding: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px' }}>
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontWeight: 500,
                      background: getTypeColor(log.type) + '20',
                      color: getTypeColor(log.type)
                    }}>
                      {log.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontWeight: 500,
                      background: getLevelColor(log.level) + '20',
                      color: getLevelColor(log.level)
                    }}>
                      {log.level}
                    </span>
                  </td>
                  <td style={{ padding: '10px', color: 'var(--text-primary)', maxWidth: '400px', wordBreak: 'break-word' }}>
                    {log.message}
                  </td>
                  <td style={{ padding: '10px', color: 'var(--text-secondary)', fontSize: '11px' }}>
                    {log.status_code && (
                      <div>Status: {log.status_code}</div>
                    )}
                    {log.duration_ms && (
                      <div>Duration: {log.duration_ms}ms</div>
                    )}
                    {log.entity_type && (
                      <div>Entity: {log.entity_type}</div>
                    )}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details style={{ cursor: 'pointer' }}>
                        <summary style={{ color: 'var(--text-primary)' }}>View Details</summary>
                        <pre style={{
                          marginTop: '4px',
                          padding: '8px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '4px',
                          fontSize: '10px',
                          overflow: 'auto',
                          maxHeight: '200px'
                        }}>
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
