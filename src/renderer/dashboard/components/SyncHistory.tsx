// src/renderer/dashboard/components/SyncHistory.tsx
import React, { useEffect, useState } from "react";

interface SyncSummary {
  id: number;
  sync_started_at: string;
  sync_mode: string;
  trigger_type: string;
  entity_type: string | null;
  customer_count: number;
  journal_count: number;
  invoice_count: number;
  receipt_count: number;
  debit_note_count: number;
  cancel_delete_count: number;
  overall_status: "SUCCESS" | "PARTIAL" | "FAILED";
  error_detail: string | null;
  total_records: number;
  duration_seconds: number | null;
  max_alter_id: string | null;
  incomplete_months: string | null;
  created_at: string;
}

export const SyncHistory: React.FC = () => {
  const [history, setHistory] = useState<SyncSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 20;

  const loadHistory = async () => {
    console.log("ok");
    try {
      setLoading(true);
      if (!window.electronAPI?.getSyncSummaryHistory) return;
      // IPC call to main process
      const rows: any = await window.electronAPI.getSyncSummaryHistory(
        LIMIT,
        (page - 1) * LIMIT,
      );

      setHistory(rows);
      // Assume backend returns total count or calculate from rows.length
      // For simplicity, if rows.length < LIMIT, last page
      setTotalPages(rows.length === LIMIT ? page + 1 : page);
    } catch (err: any) {
      setError(err.message || "Failed to load sync history");
      console.error("Sync history load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("useEffect triggered - loading history for page:", page);
    loadHistory();
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "text-green-500 bg-green-500/10";
      case "PARTIAL":
        return "text-yellow-500 bg-yellow-500/10";
      case "FAILED":
        return "text-red-500 bg-red-500/10";
      default:
        return "text-gray-500 bg-gray-500/10";
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          Sync History
        </h2>

        <div className="flex gap-3">
          <button
            onClick={loadHistory}
            disabled={loading}
            className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-md text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)]"></div>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-secondary)]">
          No sync history found yet. Run a sync to see records here.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
            <table className="min-w-full divide-y divide-[var(--border-color)]">
              <thead className="bg-[var(--bg-tertiary)]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Trigger
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Entity
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Journal
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Receipt
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Debit Note
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Cancel/Delete
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-primary)]">
                {history.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">
                      {formatDate(row.sync_started_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">
                      {row.sync_mode}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">
                      {row.trigger_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">
                      {row.entity_type || "Full Sync"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-[var(--text-primary)]">
                      {row.customer_count || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-[var(--text-primary)]">
                      {row.journal_count || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-[var(--text-primary)]">
                      {row.invoice_count || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-[var(--text-primary)]">
                      {row.receipt_count || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-[var(--text-primary)]">
                      {row.debit_note_count || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-[var(--text-primary)]">
                      {row.cancel_delete_count || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-[var(--text-primary)]">
                      {row.total_records || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-[var(--text-secondary)]">
                      {row.duration_seconds ? `${row.duration_seconds}s` : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(row.overall_status)}`}
                      >
                        {row.overall_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-red-400 max-w-xs truncate">
                      {row.error_detail || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-md disabled:opacity-50 transition-colors"
            >
              Previous
            </button>

            <span className="text-sm text-[var(--text-secondary)]">
              Page {page} {totalPages > 1 ? `of ${totalPages}` : ""}
            </span>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={history.length < LIMIT}
              className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-md disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// Helper function for status color
function getStatusColor(status: string): string {
  switch (status) {
    case "SUCCESS":
      return "bg-green-500/10 text-green-500 border border-green-500/30";
    case "PARTIAL":
      return "bg-yellow-500/10 text-yellow-500 border border-yellow-500/30";
    case "FAILED":
      return "bg-red-500/10 text-red-500 border border-red-500/30";
    default:
      return "bg-gray-500/10 text-gray-400 border border-gray-500/30";
  }
}

// Format date helper
function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
