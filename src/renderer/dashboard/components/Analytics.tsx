// src/renderer/dashboard/components/Analytics.tsx
import React, { useEffect, useState } from 'react';

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
  };
  fetchStats?: {
    totalFetched: number;
    todayFetched: number;
    successRate: number;
    lastFetchTime: string | null;
  };
  sendStats?: {
    totalSent: number;
    todaySent: number;
    successRate: number;
    failedCount: number;
    lastSendTime: string | null;
  };
}

interface AnalyticsProps {
  data: AnalyticsData | null;
  loading: boolean;
}

export const Analytics: React.FC<AnalyticsProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading analytics...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>No analytics data available</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Analytics data will appear here once sync operations and API calls are recorded.
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
    payments: { total: 0, processed: 0, pending: 0, failed: 0 }
  };

  const fetchStats = data.fetchStats || {
    totalFetched: 0,
    todayFetched: 0,
    successRate: 0,
    lastFetchTime: null
  };

  const sendStats = data.sendStats || {
    totalSent: 0,
    todaySent: 0,
    successRate: 0,
    failedCount: 0,
    lastSendTime: null
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

  const SimpleBarChart: React.FC<{ data: Array<{ date: string; count: number; success: number; failed: number }>; title: string; color: string }> = ({ data, title, color }) => {
    const maxValue = Math.max(...data.map(d => d.count), 1);
    const height = 200;

    return (
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--text-primary)' }}>{title}</h3>
        <div style={{ position: 'relative', height: `${height}px`, background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '100%' }}>
            {data.map((item, index) => {
              const successHeight = (item.success / maxValue) * (height - 40);
              const failedHeight = (item.failed / maxValue) * (height - 40);
              const dateLabel = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              
              return (
                <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '100%' }}>
                    <div style={{ 
                      width: '100%', 
                      background: '#4caf50', 
                      height: `${successHeight}px`,
                      borderRadius: '4px 4px 0 0',
                      minHeight: successHeight > 0 ? '2px' : '0'
                    }} title={`Success: ${item.success}`} />
                    <div style={{ 
                      width: '100%', 
                      background: '#f44336', 
                      height: `${failedHeight}px`,
                      borderRadius: failedHeight > 0 && successHeight === 0 ? '4px 4px 0 0' : '0 0 0 0',
                      minHeight: failedHeight > 0 ? '2px' : '0'
                    }} title={`Failed: ${item.failed}`} />
                  </div>
                  <div style={{ 
                    fontSize: '10px', 
                    color: 'var(--text-secondary)', 
                    marginTop: '4px',
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    transform: 'rotate(180deg)',
                    whiteSpace: 'nowrap'
                  }}>
                    {dateLabel}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '12px', height: '12px', background: '#4caf50', borderRadius: '2px' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Success</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '12px', height: '12px', background: '#f44336', borderRadius: '2px' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Failed</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ProcessingChart: React.FC<{ data: { total: number; processed: number; pending: number; failed: number }; title: string; colors: { processed: string; pending: string; failed: string } }> = ({ data, title, colors }) => {
    const processedPercent = data.total > 0 ? (data.processed / data.total) * 100 : 0;
    const pendingPercent = data.total > 0 ? (data.pending / data.total) * 100 : 0;
    const failedPercent = data.total > 0 ? (data.failed / data.total) * 100 : 0;

    return (
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-primary)' }}>{title}</h3>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {data.total}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total Records</div>
        </div>
        <div style={{ 
          height: '8px', 
          background: 'var(--bg-tertiary)', 
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '12px'
        }}>
          <div style={{ 
            height: '100%', 
            display: 'flex',
            width: '100%'
          }}>
            {processedPercent > 0 && (
              <div style={{ 
                width: `${processedPercent}%`, 
                background: colors.processed,
                transition: 'width 0.3s'
              }} title={`Processed: ${data.processed} (${processedPercent.toFixed(1)}%)`} />
            )}
            {pendingPercent > 0 && (
              <div style={{ 
                width: `${pendingPercent}%`, 
                background: colors.pending,
                transition: 'width 0.3s'
              }} title={`Pending: ${data.pending} (${pendingPercent.toFixed(1)}%)`} />
            )}
            {failedPercent > 0 && (
              <div style={{ 
                width: `${failedPercent}%`, 
                background: colors.failed,
                transition: 'width 0.3s'
              }} title={`Failed: ${data.failed} (${failedPercent.toFixed(1)}%)`} />
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', background: colors.processed, borderRadius: '2px' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Processed</span>
            </div>
            <span style={{ color: colors.processed, fontWeight: 500 }}>{data.processed} ({processedPercent.toFixed(0)}%)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', background: colors.pending, borderRadius: '2px' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Pending</span>
            </div>
            <span style={{ color: colors.pending, fontWeight: 500 }}>{data.pending} ({pendingPercent.toFixed(0)}%)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', background: colors.failed, borderRadius: '2px' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Failed</span>
            </div>
            <span style={{ color: colors.failed, fontWeight: 500 }}>{data.failed} ({failedPercent.toFixed(0)}%)</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ fontSize: '24px', marginBottom: '24px', color: 'var(--text-primary)' }}>Analytics Dashboard</h2>
      
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Syncs</div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {syncStats.totalSyncs}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {syncStats.successfulSyncs} success, {syncStats.failedSyncs} failed
          </div>
        </div>
        
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>API Calls</div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {apiStats.totalCalls}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {apiStats.successfulCalls} success, {apiStats.failedCalls} failed
          </div>
        </div>
        
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>XML Fetched</div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#2196f3' }}>
            {fetchStats.totalFetched.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {fetchStats.todayFetched} today • {fetchStats.successRate.toFixed(1)}% success
          </div>
        </div>
        
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>API Sent</div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#4caf50' }}>
            {sendStats.totalSent.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {sendStats.todaySent} today • {sendStats.successRate.toFixed(1)}% success
          </div>
        </div>
      </div>

      {/* XML Fetch vs API Send Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>
            📥 XML Fetch from Tally
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Fetched</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {fetchStats.totalFetched.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Today</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#2196f3' }}>
                {fetchStats.todayFetched.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Success Rate</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: fetchStats.successRate >= 95 ? '#4caf50' : '#ff9800' }}>
                {fetchStats.successRate.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Last Fetch</div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                {fetchStats.lastFetchTime 
                  ? new Date(fetchStats.lastFetchTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                  : 'Never'
                }
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>
            📤 API Send to Backend
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Sent</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {sendStats.totalSent.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Today</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#4caf50' }}>
                {sendStats.todaySent.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Success Rate</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: sendStats.successRate >= 95 ? '#4caf50' : '#ff9800' }}>
                {sendStats.successRate.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Failed</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: sendStats.failedCount > 0 ? '#f44336' : '#4caf50' }}>
                {sendStats.failedCount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="card">
          <SimpleBarChart 
            data={last7DaysSync} 
            title="Sync Activity (Last 7 Days)" 
            color="#2196f3"
          />
        </div>
        
        <div className="card">
          <SimpleBarChart 
            data={last7DaysApi} 
            title="API Calls (Last 7 Days)" 
            color="#ff9800"
          />
        </div>
      </div>

      {/* Processing Stats (Staging) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', color: 'var(--text-primary)' }}>🔄 Staging Processing Status</h3>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Auto-refreshing from backend...
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          <ProcessingChart 
            data={processingStats.customers} 
            title="Customers" 
            colors={{ processed: '#4caf50', pending: '#ffc107', failed: '#f44336' }}
          />
          <ProcessingChart 
            data={processingStats.invoices} 
            title="Invoices" 
            colors={{ processed: '#2196f3', pending: '#ffc107', failed: '#f44336' }}
          />
          <ProcessingChart 
            data={processingStats.payments} 
            title="Payments" 
            colors={{ processed: '#ff9800', pending: '#ffc107', failed: '#f44336' }}
          />
        </div>
      </div>
    </div>
  );
};
