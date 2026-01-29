// src/renderer/dashboard/components/SyncStats.tsx
import React, { useEffect, useState } from "react";

interface EntitySyncInfo {
  label: string;
  icon: string;
  color: string;
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

export const SyncStats: React.FC<SyncStatsProps> = ({
  customers,
  invoices,
  payments,
  journalVouchers,
  debitNotes,
}) => {
  const [syncInfo, setSyncInfo] = useState<EntitySyncInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSyncInfo();
    const interval = setInterval(loadSyncInfo, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [customers, invoices, payments, journalVouchers, debitNotes]);

  const loadSyncInfo = async () => {
    try {
      if (!window.electronAPI?.getEntitySyncInfo) {
        // Fallback to basic display if method not available
        setSyncInfo([
          {
            label: "Ledger",
            icon: "👥",
            color: "#4caf50",
            lastSyncTime: null,
            lastSyncCount: 0,
            previousSyncTime: null,
            previousSyncCount: 0,
            totalCount: customers,
          },
          {
            label: "Invoice/Voucher",
            icon: "📄",
            color: "#2196f3",
            lastSyncTime: null,
            lastSyncCount: 0,
            previousSyncTime: null,
            previousSyncCount: 0,
            totalCount: invoices,
          },
          {
            label: "Receipt",
            icon: "💰",
            color: "#ff9800",
            lastSyncTime: null,
            lastSyncCount: 0,
            previousSyncTime: null,
            previousSyncCount: 0,
            totalCount: payments,
          },
          {
            label: "Journal Voucher",
            icon: "📝",
            color: "#9c27b0",
            lastSyncTime: null,
            lastSyncCount: 0,
            previousSyncTime: null,
            previousSyncCount: 0,
            totalCount: journalVouchers,
          },
          {
            label: "Debit Note",
            icon: "📋",
            color: "#ec4899",
            lastSyncTime: null,
            lastSyncCount: 0,
            previousSyncTime: null,
            previousSyncCount: 0,
            totalCount: debitNotes,
          },
        ]);
        setLoading(false);
        return;
      }

      const info = await window.electronAPI.getEntitySyncInfo();
      console.log("Entity Sync Info:", info);
      if (info) {
        console.log("Ledger totalCount:", info.ledger?.totalCount);
        console.log("Invoice totalCount:", info.invoice?.totalCount);
        console.log("Payment totalCount:", info.payment?.totalCount);
        setSyncInfo([
          {
            label: "Ledger",
            icon: "👥",
            color: "#4caf50",
            lastSyncTime: info.ledger?.lastSyncTime || null,
            lastSyncCount: info.ledger?.lastSyncCount || 0,
            previousSyncTime: info.ledger?.previousSyncTime || null,
            previousSyncCount: info.ledger?.previousSyncCount || 0,
            totalCount: info.ledger?.totalCount || customers, // Use from API, fallback to props
          },
          {
            label: "Invoice/Voucher",
            icon: "📄",
            color: "#2196f3",
            lastSyncTime: info.invoice?.lastSyncTime || null,
            lastSyncCount: info.invoice?.lastSyncCount || 0,
            previousSyncTime: info.invoice?.previousSyncTime || null,
            previousSyncCount: info.invoice?.previousSyncCount || 0,
            totalCount: info.invoice?.totalCount || invoices, // Use from API, fallback to props
          },
          {
            label: "Receipt",
            icon: "💰",
            color: "#ff9800",
            lastSyncTime: info.payment?.lastSyncTime || null,
            lastSyncCount: info.payment?.lastSyncCount || 0,
            previousSyncTime: info.payment?.previousSyncTime || null,
            previousSyncCount: info.payment?.previousSyncCount || 0,
            totalCount: info.payment?.totalCount || payments, // Use from API, fallback to props
          },
          {
            label: "Journal Voucher",
            icon: "📝",
            color: "#9c27b0",
            lastSyncTime: info.journal?.lastSyncTime || null,
            lastSyncCount: info.journal?.lastSyncCount || 0,
            previousSyncTime: info.journal?.previousSyncTime || null,
            previousSyncCount: info.journal?.previousSyncCount || 0,
            totalCount: info.journal?.totalCount || journalVouchers, // Use from API, fallback to props
          },
          {
            label: "Debit Note",
            icon: "📋",
            color: "#ec4899",
            lastSyncTime: info.debitNote?.lastSyncTime || null,
            lastSyncCount: info.debitNote?.lastSyncCount || 0,
            previousSyncTime: info.debitNote?.previousSyncTime || null,
            previousSyncCount: info.debitNote?.previousSyncCount || 0,
            totalCount: info.debitNote?.totalCount || debitNotes, // Use from API, fallback to props
          },
        ]);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error loading sync info:", error);
      // Fallback to basic display on error
      setSyncInfo([
        {
          label: "Ledger",
          icon: "👥",
          color: "#4caf50",
          lastSyncTime: null,
          lastSyncCount: 0,
          previousSyncTime: null,
          previousSyncCount: 0,
          totalCount: customers,
        },
        {
          label: "Invoice/Voucher",
          icon: "📄",
          color: "#2196f3",
          lastSyncTime: null,
          lastSyncCount: 0,
          previousSyncTime: null,
          previousSyncCount: 0,
          totalCount: invoices,
        },
        {
          label: "Receipt",
          icon: "💰",
          color: "#ff9800",
          lastSyncTime: null,
          lastSyncCount: 0,
          previousSyncTime: null,
          previousSyncCount: 0,
          totalCount: payments,
        },
        {
          label: "Journal Voucher",
          icon: "📝",
          color: "#9c27b0",
          lastSyncTime: null,
          lastSyncCount: 0,
          previousSyncTime: null,
          previousSyncCount: 0,
          totalCount: journalVouchers,
        },
        {
          label: "Debit Note",
          icon: "📋",
          color: "#ec4899",
          lastSyncTime: null,
          lastSyncCount: 0,
          previousSyncTime: null,
          previousSyncCount: 0,
          totalCount: debitNotes,
        },
      ]);
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      // SQLite datetime format is "YYYY-MM-DD HH:MM:SS" (UTC)
      // JavaScript Date() interprets this as local time, so we need to explicitly treat it as UTC
      let date: Date;
      if (dateString.includes("T") || dateString.includes("Z")) {
        // Already in ISO format
        date = new Date(dateString);
      } else {
        // SQLite format: "YYYY-MM-DD HH:MM:SS" - treat as UTC
        // Replace space with 'T' and add 'Z' to indicate UTC
        date = new Date(dateString.replace(" ", "T") + "Z");
      }

      // Convert to Indian timezone and format
      return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return "Invalid date";
    }
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      // SQLite datetime format is "YYYY-MM-DD HH:MM:SS" (UTC)
      // JavaScript Date() interprets this as local time, so we need to explicitly treat it as UTC
      let date: Date;
      if (dateString.includes("T") || dateString.includes("Z")) {
        // Already in ISO format
        date = new Date(dateString);
      } else {
        // SQLite format: "YYYY-MM-DD HH:MM:SS" - treat as UTC
        // Replace space with 'T' and add 'Z' to indicate UTC
        date = new Date(dateString.replace(" ", "T") + "Z");
      }

      const now = new Date();

      // Calculate difference - both dates are in UTC internally
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffHours < 24)
        return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

      // For older dates, show formatted date in Indian timezone
      return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (error) {
      console.error("Error formatting time ago:", dateString, error);
      return "Invalid date";
    }
  };

  if (loading && syncInfo.length === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "16px",
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="card"
            style={{
              textAlign: "center",
              minHeight: "200px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              Loading...
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: "16px",
      }}
    >
      {syncInfo.map((stat) => (
        <div key={stat.label} className="card" style={{ padding: "20px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>
              {stat.icon}
            </div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "4px",
              }}
            >
              {stat.label}
            </div>
            <div
              style={{ fontSize: "24px", fontWeight: 700, color: stat.color }}
            >
              {stat.totalCount.toLocaleString()}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginTop: "4px",
              }}
            >
              Total Records
            </div>
          </div>

          <div
            style={{
              height: "1px",
              background: "var(--border-color)",
              margin: "16px 0",
            }}
          />

          {/* Last Sync */}
          <div style={{ marginBottom: "12px" }}>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                marginBottom: "4px",
                fontWeight: 500,
              }}
            >
              LAST SYNC
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "var(--text-primary)",
                marginBottom: "2px",
              }}
            >
              {formatTimeAgo(stat.lastSyncTime)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              {formatDateTime(stat.lastSyncTime)}
            </div>
            {stat.lastSyncCount > 0 && (
              <div
                style={{
                  fontSize: "12px",
                  color: stat.color,
                  marginTop: "4px",
                  fontWeight: 500,
                }}
              >
                {stat.lastSyncCount.toLocaleString()} synced
              </div>
            )}
          </div>

          {/* Previous Sync */}
          {stat.previousSyncTime && (
            <>
              <div
                style={{
                  height: "1px",
                  background: "var(--border-color)",
                  margin: "12px 0",
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                    marginBottom: "4px",
                    fontWeight: 500,
                  }}
                >
                  PREVIOUS SYNC
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    marginBottom: "2px",
                  }}
                >
                  {formatTimeAgo(stat.previousSyncTime)}
                </div>
                <div
                  style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                >
                  {formatDateTime(stat.previousSyncTime)}
                </div>
                {stat.previousSyncCount > 0 && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginTop: "4px",
                    }}
                  >
                    {stat.previousSyncCount.toLocaleString()} synced
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};
