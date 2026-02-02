// src/renderer/dashboard/components/SyncStats.tsx
import React, { useEffect, useState } from "react";

interface EntitySyncInfo {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  lastSyncTime: string | null;
  lastSyncCount: number;
  previousSyncTime: string | null;
  previousSyncCount: number;
  totalCount: number;
}

interface SyncStatsProps {
  customers: number;
  invoices: number;
  payments: number;
  journalVouchers: number;
  debitNotes: number;
}

// SVG Icons
const icons = {
  ledger: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  invoice: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  ),
  receipt: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  journal: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  debitNote: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
};

export const SyncStats: React.FC<SyncStatsProps> = ({
  customers,
  invoices,
  payments,
  journalVouchers,
  debitNotes,
}) => {
  const [syncInfo, setSyncInfo] = useState<EntitySyncInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const defaultStats: EntitySyncInfo[] = [
    { label: "Ledger", icon: icons.ledger, color: "#059669", bgColor: "#d1fae5", lastSyncTime: null, lastSyncCount: 0, previousSyncTime: null, previousSyncCount: 0, totalCount: customers },
    { label: "Invoice/Voucher", icon: icons.invoice, color: "#0078d4", bgColor: "#e6f2ff", lastSyncTime: null, lastSyncCount: 0, previousSyncTime: null, previousSyncCount: 0, totalCount: invoices },
    { label: "Receipt", icon: icons.receipt, color: "#d97706", bgColor: "#fef3c7", lastSyncTime: null, lastSyncCount: 0, previousSyncTime: null, previousSyncCount: 0, totalCount: payments },
    { label: "Journal Voucher", icon: icons.journal, color: "#7c3aed", bgColor: "#ede9fe", lastSyncTime: null, lastSyncCount: 0, previousSyncTime: null, previousSyncCount: 0, totalCount: journalVouchers },
    { label: "Debit Note", icon: icons.debitNote, color: "#db2777", bgColor: "#fce7f3", lastSyncTime: null, lastSyncCount: 0, previousSyncTime: null, previousSyncCount: 0, totalCount: debitNotes },
  ];

  useEffect(() => {
    loadSyncInfo();
    const interval = setInterval(loadSyncInfo, 10000);
    return () => clearInterval(interval);
  }, [customers, invoices, payments, journalVouchers, debitNotes]);

  const loadSyncInfo = async () => {
    try {
      if (!window.electronAPI?.getEntitySyncInfo) {
        setSyncInfo(defaultStats);
        setLoading(false);
        return;
      }

      const info = await window.electronAPI.getEntitySyncInfo();
      if (info) {
        setSyncInfo([
          { ...defaultStats[0], lastSyncTime: info.ledger?.lastSyncTime || null, lastSyncCount: info.ledger?.lastSyncCount || 0, previousSyncTime: info.ledger?.previousSyncTime || null, previousSyncCount: info.ledger?.previousSyncCount || 0, totalCount: info.ledger?.totalCount || customers },
          { ...defaultStats[1], lastSyncTime: info.invoice?.lastSyncTime || null, lastSyncCount: info.invoice?.lastSyncCount || 0, previousSyncTime: info.invoice?.previousSyncTime || null, previousSyncCount: info.invoice?.previousSyncCount || 0, totalCount: info.invoice?.totalCount || invoices },
          { ...defaultStats[2], lastSyncTime: info.payment?.lastSyncTime || null, lastSyncCount: info.payment?.lastSyncCount || 0, previousSyncTime: info.payment?.previousSyncTime || null, previousSyncCount: info.payment?.previousSyncCount || 0, totalCount: info.payment?.totalCount || payments },
          { ...defaultStats[3], lastSyncTime: info.journal?.lastSyncTime || null, lastSyncCount: info.journal?.lastSyncCount || 0, previousSyncTime: info.journal?.previousSyncTime || null, previousSyncCount: info.journal?.previousSyncCount || 0, totalCount: info.journal?.totalCount || journalVouchers },
          { ...defaultStats[4], lastSyncTime: info.debitNote?.lastSyncTime || null, lastSyncCount: info.debitNote?.lastSyncCount || 0, previousSyncTime: info.debitNote?.previousSyncTime || null, previousSyncCount: info.debitNote?.previousSyncCount || 0, totalCount: info.debitNote?.totalCount || debitNotes },
        ]);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error loading sync info:", error);
      setSyncInfo(defaultStats);
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "Never synced";
    try {
      let date: Date;
      if (dateString.includes("T") || dateString.includes("Z")) {
        date = new Date(dateString);
      } else {
        date = new Date(dateString.replace(" ", "T") + "Z");
      }
      return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (error) {
      return "Invalid date";
    }
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      let date: Date;
      if (dateString.includes("T") || dateString.includes("Z")) {
        date = new Date(dateString);
      } else {
        date = new Date(dateString.replace(" ", "T") + "Z");
      }
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return formatDateTime(dateString);
    } catch (error) {
      return "Invalid date";
    }
  };

  if (loading && syncInfo.length === 0) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '20px',
            border: '1px solid var(--border-light)',
            minHeight: '160px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div className="spinner" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
      {syncInfo.map((stat) => (
        <div key={stat.label} style={{
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          padding: '20px',
          border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          cursor: 'default'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: stat.bgColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: stat.color
            }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: stat.color, lineHeight: 1.1 }}>
                {stat.totalCount.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border-light)', margin: '12px 0' }} />

          {/* Last Sync Info */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                Last Sync
              </span>
              <span style={{ fontSize: '11px', color: stat.lastSyncTime ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {formatTimeAgo(stat.lastSyncTime)}
              </span>
            </div>
            {stat.lastSyncCount > 0 && (
              <div style={{
                fontSize: '12px',
                color: stat.color,
                fontWeight: 500,
                background: stat.bgColor,
                padding: '4px 8px',
                borderRadius: '4px',
                display: 'inline-block',
                marginTop: '4px'
              }}>
                +{stat.lastSyncCount.toLocaleString()} synced
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
