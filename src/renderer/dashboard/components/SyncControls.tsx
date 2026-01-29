// src/renderer/dashboard/components/SyncControls.tsx
import React, { useState, useEffect, useCallback } from 'react';

interface SyncControlsProps {
  onSyncStart: (type: 'full' | 'smart' | 'entity') => void;
  onSyncComplete: () => void;
}

interface SyncResult {
  success: boolean;
  error?: string;
}

type EntityType = 'CUSTOMER' | 'INVOICE' | 'PAYMENT' | 'JOURNAL' | 'DEBITNOTE';

export const SyncControls: React.FC<SyncControlsProps> = ({ onSyncStart, onSyncComplete }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncType, setSyncType] = useState<'full' | 'smart' | EntityType | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Listen for sync-completed event from main process
  useEffect(() => {
    const handleSyncCompleted = (_event: any, data?: { error?: string; entityType?: string }) => {
      setIsSyncing(false);
      setSyncType(null);

      if (data?.error) {
        setSyncMessage({ type: 'error', text: `Sync failed: ${data.error}` });
      } else {
        const entityMsg = data?.entityType ? ` (${data.entityType})` : '';
        setSyncMessage({ type: 'success', text: `Sync completed successfully!${entityMsg}` });
      }

      onSyncComplete();

      // Clear message after 5 seconds
      setTimeout(() => setSyncMessage(null), 5000);
    };

    // Subscribe to sync-completed event
    window.electronAPI?.onSyncCompleted?.(handleSyncCompleted);

    // Cleanup listener on unmount
    return () => {
      window.electronAPI?.removeSyncCompletedListener?.(handleSyncCompleted);
    };
  }, [onSyncComplete]);

  const handleSync = useCallback(async (type: 'full' | 'smart') => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncType(type);
    setSyncMessage(null);
    onSyncStart(type);

    try {
      if (!window.electronAPI) {
        setSyncMessage({ type: 'error', text: 'Electron API not available' });
        setIsSyncing(false);
        setSyncType(null);
        return;
      }

      let result: SyncResult;
      if (type === 'full') {
        result = window.electronAPI.forceFullFreshSync
          ? await window.electronAPI.forceFullFreshSync()
          : { success: false, error: 'Method not available' };
      } else if (type === 'smart') {
        result = window.electronAPI.manualSync
          ? await window.electronAPI.manualSync()
          : { success: false, error: 'Method not available' };
      } else {
        result = { success: false, error: 'Invalid sync type' };
      }

      if (!result?.success && result?.error !== 'Sync initiated') {
        setSyncMessage({ type: 'error', text: `Sync failed: ${result?.error || 'Unknown error'}` });
        setIsSyncing(false);
        setSyncType(null);
      }
    } catch (error: any) {
      setSyncMessage({ type: 'error', text: `Sync error: ${error.message || 'Unknown error'}` });
      setIsSyncing(false);
      setSyncType(null);
    }
  }, [isSyncing, onSyncStart]);

  const handleEntitySync = useCallback(async (entityType: EntityType) => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncType(entityType);
    setSyncMessage(null);
    onSyncStart('entity');

    try {
      if (!window.electronAPI?.syncEntity) {
        setSyncMessage({ type: 'error', text: 'Entity sync not available' });
        setIsSyncing(false);
        setSyncType(null);
        return;
      }

      const result: SyncResult = await window.electronAPI.syncEntity(entityType);

      if (!result?.success) {
        setSyncMessage({ type: 'error', text: `${entityType} sync failed: ${result?.error || 'Unknown error'}` });
        setIsSyncing(false);
        setSyncType(null);
      }
    } catch (error: any) {
      setSyncMessage({ type: 'error', text: `${entityType} sync error: ${error.message || 'Unknown error'}` });
      setIsSyncing(false);
      setSyncType(null);
    }
  }, [isSyncing, onSyncStart]);

  const entityButtons: { type: EntityType; label: string; color: string }[] = [
    { type: 'CUSTOMER', label: 'Customer', color: '#3b82f6' },
    { type: 'INVOICE', label: 'Invoice', color: '#10b981' },
    { type: 'PAYMENT', label: 'Payment', color: '#f59e0b' },
    { type: 'JOURNAL', label: 'Journal', color: '#8b5cf6' },
    { type: 'DEBITNOTE', label: 'Debit Note', color: '#ec4899' },
  ];

  return (
    <div className="card">
      <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-primary)' }}>Sync Controls</h2>

      {/* Sync message notification */}
      {syncMessage && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: '16px',
            borderRadius: '6px',
            backgroundColor: syncMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${syncMessage.type === 'success' ? '#22c55e' : '#ef4444'}`,
            color: syncMessage.type === 'success' ? '#22c55e' : '#ef4444',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>{syncMessage.text}</span>
          <button
            onClick={() => setSyncMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: '0 4px',
              fontSize: '18px',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Main sync buttons */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <button
          onClick={() => handleSync('full')}
          disabled={isSyncing}
          className="btn btn-primary"
          style={{
            flex: 1,
            opacity: isSyncing && syncType !== 'full' ? 0.5 : 1,
            cursor: isSyncing ? 'not-allowed' : 'pointer'
          }}
        >
          {isSyncing && syncType === 'full' ? 'Syncing...' : 'Full Fresh Sync'}
          <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
            All entities fresh
          </div>
        </button>

        <button
          onClick={() => handleSync('smart')}
          disabled={isSyncing}
          className="btn btn-secondary"
          style={{
            flex: 1,
            opacity: isSyncing && syncType !== 'smart' ? 0.5 : 1,
            cursor: isSyncing ? 'not-allowed' : 'pointer'
          }}
        >
          {isSyncing && syncType === 'smart' ? 'Syncing...' : 'Smart Sync'}
          <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
            Auto (first/incremental)
          </div>
        </button>
      </div>

      {/* Entity-specific sync buttons */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Entity-Specific Sync
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          {entityButtons.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => handleEntitySync(type)}
              disabled={isSyncing}
              style={{
                padding: '10px 8px',
                borderRadius: '6px',
                border: `1px solid ${color}40`,
                backgroundColor: syncType === type ? `${color}20` : 'transparent',
                color: color,
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                opacity: isSyncing && syncType !== type ? 0.5 : 1,
                fontSize: '13px',
                fontWeight: 500,
                transition: 'all 0.2s ease'
              }}
            >
              {isSyncing && syncType === type ? '...' : label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
