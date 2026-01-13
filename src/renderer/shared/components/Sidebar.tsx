// src/renderer/shared/components/Sidebar.tsx
import React from 'react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '◉' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    // { id: 'customers', label: 'Customers', icon: '○' },
    // { id: 'invoices', label: 'Invoices', icon: '◐' },
    // { id: 'payments', label: 'Payments', icon: '◑' },
    { id: 'logs', label: 'Logs', icon: '📋' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  return (
    <div style={{
      width: '220px',
      background: 'var(--bg-secondary)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border-color)',
      paddingTop: '8px'
    }}>
      {menuItems.map(item => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: currentPage === item.id ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none',
            color: currentPage === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '14px',
            borderLeft: currentPage === item.id ? '3px solid #007acc' : '3px solid transparent',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (currentPage !== item.id) {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }
          }}
          onMouseLeave={(e) => {
            if (currentPage !== item.id) {
              e.currentTarget.style.background = 'transparent';
            }
          }}
        >
          <span style={{ 
            fontSize: '16px', 
            width: '20px', 
            display: 'inline-block',
            textAlign: 'center',
            fontFamily: 'Segoe UI, sans-serif'
          }}>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
};
