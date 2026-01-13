// src/renderer/dashboard/components/StagingInvoices.tsx
import React, { useEffect, useState } from 'react';

interface StagingInvoice {
  id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  customer_id: string | null;
  total: string | null;
  balance: string | null;
  company_name: string | null;
  status: string | null;
  voucher_type: string;
  type: string | null;
  is_processed: boolean;
  comment: string | null;
  retry_count: number;
  status_label: 'Processed' | 'Unprocessed' | 'Error';
  created_at: string;
  updated_at: string;
}

interface PaginationData {
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export const StagingInvoices: React.FC = () => {
  const [invoices, setInvoices] = useState<StagingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    totalPages: 1,
    totalResults: 0
  });

  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI?.getStagingInvoices?.(page, 10, search);
      
      if (result?.success) {
        setInvoices(result.details || []);
        setPagination(result.paginate_data || pagination);
        setError(null);
      } else {
        const errorMsg = result?.error || 'Failed to fetch staging invoices. Please try again.';
        console.error('Error fetching staging invoices:', errorMsg);
        setError(errorMsg);
        setInvoices([]);
        setPagination({
          page: 1,
          limit: 10,
          totalPages: 0,
          totalResults: 0
        });
      }
    } catch (error: any) {
      const errorMsg = error?.message || String(error) || 'Failed to fetch staging invoices. Please try again.';
      console.error('Error fetching staging invoices:', errorMsg);
      setError(errorMsg);
      setInvoices([]);
      setPagination({
        page: 1,
        limit: 10,
        totalPages: 0,
        totalResults: 0
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [page, search]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Processed':
        return '#28a745';
      case 'Error':
        return '#dc3545';
      case 'Unprocessed':
        return '#ffc107';
      default:
        return 'var(--text-secondary)';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', color: 'var(--text-primary)' }}>Staging Invoices</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              width: '250px'
            }}
          />
          <button
            onClick={fetchInvoices}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(244, 67, 54, 0.1)',
          border: '1px solid #f44336',
          borderRadius: '4px',
          marginBottom: '20px',
          color: '#f44336',
          fontSize: '14px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading...
        </div>
      ) : error ? null : invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          No staging invoices found
        </div>
      ) : (
        <>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid var(--border-color)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Invoice ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Invoice #</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Customer ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Total</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Balance</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {invoice.invoice_id || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {invoice.invoice_number || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {invoice.issue_date || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {invoice.customer_id || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      ₹{invoice.total || '0.00'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      ₹{invoice.balance || '0.00'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        background: getStatusColor(invoice.status_label) + '20',
                        color: getStatusColor(invoice.status_label)
                      }}>
                        {invoice.status_label}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {invoice.comment || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Showing {((page - 1) * pagination.limit) + 1} to {Math.min(page * pagination.limit, pagination.totalResults)} of {pagination.totalResults} invoices
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '6px 12px',
                  background: page === 1 ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: page === 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
                  cursor: page === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>
              <span style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                style={{
                  padding: '6px 12px',
                  background: page >= pagination.totalPages ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: page >= pagination.totalPages ? 'var(--text-secondary)' : 'var(--text-primary)',
                  cursor: page >= pagination.totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
