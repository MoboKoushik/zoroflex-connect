// src/renderer/dashboard/components/SyncStats.tsx
import React from 'react';

interface SyncStatsProps {
  customers: number;
  invoices: number;
  payments: number;
}

export const SyncStats: React.FC<SyncStatsProps> = ({ customers, invoices, payments }) => {
  const stats = [
    { label: 'Customers', value: customers, icon: '👥', color: '#4caf50' },
    { label: 'Invoices', value: invoices, icon: '📄', color: '#2196f3' },
    { label: 'Payments', value: payments, icon: '💰', color: '#ff9800' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
      {stats.map(stat => (
        <div key={stat.label} className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{stat.icon}</div>
          <div style={{ 
            fontSize: '28px', 
            fontWeight: 600, 
            color: stat.color,
            marginBottom: '4px'
          }}>
            {stat.value.toLocaleString()}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{stat.label}</div>
        </div>
      ))}
    </div>
  );
};
