// src/renderer/dashboard/components/StagingPayments.tsx
import React, { useEffect, useState } from 'react';

interface StagingPayment {
  id: string;
  receipt_id: string | null;
  receipt_number: string | null;
  receipt_date: string | null;
  customer_name: string | null;
  customer_id: string | null;
  receipt_amount: string | null;
  transaction_type: string | null;
  bill_details: any;
  is_processed: boolean;
  comment: string | null;
  status: 'Processed' | 'Unprocessed' | 'Error';
  created_at: string;
  updated_at: string;
}

interface PaginationData {
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export const StagingPayments: React.FC = () => {
  const [payments, setPayments] = useState<StagingPayment[]>([]);
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

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI?.getStagingPayments?.(page, 10, search);
      
      if (result?.success) {
        setPayments(result.details || []);
        setPagination(result.paginate_data || pagination);
        setError(null);
      } else {
        const errorMsg = result?.error || 'Failed to fetch staging payments. Please try again.';
        console.error('Error fetching staging payments:', errorMsg);
        setError(errorMsg);
        setPayments([]);
        setPagination({
          page: 1,
          limit: 10,
          totalPages: 0,
          totalResults: 0
        });
      }
    } catch (error: any) {
      const errorMsg = error?.message || String(error) || 'Failed to fetch staging payments. Please try again.';
      console.error('Error fetching staging payments:', errorMsg);
      setError(errorMsg);
      setPayments([]);
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
    fetchPayments();
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
        <h1 style={{ fontSize: '28px', color: 'var(--text-primary)' }}>Staging Payments</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search payments..."
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
            onClick={fetchPayments}
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
      ) : error ? null : payments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          No staging payments found
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
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Receipt ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Receipt #</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Customer</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Amount</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {payment.receipt_id || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {payment.receipt_number || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {payment.receipt_date || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {payment.customer_name || payment.customer_id || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      ₹{payment.receipt_amount || '0.00'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {payment.transaction_type || '-'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        background: getStatusColor(payment.status) + '20',
                        color: getStatusColor(payment.status)
                      }}>
                        {payment.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {payment.comment || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Showing {((page - 1) * pagination.limit) + 1} to {Math.min(page * pagination.limit, pagination.totalResults)} of {pagination.totalResults} payments
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
