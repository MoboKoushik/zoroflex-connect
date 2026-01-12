// src/renderer/shared/components/TitleBar.tsx
import React, { useEffect, useState } from 'react';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;
    
    // Check initial state
    if (window.electronAPI.windowIsMaximized) {
      window.electronAPI.windowIsMaximized().then(setIsMaximized);
    }

    // Listen for maximize/unmaximize events
    if (window.electronAPI.onWindowMaximized) {
      window.electronAPI.onWindowMaximized(() => setIsMaximized(true));
    }
    if (window.electronAPI.onWindowUnmaximized) {
      window.electronAPI.onWindowUnmaximized(() => setIsMaximized(false));
    }

    return () => {
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners('window-maximized');
        window.electronAPI.removeAllListeners('window-unmaximized');
      }
    };
  }, []);

  const handleMinimize = async () => {
    if (window.electronAPI?.windowMinimize) {
      await window.electronAPI.windowMinimize();
    }
  };

  const handleMaximize = async () => {
    if (window.electronAPI?.windowMaximize) {
      await window.electronAPI.windowMaximize();
    }
  };

  const handleClose = async () => {
    if (window.electronAPI?.windowClose) {
      await window.electronAPI.windowClose();
    }
  };

  return (
    <div className="title-bar" style={{
      height: '32px',
      background: 'var(--bg-titlebar, var(--bg-secondary))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 8px',
      userSelect: 'none',
      // @ts-ignore - WebkitAppRegion is a valid Electron CSS property
      WebkitAppRegion: 'drag',
      color: 'var(--text-primary)',
      fontSize: '13px',
      fontWeight: 400,
      borderBottom: '1px solid var(--border-color)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>Zorrofin Connect</span>
      </div>
      <div style={{ 
        display: 'flex', 
        // @ts-ignore - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'no-drag',
        gap: '1px'
      }}>
        <button
          onClick={handleMinimize}
          style={{
            width: '46px',
            height: '32px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          −
        </button>
        <button
          onClick={handleMaximize}
          style={{
            width: '46px',
            height: '32px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {isMaximized ? '❐' : '□'}
        </button>
        <button
          onClick={handleClose}
          style={{
            width: '46px',
            height: '32px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#e81123'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          ×
        </button>
      </div>
    </div>
  );
};
