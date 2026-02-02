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
      height: '36px',
      background: 'var(--bg-secondary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      userSelect: 'none',
      // @ts-ignore - WebkitAppRegion is a valid Electron CSS property
      WebkitAppRegion: 'drag',
      color: 'var(--text-primary)',
      fontSize: '13px',
      fontWeight: 400,
      borderBottom: '1px solid var(--border-light)',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* App Icon */}
        <div style={{
          width: '18px',
          height: '18px',
          background: 'linear-gradient(135deg, #0078d4 0%, #00bcf2 100%)',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '10px',
          fontWeight: 600
        }}>
          Z
        </div>
        <span style={{ fontWeight: 500 }}>Zorrofin Connect</span>
      </div>
      <div style={{
        display: 'flex',
        // @ts-ignore - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'no-drag',
        gap: '0px',
        marginRight: '-12px'
      }}>
        <button
          onClick={handleMinimize}
          style={{
            width: '46px',
            height: '36px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            transition: 'background 0.1s ease, color 0.1s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          title="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          style={{
            width: '46px',
            height: '36px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            transition: 'background 0.1s ease, color 0.1s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M2 0h6v6H2z M0 2v6h6" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          )}
        </button>
        <button
          onClick={handleClose}
          style={{
            width: '46px',
            height: '36px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            transition: 'background 0.1s ease, color 0.1s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e81123';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M0 0L10 10M10 0L0 10" />
          </svg>
        </button>
      </div>
    </div>
  );
};
