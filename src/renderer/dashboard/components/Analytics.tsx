// src/renderer/dashboard/components/Analytics.tsx
import React, { useEffect, useState } from 'react';

// SVG Icons
const icons = {
  sync: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0115-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 01-15 6.7L3 16" />
    </svg>
  ),
  api: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  customers: (
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
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  pending: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0115-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 01-15 6.7L3 16" />
    </svg>
  ),
};

interface AnalyticsData {
  syncStats: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    last7Days: Array<{ date: string; count: number; success: number; failed: number }>;
  };
  apiStats: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    last7Days: Array<{ date: string; count: number; success: number; failed: number }>;
  };
  processingStats: {
    customers: { total: number; processed: number; pending: number; failed: number };
    invoices: { total: number; processed: number; pending: number; failed: number };
    payments: { total: number; processed: number; pending: number; failed: number };
    journalVouchers?: { total: number; processed: number; pending: number; failed: number };
    debitNotes?: { total: number; processed: number; pending: number; failed: number };
  };
}

interface AnalyticsProps {
  data: AnalyticsData | null;
  loading: boolean;
}

export const Analytics: React.FC<AnalyticsProps> = ({ data, loading }) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (window.electronAPI?.getAnalytics) {
        await window.electronAPI.getAnalytics();
      }
    } catch (error) {
      console.error('Error refreshing analytics:', error);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 40px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--border-light)'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'var(--accent-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-color)',
          marginBottom: '20px'
        }}>
          {icons.chart}
        </div>
        <div className="spinner" style={{ width: '24px', height: '24px', marginBottom: '16px' }} />
        <div style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 500 }}>
          Loading analytics...
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Fetching sync and processing data
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 40px',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        border: '1px solid var(--border-light)'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          marginBottom: '20px'
        }}>
          {icons.chart}
        </div>
        <div style={{ fontSize: '18px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px' }}>
          No Analytics Data
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '400px', lineHeight: '1.5' }}>
          Analytics data will appear here once sync operations and API calls are recorded. Start syncing data from Tally to see statistics.
        </div>
      </div>
    );
  }

  // Ensure data has required structure with defaults
  const syncStats = data.syncStats || {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    last7Days: []
  };

  const apiStats = data.apiStats || {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    last7Days: []
  };

  const processingStats = data.processingStats || {
    customers: { total: 0, processed: 0, pending: 0, failed: 0 },
    invoices: { total: 0, processed: 0, pending: 0, failed: 0 },
    payments: { total: 0, processed: 0, pending: 0, failed: 0 },
    journalVouchers: { total: 0, processed: 0, pending: 0, failed: 0 },
    debitNotes: { total: 0, processed: 0, pending: 0, failed: 0 }
  };

  // Ensure last7Days arrays have 7 days of data
  const ensure7Days = (days: any[]) => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const existing = days.find(d => d.date === dateStr);
      result.push(existing || { date: dateStr, count: 0, success: 0, failed: 0 });
    }
    return result;
  };

  const last7DaysSync = ensure7Days(syncStats.last7Days || []);
  const last7DaysApi = ensure7Days(apiStats.last7Days || []);

  // Calculate success rates
  const syncSuccessRate = syncStats.totalSyncs > 0
    ? ((syncStats.successfulSyncs / syncStats.totalSyncs) * 100).toFixed(1)
    : '0.0';
  const apiSuccessRate = apiStats.totalCalls > 0
    ? ((apiStats.successfulCalls / apiStats.totalCalls) * 100).toFixed(1)
    : '0.0';

  // Summary Card Component
  const SummaryCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: number;
    subLabel: string;
    color: string;
    bgColor: string;
    successRate?: string;
    successCount?: number;
    failedCount?: number;
  }> = ({ icon, label, value, subLabel, color, bgColor, successRate, successCount, failedCount }) => (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid var(--border-light)',
      boxShadow: 'var(--shadow-sm)',
      transition: 'all 0.2s ease'
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          background: bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '4px' }}>
            {label}
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: color, lineHeight: 1 }}>
            {value.toLocaleString()}
          </div>
        </div>
      </div>

      {successRate !== undefined && (
        <div style={{
          background: 'var(--bg-tertiary)',
          borderRadius: '8px',
          padding: '10px 12px',
          marginBottom: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>Success Rate</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: parseFloat(successRate) >= 90 ? 'var(--success-color)' : parseFloat(successRate) >= 70 ? 'var(--warning-color)' : 'var(--error-color)' }}>
              {successRate}%
            </span>
          </div>
          <div style={{
            height: '6px',
            background: 'var(--border-light)',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${successRate}%`,
              background: parseFloat(successRate) >= 90 ? 'var(--success-color)' : parseFloat(successRate) >= 70 ? 'var(--warning-color)' : 'var(--error-color)',
              borderRadius: '3px',
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
        {successCount !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--success-color)' }}>{icons.success}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{successCount.toLocaleString()} success</span>
          </div>
        )}
        {failedCount !== undefined && failedCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--error-color)' }}>{icons.error}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{failedCount.toLocaleString()} failed</span>
          </div>
        )}
      </div>
    </div>
  );

  // Bar Chart Component
  const BarChart: React.FC<{
    data: Array<{ date: string; count: number; success: number; failed: number }>;
    title: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
  }> = ({ data, title, icon, color, bgColor }) => {
    const maxValue = Math.max(...data.map(d => d.count), 1);
    const totalSuccess = data.reduce((sum, d) => sum + d.success, 0);
    const totalFailed = data.reduce((sum, d) => sum + d.failed, 0);

    return (
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-sm)',
        height: '100%'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: bgColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color
            }}>
              {icon}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Last 7 days</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '10px', height: '10px', background: 'var(--success-color)', borderRadius: '2px' }} />
              <span style={{ color: 'var(--text-muted)' }}>{totalSuccess}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '10px', height: '10px', background: 'var(--error-color)', borderRadius: '2px' }} />
              <span style={{ color: 'var(--text-muted)' }}>{totalFailed}</span>
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          height: '160px',
          padding: '0 4px'
        }}>
          {data.map((item, index) => {
            const successHeight = maxValue > 0 ? (item.success / maxValue) * 140 : 0;
            const failedHeight = maxValue > 0 ? (item.failed / maxValue) * 140 : 0;
            const dayLabel = new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' });
            const dateLabel = new Date(item.date).getDate();

            return (
              <div key={index} style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                justifyContent: 'flex-end'
              }}>
                <div style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px'
                }}>
                  {item.count > 0 ? (
                    <>
                      <div style={{
                        width: '100%',
                        maxWidth: '32px',
                        background: 'var(--success-color)',
                        height: `${Math.max(successHeight, successHeight > 0 ? 4 : 0)}px`,
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease'
                      }} title={`Success: ${item.success}`} />
                      {failedHeight > 0 && (
                        <div style={{
                          width: '100%',
                          maxWidth: '32px',
                          background: 'var(--error-color)',
                          height: `${Math.max(failedHeight, 4)}px`,
                          borderRadius: successHeight === 0 ? '4px 4px 0 0' : '0',
                          transition: 'height 0.3s ease'
                        }} title={`Failed: ${item.failed}`} />
                      )}
                    </>
                  ) : (
                    <div style={{
                      width: '100%',
                      maxWidth: '32px',
                      background: 'var(--border-light)',
                      height: '4px',
                      borderRadius: '4px'
                    }} />
                  )}
                </div>
                <div style={{
                  marginTop: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{dateLabel}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{dayLabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Processing Stats Card Component
  const ProcessingCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    data: { total: number; processed: number; pending: number; failed: number };
    color: string;
    bgColor: string;
  }> = ({ icon, title, data, color, bgColor }) => {
    const processedPercent = data.total > 0 ? (data.processed / data.total) * 100 : 0;
    const pendingPercent = data.total > 0 ? (data.pending / data.total) * 100 : 0;
    const failedPercent = data.total > 0 ? (data.failed / data.total) * 100 : 0;

    return (
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {data.total.toLocaleString()} total records
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{
          height: '8px',
          background: 'var(--bg-tertiary)',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '16px'
        }}>
          <div style={{ height: '100%', display: 'flex' }}>
            {processedPercent > 0 && (
              <div style={{
                width: `${processedPercent}%`,
                background: 'var(--success-color)',
                transition: 'width 0.3s ease'
              }} />
            )}
            {pendingPercent > 0 && (
              <div style={{
                width: `${pendingPercent}%`,
                background: 'var(--warning-color)',
                transition: 'width 0.3s ease'
              }} />
            )}
            {failedPercent > 0 && (
              <div style={{
                width: `${failedPercent}%`,
                background: 'var(--error-color)',
                transition: 'width 0.3s ease'
              }} />
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div style={{
            background: 'var(--success-bg)',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--success-color)' }}>{icons.success}</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--success-color)' }}>
              {data.processed.toLocaleString()}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Processed</div>
          </div>

          <div style={{
            background: 'var(--warning-bg)',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--warning-color)' }}>{icons.pending}</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--warning-color)' }}>
              {data.pending.toLocaleString()}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Pending</div>
          </div>

          <div style={{
            background: 'var(--error-bg)',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--error-color)' }}>{icons.error}</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--error-color)' }}>
              {data.failed.toLocaleString()}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Failed</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-color)'
          }}>
            {icons.chart}
          </div>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Analytics Dashboard
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Monitor your sync performance and data processing
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '10px 16px',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
            opacity: refreshing ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (!refreshing) {
              e.currentTarget.style.background = 'var(--bg-hover)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
          }}
        >
          <span style={{
            display: 'inline-flex',
            animation: refreshing ? 'spin 1s linear infinite' : 'none'
          }}>
            {icons.refresh}
          </span>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <SummaryCard
          icon={icons.sync}
          label="Total Syncs"
          value={syncStats.totalSyncs}
          subLabel="All time synchronizations"
          color="#0078d4"
          bgColor="#e6f2ff"
          successRate={syncSuccessRate}
          successCount={syncStats.successfulSyncs}
          failedCount={syncStats.failedSyncs}
        />
        <SummaryCard
          icon={icons.api}
          label="API Calls"
          value={apiStats.totalCalls}
          subLabel="Total API requests"
          color="#7c3aed"
          bgColor="#ede9fe"
          successRate={apiSuccessRate}
          successCount={apiStats.successfulCalls}
          failedCount={apiStats.failedCalls}
        />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <BarChart
          data={last7DaysSync}
          title="Sync Activity"
          icon={icons.sync}
          color="#0078d4"
          bgColor="#e6f2ff"
        />
        <BarChart
          data={last7DaysApi}
          title="API Calls"
          icon={icons.api}
          color="#7c3aed"
          bgColor="#ede9fe"
        />
      </div>

      {/* Processing Stats Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Data Processing Status
        </h3>
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          background: 'var(--bg-tertiary)',
          padding: '4px 10px',
          borderRadius: '12px'
        }}>
          Staging to Main
        </div>
      </div>

      {/* Processing Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
        <ProcessingCard
          icon={icons.customers}
          title="Customers"
          data={processingStats.customers}
          color="#059669"
          bgColor="#d1fae5"
        />
        <ProcessingCard
          icon={icons.invoice}
          title="Invoices"
          data={processingStats.invoices}
          color="#0078d4"
          bgColor="#e6f2ff"
        />
        <ProcessingCard
          icon={icons.receipt}
          title="Payments"
          data={processingStats.payments}
          color="#d97706"
          bgColor="#fef3c7"
        />
      </div>

      {/* Additional Processing Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <ProcessingCard
          icon={icons.journal}
          title="Journal Vouchers"
          data={processingStats.journalVouchers || { total: 0, processed: 0, pending: 0, failed: 0 }}
          color="#7c3aed"
          bgColor="#ede9fe"
        />
        <ProcessingCard
          icon={icons.debitNote}
          title="Debit Notes"
          data={processingStats.debitNotes || { total: 0, processed: 0, pending: 0, failed: 0 }}
          color="#db2777"
          bgColor="#fce7f3"
        />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
