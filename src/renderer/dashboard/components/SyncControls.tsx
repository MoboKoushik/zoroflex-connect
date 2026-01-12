// src/renderer/dashboard/components/SyncControls.tsx
import React, { useState } from 'react';

interface SyncControlsProps {
  onSyncStart: (type: 'full' | 'fresh') => void;
  onSyncComplete: () => void;
}

export const SyncControls: React.FC<SyncControlsProps> = ({ onSyncStart, onSyncComplete }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncType, setSyncType] = useState<'full' | 'fresh' | null>(null);

  const handleSync = async (type: 'full' | 'fresh') => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncType(type);
    onSyncStart(type);

    try {
      if (!window.electronAPI) {
        alert('Electron API not available');
        return;
      }
      const result = type === 'full'
        ? (window.electronAPI.forceFullSync ? await window.electronAPI.forceFullSync() : { success: false, error: 'Method not available' })
        : (window.electronAPI.forceFreshSync ? await window.electronAPI.forceFreshSync() : { success: false, error: 'Method not available' });

      if (!result?.success) {
        alert(`Sync failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert(`Sync error: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
      setSyncType(null);
      onSyncComplete();
    }
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-primary)' }}>Sync Controls</h2>
      
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => handleSync('full')}
          disabled={isSyncing}
          className="btn btn-primary"
          style={{
            flex: 1,
            opacity: isSyncing && syncType !== 'full' ? 0.5 : 1,
            cursor: isSyncing && syncType !== 'full' ? 'not-allowed' : 'pointer'
          }}
        >
          {isSyncing && syncType === 'full' ? 'Syncing...' : 'Force Full Sync'}
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
            From BOOKSTARTFROM
          </div>
        </button>
        
        <button
          onClick={() => handleSync('fresh')}
          disabled={isSyncing}
          className="btn btn-secondary"
          style={{
            flex: 1,
            opacity: isSyncing && syncType !== 'fresh' ? 0.5 : 1,
            cursor: isSyncing && syncType !== 'fresh' ? 'not-allowed' : 'pointer'
          }}
        >
          {isSyncing && syncType === 'fresh' ? 'Syncing...' : 'Force Fresh Sync'}
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
            From last sync + 1
          </div>
        </button>
      </div>
    </div>
  );
};
