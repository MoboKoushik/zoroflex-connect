// src/renderer/company-selector/CompanySelector.tsx
import React, { useEffect, useState } from 'react';
import { CompanyCard } from './CompanyCard';
import { LoadingSpinner } from '../shared/components/LoadingSpinner';

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
        background: '#1e1e1e',
        color: '#cccccc'
      }}>
        <LoadingSpinner size={48} />
        <div style={{ marginTop: '20px', fontSize: '16px' }}>Loading companies from Tally...</div>
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
        background: 'linear-gradient(135deg, #1e1e1e 0%, #2d2d30 100%)',
        padding: '40px'
      }}>
        <div style={{
          background: '#d13438',
          color: '#ffffff',
          padding: '24px 32px',
          borderRadius: '12px',
          maxWidth: '550px',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(209, 52, 56, 0.3)'
        }}>
          <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '12px' }}>⚠️ Error</div>
          <div style={{ fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>{error}</div>
          <button
            onClick={loadCompanies}
            style={{
              padding: '12px 24px',
              background: '#ffffff',
              color: '#d13438',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Retry
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
        background: '#1e1e1e',
        color: '#cccccc',
        padding: '40px'
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>No Companies Found</div>
        <div style={{ fontSize: '14px', color: '#999', marginBottom: '20px' }}>
          No companies were found in Tally. Please ensure Tally is running and the ZorrofinCmp report is available.
        </div>
        <button
          onClick={loadCompanies}
          style={{
            padding: '10px 20px',
            background: '#007acc',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1e1e1e',
      padding: '30px 20px',
      color: '#cccccc'
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '30px'
        }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: 600,
            color: '#ffffff',
            marginBottom: '8px'
          }}>
            Select Your Company
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#999999'
          }}>
            Choose the company you want to sync with Tally
          </p>
        </div>

        {/* Warning Message */}
        {warning && (
          <div style={{
            marginBottom: '24px',
            padding: '14px 20px',
            background: '#ff9800',
            border: '1px solid #ffb74d',
            borderRadius: '8px',
            color: '#ffffff',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}>
            <div style={{ fontSize: '20px', flexShrink: 0, marginTop: '2px' }}>⚠️</div>
            <div style={{ flex: 1, lineHeight: '1.5' }}>
              <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                Biller ID Mismatch
              </strong>
              <div>{warning}</div>
            </div>
          </div>
        )}
        
        {autoSelectedId !== null && (
          <div style={{
            marginBottom: '20px',
            padding: '12px 18px',
            background: '#107c10',
            border: '1px solid #4caf50',
            borderRadius: '8px',
            color: '#ffffff',
            fontSize: '13px',
            textAlign: 'center'
          }}>
            <strong>✓ Company Auto-Selected</strong> - A matching company was found and automatically selected.
          </div>
        )}

        {/* Error message (non-blocking) */}
        {error && companies.length > 0 && (
          <div style={{
            marginBottom: '20px',
            padding: '12px 18px',
            background: '#d13438',
            border: '1px solid #ff5252',
            borderRadius: '8px',
            color: '#ffffff',
            fontSize: '13px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
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
          padding: '20px 0',
          borderTop: '1px solid #3e3e42',
          marginTop: '20px'
        }}>
          <button
            onClick={handleContinue}
            disabled={!selectedId || continuing || !!warning}
            style={{
              padding: '12px 32px',
              background: selectedId && !continuing && !warning
                ? '#007acc' 
                : '#3e3e42',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: selectedId && !continuing && !warning ? 'pointer' : 'not-allowed',
              fontSize: '15px',
              fontWeight: 600,
              transition: 'background 0.2s',
              minWidth: '200px',
              opacity: selectedId && !continuing && !warning ? 1 : 0.6
            }}
            onMouseEnter={(e) => {
              if (selectedId && !continuing && !warning) {
                e.currentTarget.style.background = '#005a9e';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedId && !continuing && !warning) {
                e.currentTarget.style.background = '#007acc';
              }
            }}
          >
            {continuing ? 'Loading...' : warning ? 'Cannot Proceed' : 'Continue to Dashboard'}
          </button>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};
