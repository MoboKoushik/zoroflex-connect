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
  credit_note_count: number;
  payable_count: number;
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
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const LIMIT = 20;

  const loadHistory = async () => {
    try {
      setLoading(true);
      if (!window.electronAPI?.getSyncSummaryHistory) return;
      const rows: any = await window.electronAPI.getSyncSummaryHistory(
        LIMIT,
        (page - 1) * LIMIT
      );
      setHistory(rows);
      setTotalPages(rows.length === LIMIT ? page + 1 : page);
    } catch (err: any) {
      setError(err.message || "Failed to load sync history");
      console.error("Sync history load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [page]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr.replace(" ", "T"));
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      SUCCESS: "bg-green-500/20 text-green-400 border border-green-500/30",
      PARTIAL: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
      FAILED: "bg-red-500/20 text-red-400 border border-red-500/30",
    };
    return styles[status] || "bg-gray-500/20 text-gray-400 border border-gray-500/30";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return (
          <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case "PARTIAL":
        return (
          <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case "FAILED":
        return (
          <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getTriggerLabel = (trigger: string) => {
    const labels: Record<string, string> = {
      MANUAL_FULL: "Manual",
      AUTO_BACKGROUND: "Auto",
      MANUAL_SINGLE: "Single Entity",
    };
    return labels[trigger] || trigger;
  };

  const getModeLabel = (mode: string) => {
    const labels: Record<string, string> = {
      FULL_FIRST: "Full Sync",
      BACKGROUND_INCREMENTAL: "Incremental",
      ENTITY_FIRST: "First Sync",
      ENTITY_INCREMENTAL: "Incremental",
      ENTITY_ERROR: "Error",
    };
    return labels[mode] || mode;
  };

  const getEntityCounts = (row: SyncSummary) => {
    const counts = [
      { label: "Customer", count: row.customer_count, color: "text-blue-400" },
      { label: "Invoice", count: row.invoice_count, color: "text-emerald-400" },
      { label: "Receipt", count: row.receipt_count, color: "text-purple-400" },
      { label: "Journal", count: row.journal_count, color: "text-orange-400" },
      { label: "Debit Note", count: row.debit_note_count, color: "text-pink-400" },
      { label: "Cancel/Delete", count: row.cancel_delete_count, color: "text-red-400" },
    ];
    return counts.filter((c) => c.count > 0);
  };

  const toggleExpand = (id: number) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            Sync History
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            View all sync operations with detailed status
          </p>
        </div>
        <button
          onClick={loadHistory}
          disabled={loading}
          className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex flex-col justify-center items-center h-64 gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)]"></div>
          <span className="text-[var(--text-secondary)]">Loading sync history...</span>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
          <svg className="w-16 h-16 mx-auto text-[var(--text-tertiary)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-[var(--text-secondary)] text-lg">No sync history found</p>
          <p className="text-[var(--text-tertiary)] text-sm mt-1">Run a sync to see records here</p>
        </div>
      ) : (
        <>
          {/* History List */}
          <div className="space-y-3">
            {history.map((row) => {
              const entityCounts = getEntityCounts(row);
              const isExpanded = expandedRow === row.id;
              const hasError = row.error_detail && row.error_detail.trim() !== "";
              const hasIncomplete = row.incomplete_months && row.incomplete_months.trim() !== "";

              return (
                <div
                  key={row.id}
                  className={`bg-[var(--bg-secondary)] border rounded-lg overflow-hidden transition-all ${
                    row.overall_status === "FAILED"
                      ? "border-red-500/30"
                      : row.overall_status === "PARTIAL"
                      ? "border-yellow-500/30"
                      : "border-[var(--border-color)]"
                  }`}
                >
                  {/* Main Row */}
                  <div
                    className="p-4 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                    onClick={() => toggleExpand(row.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Time & Status */}
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        {/* Status Badge */}
                        <div className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusBadge(row.overall_status)}`}>
                          {getStatusIcon(row.overall_status)}
                          {row.overall_status}
                        </div>

                        {/* Time & Mode */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[var(--text-primary)] font-medium">
                              {formatDate(row.sync_started_at)}
                            </span>
                            <span className="px-2 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs rounded">
                              {getTriggerLabel(row.trigger_type)}
                            </span>
                            <span className="px-2 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs rounded">
                              {getModeLabel(row.sync_mode)}
                            </span>
                            {row.entity_type && (
                              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                                {row.entity_type}
                              </span>
                            )}
                          </div>

                          {/* Entity Counts */}
                          {entityCounts.length > 0 && (
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {entityCounts.map((item) => (
                                <div key={item.label} className="flex items-center gap-1.5">
                                  <span className={`text-sm font-semibold ${item.color}`}>
                                    {item.count}
                                  </span>
                                  <span className="text-[var(--text-tertiary)] text-xs">
                                    {item.label}
                                  </span>
                                </div>
                              ))}
                              <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border-color)]">
                                <span className="text-sm font-semibold text-[var(--text-primary)]">
                                  {row.total_records}
                                </span>
                                <span className="text-[var(--text-tertiary)] text-xs">Total</span>
                              </div>
                            </div>
                          )}

                          {/* Error Preview */}
                          {hasError && !isExpanded && (
                            <div className="mt-2 text-red-400 text-sm truncate">
                              <span className="font-medium">Error: </span>
                              {row.error_detail}
                            </div>
                          )}

                          {/* Incomplete Months Preview */}
                          {hasIncomplete && !isExpanded && (
                            <div className="mt-1 text-yellow-400 text-sm truncate">
                              <span className="font-medium">Incomplete: </span>
                              {row.incomplete_months}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Duration & Expand */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[var(--text-primary)] font-medium">
                            {formatDuration(row.duration_seconds)}
                          </div>
                          <div className="text-[var(--text-tertiary)] text-xs">Duration</div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-[var(--text-tertiary)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* All Entity Counts */}
                        <div className="bg-[var(--bg-secondary)] rounded-lg p-4">
                          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                            Sync Details
                          </h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Customer</span>
                              <span className="text-blue-400 font-semibold">{row.customer_count || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Invoice</span>
                              <span className="text-emerald-400 font-semibold">{row.invoice_count || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Receipt</span>
                              <span className="text-purple-400 font-semibold">{row.receipt_count || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Journal</span>
                              <span className="text-orange-400 font-semibold">{row.journal_count || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Debit Note</span>
                              <span className="text-pink-400 font-semibold">{row.debit_note_count || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Cancel/Delete</span>
                              <span className="text-red-400 font-semibold">{row.cancel_delete_count || 0}</span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex justify-between items-center">
                            <span className="text-[var(--text-secondary)] text-sm font-medium">Total Records</span>
                            <span className="text-[var(--text-primary)] font-bold text-lg">{row.total_records || 0}</span>
                          </div>
                        </div>

                        {/* Sync Info */}
                        <div className="bg-[var(--bg-secondary)] rounded-lg p-4">
                          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                            Sync Information
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Mode</span>
                              <span className="text-[var(--text-primary)] text-sm">{getModeLabel(row.sync_mode)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Trigger</span>
                              <span className="text-[var(--text-primary)] text-sm">{getTriggerLabel(row.trigger_type)}</span>
                            </div>
                            {row.entity_type && (
                              <div className="flex justify-between items-center">
                                <span className="text-[var(--text-tertiary)] text-sm">Entity</span>
                                <span className="text-blue-400 text-sm">{row.entity_type}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--text-tertiary)] text-sm">Duration</span>
                              <span className="text-[var(--text-primary)] text-sm">{formatDuration(row.duration_seconds)}</span>
                            </div>
                            {row.max_alter_id && row.max_alter_id !== "0" && (
                              <div className="flex justify-between items-center">
                                <span className="text-[var(--text-tertiary)] text-sm">Max Alter ID</span>
                                <span className="text-[var(--text-primary)] text-sm font-mono">{row.max_alter_id}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Error & Incomplete */}
                        <div className="bg-[var(--bg-secondary)] rounded-lg p-4">
                          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                            Status Details
                          </h4>

                          {/* Error Detail */}
                          {hasError ? (
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <span className="text-red-400 text-sm font-medium">Error</span>
                              </div>
                              <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm break-words">
                                {row.error_detail}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-green-400 mb-3">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm">No errors</span>
                            </div>
                          )}

                          {/* Incomplete Months */}
                          {hasIncomplete ? (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="text-yellow-400 text-sm font-medium">Incomplete Months</span>
                              </div>
                              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 text-yellow-400 text-sm break-words">
                                {row.incomplete_months}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-green-400">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm">All months complete</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[var(--text-secondary)]">Page</span>
              <span className="px-3 py-1 bg-[var(--bg-tertiary)] rounded-lg text-[var(--text-primary)] font-medium">
                {page}
              </span>
              {totalPages > 1 && (
                <>
                  <span className="text-[var(--text-secondary)]">of</span>
                  <span className="text-[var(--text-primary)]">{totalPages}</span>
                </>
              )}
            </div>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={history.length < LIMIT}
              className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
