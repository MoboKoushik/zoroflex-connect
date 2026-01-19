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
import { BookManager } from "./components/BookManager";
import { EmptyState } from "./components/EmptyState";
import { BookSelectorDropdown } from "./components/BookSelectorDropdown";
import { ConnectBookModal } from "./components/ConnectBookModal";
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
  const [stagingStatusLastUpdate, setStagingStatusLastUpdate] = useState<Date | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Ready");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null>(null);
  const [hasActiveBook, setHasActiveBook] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentBookId, setCurrentBookId] = useState<number | null>(null);
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);

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

    // Listen for book switched event from IPC
    if (window.electronAPI?.onBookSwitched) {
      window.electronAPI.onBookSwitched((data: any) => {
        console.log('Book switched IPC event received:', data);
        loadData(); // Reload all data when book is switched
      });
    }

    // Also listen for custom event (from dropdown)
    const handleBookSwitched = (event: CustomEvent) => {
      console.log('Book switched custom event received:', event.detail);
      loadData(); // Reload all data when book is switched
    };

    window.addEventListener('book-switched', handleBookSwitched as EventListener);

    return () => {
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners("sync-started");
        window.electronAPI.removeAllListeners("sync-completed");
      }
      window.removeEventListener('book-switched', handleBookSwitched as EventListener);
    };
  }, []);

  // ✅ Auto-refresh staging status every 10 seconds (separate effect)
  useEffect(() => {
    if (!hasActiveBook) return; // Don't refresh if no active book

    const stagingStatusInterval = setInterval(async () => {
      try {
        if (window.electronAPI?.getStagingStatus && analyticsData) {
          const result = await window.electronAPI.getStagingStatus();
          if (result?.success) {
            // Update only processingStats part
            setAnalyticsData((prev: any) => ({
              ...prev,
              processingStats: {
                customers: {
                  total: result.data.customers.total_records,
                  processed: result.data.customers.successful_records,
                  pending: result.data.customers.unprocessed_records,
                  failed: result.data.customers.failed_records
                },
                invoices: {
                  total: result.data.invoices.total_records,
                  processed: result.data.invoices.successful_records,
                  pending: result.data.invoices.unprocessed_records,
                  failed: result.data.invoices.failed_records
                },
                payments: {
                  total: result.data.payments.total_records,
                  processed: result.data.payments.successful_records,
                  pending: result.data.payments.unprocessed_records,
                  failed: result.data.payments.failed_records
                }
              }
            }));
            setStagingStatusLastUpdate(new Date());
          }
        }
      } catch (error) {
        console.error('Error refreshing staging status:', error);
      }
    }, 10000); // Refresh every 10 seconds

    return () => {
      clearInterval(stagingStatusInterval);
    };
  }, [hasActiveBook, analyticsData]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (!window.electronAPI) {
        console.error("Electron API not available");
        return;
      }
      
      // Check if user has active books
      const activeBooksResult = await window.electronAPI.getActiveBooks?.();
      const hasBooks = activeBooksResult?.success && activeBooksResult.books && activeBooksResult.books.length > 0;
      setHasActiveBook(hasBooks || false);

      if (hasBooks && activeBooksResult.books && activeBooksResult.books.length > 0) {
        setCurrentBookId(activeBooksResult.books[0].id);
      }

      if (!hasBooks) {
        setLoading(false);
        setCurrentBookId(null);
        return; // Don't load other data if no books
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
    } finally {
      setLoading(false);
    }
  };

  const handleConnectBook = () => {
    setShowConnectModal(true);
  };

  const handleBookConnected = () => {
    // Reload data after book is connected
    loadData();
    setShowConnectModal(false);
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

      {/* Book Selector Dropdown at Top */}
      <div style={{
        padding: '12px 24px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <BookSelectorDropdown
          onBookChange={(bookId) => {
            setCurrentBookId(bookId);
            loadData(); // Reload all data
          }}
          onConnectClick={handleConnectBook}
        />
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Show sidebar only if book is selected */}
        {hasActiveBook && (
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        )}

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
              {loading ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 'calc(100vh - 200px)'
                }}>
                  <div style={{
                    fontSize: '16px',
                    color: 'var(--text-secondary)'
                  }}>Loading...</div>
                </div>
              ) : !hasActiveBook ? (
                <EmptyState onConnectBook={handleConnectBook} />
              ) : (
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
            </>
          )}

          {currentPage === "customers" && <StagingCustomers />}

          {currentPage === "invoices" && <StagingInvoices />}

          {currentPage === "payments" && <StagingPayments />}

          {currentPage === "journal-vouchers" && <StagingJournalVouchers />}

          {currentPage === "books" && (
            <BookManager onBookSwitched={async (bookId) => {
              // Reload data when book is switched
              await loadData();
            }} />
          )}

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

      {/* Connect Book Modal */}
      <ConnectBookModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onBookConnected={handleBookConnected}
      />
    </div>
  );
};
