// src/renderer/dashboard/components/SyncControls.tsx
import React, { useState } from 'react';

interface SyncControlsProps {
  onSyncStart: (type: 'full' | 'smart') => void;
  onSyncComplete: () => void;
}

export const SyncControls: React.FC<SyncControlsProps> = ({ onSyncStart, onSyncComplete }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncType, setSyncType] = useState<'full' | 'smart' | null>(null);

  const handleSync = async (type: 'full' | 'smart') => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncType(type);
    onSyncStart(type);

    try {
      if (!window.electronAPI) {
        alert('Electron API not available');
        return;
      }
      
      let result;
      if (type === 'full') {
        // Full Fresh Sync - সব entity-র জন্য fresh sync
        result = window.electronAPI.forceFullFreshSync 
          ? await window.electronAPI.forceFullFreshSync() 
          : { success: false, error: 'Method not available' };
      } else if (type === 'smart') {
        // Manual Sync - Smart sync (per-entity status check করে)
        result = window.electronAPI.manualSync 
          ? await window.electronAPI.manualSync() 
          : { success: false, error: 'Method not available' };
      } else {
        result = { success: false, error: 'Invalid sync type' };
      }

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
          {isSyncing && syncType === 'full' ? 'Syncing...' : 'Full Fresh Sync'}
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
            All entities fresh sync
          </div>
        </button>
        
        <button
          onClick={() => handleSync('smart')}
          disabled={isSyncing}
          className="btn btn-secondary"
          style={{
            flex: 1,
            opacity: isSyncing && syncType !== 'smart' ? 0.5 : 1,
            cursor: isSyncing && syncType !== 'smart' ? 'not-allowed' : 'pointer'
          }}
        >
          {isSyncing && syncType === 'smart' ? 'Syncing...' : 'Manual Sync'}
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
            Smart sync (per entity)
          </div>
        </button>
      </div>
    </div>
  );
};
