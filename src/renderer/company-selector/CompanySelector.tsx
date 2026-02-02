// src/renderer/company-selector/CompanySelector.tsx
import React, { useEffect, useState } from 'react';
import { CompanyCard } from './CompanyCard';

// SVG Icons
const icons = {
  building: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18Z" />
      <path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2" />
      <path d="M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
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
  arrow: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};

interface Company {
  id: number;
  name: string;
  gstin?: string;
  address?: string;
  state?: string;
  country: string;
  book_start_from: string;
  isSelectable?: boolean;
}

export const CompanySelector: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [autoSelectedId, setAutoSelectedId] = useState<number | null>(null);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    loadCompanies();

    // Listen for profile data if needed
    if (window.electronAPI?.onProfileData) {
      window.electronAPI.onProfileData((data) => {
        console.log('Profile data received:', data);
      });
    }

    // Listen for auto-select info
    if (window.electronAPI?.onAutoSelectInfo) {
      window.electronAPI.onAutoSelectInfo(async (data) => {
        console.log('Auto-select info received:', data);
        if (data.companyId) {
          setAutoSelectedId(data.companyId);
          setSelectedId(data.companyId);
          // Auto-select in database
          if (window.electronAPI?.selectCompany) {
            try {
              await window.electronAPI.selectCompany(data.companyId);
            } catch (err) {
              console.error('Error auto-selecting company:', err);
            }
          }
        }
      });
    }

    // Listen for initial error message
    if (window.electronAPI?.onInitialError) {
      window.electronAPI.onInitialError((data) => {
        console.log('Initial error received:', data);
        if (data.error) {
          setError(data.error);
          setLoading(false);
        }
      });
    }

    // Listen for warning message
    if (window.electronAPI?.onWarningMessage) {
      window.electronAPI.onWarningMessage((data) => {
        console.log('Warning message received:', data);
        if (data.warning) {
          setWarning(data.warning);
        }
      });
    }

    return () => {
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners('profile-data');
        window.electronAPI.removeAllListeners('auto-select-info');
        window.electronAPI.removeAllListeners('initial-error');
        window.electronAPI.removeAllListeners('warning-message');
      }
    };
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      setError(null);
      if (!window.electronAPI?.fetchCompanies) {
        setError('Electron API not available');
        return;
      }
      const result = await window.electronAPI.fetchCompanies();
      
      if (result?.success && result.companies) {
        setCompanies(result.companies);
        // Set warning if present
        if (result.warning) {
          setWarning(result.warning);
        }
        // Check if there's an auto-selected company (only if it's selectable)
        if (result.autoSelectedCompanyId) {
          const autoSelectedCompany = result.companies.find((c: Company) => c.id === result.autoSelectedCompanyId);
          if (autoSelectedCompany?.isSelectable) {
            setAutoSelectedId(result.autoSelectedCompanyId);
            setSelectedId(result.autoSelectedCompanyId);
            // Auto-select in database
            if (window.electronAPI?.selectCompany) {
              try {
                await window.electronAPI.selectCompany(result.autoSelectedCompanyId);
              } catch (err) {
                console.error('Error auto-selecting company:', err);
              }
            }
          }
        }
      } else {
        setError(result?.error || 'Failed to load companies');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompany = async (companyId: number) => {
    // Check if company is selectable
    const company = companies.find(c => c.id === companyId);
    if (!company?.isSelectable) {
      setError('This company cannot be selected as it does not match your account\'s biller_id.');
      return;
    }

    try {
      setSelectedId(companyId);
      if (!window.electronAPI?.selectCompany) {
        setError('Electron API not available');
        return;
      }
      const result = await window.electronAPI.selectCompany(companyId);
      
      if (!result?.success) {
        setError(result?.error || 'Failed to select company');
        setSelectedId(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to select company');
      setSelectedId(null);
    }
  };

  const handleContinue = async () => {
    if (!selectedId) {
      setError('Please select a company first');
      return;
    }

    // Check if selected company is selectable
    const selectedCompany = companies.find(c => c.id === selectedId);
    if (!selectedCompany?.isSelectable) {
      setError('This company cannot be selected as it does not match your account\'s biller_id.');
      return;
    }

    // Check if there's a warning (no matching companies)
    if (warning) {
      setError('You cannot proceed. No companies match your account\'s biller_id.');
      return;
    }

    try {
      setContinuing(true);
      setError(null);

      // Ensure company is selected in DB if not already
      if (!window.electronAPI?.selectCompany) {
        setError('Electron API not available');
        return;
      }
      
      const selectResult = await window.electronAPI.selectCompany(selectedId);
      if (!selectResult?.success) {
        setError(selectResult?.error || 'Failed to select company');
        setContinuing(false);
        return;
      }

      // Continue to dashboard
      if (!window.electronAPI?.continueToDashboard) {
        setError('Electron API not available');
        return;
      }

      const continueResult = await window.electronAPI.continueToDashboard();
      if (!continueResult?.success) {
        setError(continueResult?.error || 'Failed to continue to dashboard');
        setContinuing(false);
      }
      // Window will close automatically on success
    } catch (err: any) {
      setError(err.message || 'Failed to continue');
      setContinuing(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '20px',
          background: 'var(--accent-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-color)',
          marginBottom: '24px'
        }}>
          {icons.building}
        </div>
        <div className="spinner" style={{ width: '32px', height: '32px', marginBottom: '16px' }} />
        <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Loading companies from Tally...
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Please wait while we connect
        </div>
      </div>
    );
  }

  if (error && companies.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        padding: '40px'
      }}>
        <div style={{
          background: 'var(--bg-secondary)',
          padding: '40px',
          borderRadius: '16px',
          maxWidth: '480px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-light)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--error-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--error-color)',
            margin: '0 auto 20px'
          }}>
            {icons.error}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Connection Error
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
            {error}
          </div>
          <button
            onClick={loadCompanies}
            style={{
              padding: '12px 28px',
              background: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-hover)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent-color)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {icons.refresh}
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        padding: '40px'
      }}>
        <div style={{
          background: 'var(--bg-secondary)',
          padding: '40px',
          borderRadius: '16px',
          maxWidth: '480px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-light)'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '20px',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            margin: '0 auto 20px'
          }}>
            {icons.building}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            No Companies Found
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
            No companies were found in Tally. Please ensure Tally is running and the ZorrofinCmp report is available.
          </div>
          <button
            onClick={loadCompanies}
            style={{
              padding: '12px 28px',
              background: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent-color)';
            }}
          >
            {icons.refresh}
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '32px 24px',
      color: 'var(--text-primary)'
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '32px'
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
            margin: '0 auto 16px'
          }}>
            {icons.building}
          </div>
          <h1 style={{
            fontSize: '26px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '8px'
          }}>
            Select Your Company
          </h1>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-secondary)'
          }}>
            Choose the company you want to sync with Tally
          </p>
        </div>

        {/* Warning Message */}
        {warning && (
          <div style={{
            marginBottom: '24px',
            padding: '16px 20px',
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning-color)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <div style={{
              color: 'var(--warning-color)',
              flexShrink: 0,
              marginTop: '2px'
            }}>
              {icons.warning}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--warning-color)',
                marginBottom: '4px'
              }}>
                Biller ID Mismatch
              </div>
              <div style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: '1.5'
              }}>
                {warning}
              </div>
            </div>
          </div>
        )}

        {/* Auto-selected notification */}
        {autoSelectedId !== null && (
          <div style={{
            marginBottom: '24px',
            padding: '14px 20px',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-color)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}>
            <span style={{ color: 'var(--success-color)' }}>{icons.check}</span>
            <span style={{ fontSize: '14px', color: 'var(--success-color)', fontWeight: 500 }}>
              Company Auto-Selected - A matching company was found and automatically selected.
            </span>
          </div>
        )}

        {/* Error message (non-blocking) */}
        {error && companies.length > 0 && (
          <div style={{
            marginBottom: '24px',
            padding: '14px 20px',
            background: 'var(--error-bg)',
            border: '1px solid var(--error-color)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}>
            <span style={{ color: 'var(--error-color)' }}>{icons.error}</span>
            <span style={{ fontSize: '14px', color: 'var(--error-color)' }}>
              {error}
            </span>
          </div>
        )}

        {/* Company Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}>
          {companies.map(company => (
            <CompanyCard
              key={company.id}
              company={company}
              onSelect={handleSelectCompany}
              isSelected={selectedId === company.id}
              isDisabled={!company.isSelectable || (autoSelectedId !== null && company.id !== autoSelectedId)}
              isAutoSelected={autoSelectedId !== null && company.id === autoSelectedId}
            />
          ))}
        </div>

        {/* Continue Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '24px 0',
          borderTop: '1px solid var(--border-light)',
          marginTop: '16px'
        }}>
          <button
            onClick={handleContinue}
            disabled={!selectedId || continuing || !!warning}
            style={{
              padding: '14px 40px',
              background: selectedId && !continuing && !warning
                ? 'var(--accent-color)'
                : 'var(--bg-tertiary)',
              color: selectedId && !continuing && !warning ? 'white' : 'var(--text-muted)',
              border: '1px solid',
              borderColor: selectedId && !continuing && !warning
                ? 'var(--accent-color)'
                : 'var(--border-color)',
              borderRadius: '8px',
              cursor: selectedId && !continuing && !warning ? 'pointer' : 'not-allowed',
              fontSize: '15px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
              minWidth: '220px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: selectedId && !continuing && !warning ? 'var(--shadow-sm)' : 'none'
            }}
            onMouseEnter={(e) => {
              if (selectedId && !continuing && !warning) {
                e.currentTarget.style.background = 'var(--accent-hover)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedId && !continuing && !warning) {
                e.currentTarget.style.background = 'var(--accent-color)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }
            }}
          >
            {continuing ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px' }} />
                Connecting...
              </>
            ) : warning ? (
              'Cannot Proceed'
            ) : (
              <>
                Continue to Dashboard
                {icons.arrow}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
