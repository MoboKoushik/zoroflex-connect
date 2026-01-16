// src/renderer/dashboard/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { CompanyInfo } from "./components/CompanyInfo";
import { SyncStatus } from "./components/SyncStatus";
import { SyncStats } from "./components/SyncStats";
import { RecentLogs } from "./components/RecentLogs";
import { SyncControls } from "./components/SyncControls";
import { Settings } from "./components/Settings";
import { StagingCustomers } from "./components/StagingCustomers";
import { StagingInvoices } from "./components/StagingInvoices";
import { StagingPayments } from "./components/StagingPayments";
import { StagingJournalVouchers } from "./components/StagingJournalVouchers";
import { Analytics } from "./components/Analytics";
import { LogViewer } from "./components/LogViewer";
import { StatusBar } from "./components/StatusBar";
import { Sidebar } from "../shared/components/Sidebar";
import { TitleBar } from "../shared/components/TitleBar";
import { Toast } from "../shared/components/Toast";

export const Dashboard: React.FC = () => {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [logType, setLogType] = useState<
    "system" | "api" | "tally-sync" | "all"
  >("all");
  const [company, setCompany] = useState<any>(null);
  const [stats, setStats] = useState({
    customers: 0,
    invoices: 0,
    payments: 0,
    journalVouchers: 0,
  });
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Ready");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null>(null);

  useEffect(() => {
    loadData();

    // Listen for sync events
    if (window.electronAPI?.onSyncStarted) {
      window.electronAPI.onSyncStarted((data: any) => {
        setIsSyncing(true);
        setSyncStatus("Sync started...");
      });
    }

    if (window.electronAPI?.onSyncCompleted) {
      window.electronAPI.onSyncCompleted((data: any) => {
        setIsSyncing(false);
        setSyncStatus(
          data?.error ? `Sync failed: ${data.error}` : "Sync completed"
        );
        if (!data?.error) {
          setToast({ message: "Sync completed successfully", type: "success" });
          loadData(); // Reload data after sync
        } else {
          setToast({ message: `Sync failed: ${data.error}`, type: "error" });
        }
      });
    }

    return () => {
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners("sync-started");
        window.electronAPI.removeAllListeners("sync-completed");
      }
    };
  }, []);

  const loadData = async () => {
    try {
      if (!window.electronAPI) {
        console.error("Electron API not available");
        return;
      }
      const [companyData, statsData, logsData, analytics] = await Promise.all([
        window.electronAPI.getActiveCompany?.() || Promise.resolve(null),
        window.electronAPI.getDashboardStats?.() || Promise.resolve(null),
        window.electronAPI.getRecentSyncLogs?.() || Promise.resolve([]),
        window.electronAPI.getAnalytics?.() || Promise.resolve(null),
      ]);

      if (companyData) setCompany(companyData);
      if (statsData) {
        setStats({
          customers: statsData.totalCustomers || 0,
          invoices: statsData.invoiceCount || 0,
          payments: statsData.receiptCount || 0,
          journalVouchers: statsData.jvCount || 0,
        });
      }
      if (logsData) setLogs(logsData);
      if (analytics) {
        setAnalyticsData(analytics);
        setAnalyticsLoading(false);
      }
    } catch (error: any) {
      console.error("Error loading dashboard data:", error);
    }
  };

  const handleSyncStart = (type: "full" | "smart") => {
    setIsSyncing(true);
    const syncTypeLabel = type === "full" ? "full fresh" : "smart";
    setSyncStatus(`Starting ${syncTypeLabel} sync...`);
  };

  const handleSyncComplete = () => {
    setIsSyncing(false);
    loadData();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <TitleBar />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            background: "var(--bg-primary)",
          }}
        >
          {currentPage === "dashboard" && (
            <>
              <h1
                style={{
                  fontSize: "28px",
                  marginBottom: "24px",
                  color: "var(--text-primary)",
                }}
              >
                Dashboard
              </h1>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <CompanyInfo company={company} />

                <StatusBar />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "20px",
                  }}
                >
                  <SyncStatus isRunning={isSyncing} status={syncStatus} />
                  <SyncControls
                    onSyncStart={handleSyncStart}
                    onSyncComplete={handleSyncComplete}
                  />
                </div>

                <SyncStats
                  customers={stats.customers}
                  invoices={stats.invoices}
                  payments={stats.payments}
                  journalVouchers={stats.journalVouchers}
                />

                <RecentLogs logs={logs} />
              </div>
            </>
          )}

          {currentPage === "customers" && <StagingCustomers />}

          {currentPage === "invoices" && <StagingInvoices />}

          {currentPage === "payments" && <StagingPayments />}

          {currentPage === "journal-vouchers" && <StagingJournalVouchers />}

          {currentPage === "analytics" && (
            <Analytics data={analyticsData} loading={analyticsLoading} />
          )}

          {currentPage === "logs" && (
            <div
              style={{
                height: "calc(100vh - 120px)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{ display: "flex", gap: "8px", marginBottom: "16px" }}
              >
                <button
                  onClick={() => setLogType("all")}
                  style={{
                    padding: "8px 16px",
                    background:
                      logType === "all"
                        ? "var(--bg-tertiary)"
                        : "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  All Logs
                </button>
                <button
                  onClick={() => setLogType("system")}
                  style={{
                    padding: "8px 16px",
                    background:
                      logType === "system"
                        ? "var(--bg-tertiary)"
                        : "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  System Logs
                </button>
                <button
                  onClick={() => setLogType("api")}
                  style={{
                    padding: "8px 16px",
                    background:
                      logType === "api"
                        ? "var(--bg-tertiary)"
                        : "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  API Logs
                </button>
                <button
                  onClick={() => setLogType("tally-sync")}
                  style={{
                    padding: "8px 16px",
                    background:
                      logType === "tally-sync"
                        ? "var(--bg-tertiary)"
                        : "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Tally Sync Logs
                </button>
              </div>
              <LogViewer logType={logType} />
            </div>
          )}

          {currentPage === "settings" && <Settings company={company} />}
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};
