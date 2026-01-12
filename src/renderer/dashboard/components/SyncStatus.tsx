// src/renderer/dashboard/components/SyncStatus.tsx
import React from 'react';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';

interface SyncStatusProps {
  isRunning: boolean;
  status: string;
  progress?: number;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ isRunning, status, progress }) => {
  return (
    <div className="card">
      <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-primary)' }}>Sync Status</h2>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {isRunning ? (
          <>
            <LoadingSpinner size={24} />
            <span style={{ color: '#007acc', fontSize: '14px' }}>Syncing...</span>
          </>
        ) : (
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: '#4caf50'
          }} />
        )}
        <span style={{ color: isRunning ? '#007acc' : '#4caf50', fontSize: '14px' }}>
          {isRunning ? 'Sync in progress' : 'Ready'}
        </span>
      </div>
      
      {status && (
        <div style={{ 
          padding: '8px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          fontSize: '13px',
          color: 'var(--text-primary)'
        }}>
          {status}
        </div>
      )}
      
      {progress !== undefined && progress > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{
            width: '100%',
            height: '8px',
            background: 'var(--border-color)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: '#007acc',
              transition: 'width 0.3s'
            }} />
          </div>
          <div style={{ 
            marginTop: '4px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            textAlign: 'right'
          }}>
            {progress}%
          </div>
        </div>
      )}
    </div>
  );
};
