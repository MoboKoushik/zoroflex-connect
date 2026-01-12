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
}

export const CompanySelector: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

    return () => {
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners('profile-data');
        window.electronAPI.removeAllListeners('auto-select-info');
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
        // Check if there's an auto-selected company
        if (result.autoSelectedCompanyId) {
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

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#1e1e1e',
        padding: '40px'
      }}>
        <div style={{
          background: '#d13438',
          color: '#ffffff',
          padding: '20px 30px',
          borderRadius: '8px',
          maxWidth: '500px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '10px' }}>Error</div>
          <div style={{ fontSize: '14px', marginBottom: '20px' }}>{error}</div>
          <button
            onClick={loadCompanies}
            style={{
              padding: '10px 20px',
              background: '#ffffff',
              color: '#d13438',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
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
          No companies were found in Tally. Please ensure Tally is running and the ZeroFinnCmp report is available.
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
      padding: '40px 20px',
      color: '#cccccc'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 600,
          color: '#ffffff',
          marginBottom: '10px',
          textAlign: 'center'
        }}>
          Select Your Company
        </h1>
        
        {autoSelectedId !== null && (
          <div style={{
            textAlign: 'center',
            marginBottom: '30px',
            padding: '12px 20px',
            background: '#1e3a5f',
            border: '1px solid #007acc',
            borderRadius: '8px',
            maxWidth: '600px',
            margin: '0 auto 30px auto',
            color: '#7fb3d3',
            fontSize: '14px'
          }}>
            <strong style={{ color: '#ffffff' }}>✓ Company Auto-Selected</strong>
            <div style={{ marginTop: '4px', fontSize: '13px' }}>
              A matching company was found and automatically selected. Click Continue to proceed.
            </div>
          </div>
        )}
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
          marginBottom: '40px'
        }}>
          {companies.map(company => (
            <CompanyCard
              key={company.id}
              company={company}
              onSelect={handleSelectCompany}
              isSelected={selectedId === company.id}
              isDisabled={autoSelectedId !== null && company.id !== autoSelectedId}
              isAutoSelected={autoSelectedId !== null && company.id === autoSelectedId}
            />
          ))}
        </div>

        {/* Continue Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '20px 0',
          borderTop: '1px solid #3e3e42'
        }}>
          <button
            onClick={handleContinue}
            disabled={!selectedId || continuing}
            style={{
              padding: '14px 40px',
              background: selectedId && !continuing ? '#007acc' : '#3e3e42',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: selectedId && !continuing ? 'pointer' : 'not-allowed',
              fontSize: '16px',
              fontWeight: 600,
              transition: 'background 0.2s',
              minWidth: '200px',
              opacity: selectedId && !continuing ? 1 : 0.6
            }}
            onMouseEnter={(e) => {
              if (selectedId && !continuing) {
                e.currentTarget.style.background = '#005a9e';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedId && !continuing) {
                e.currentTarget.style.background = '#007acc';
              }
            }}
          >
            {continuing ? 'Loading...' : 'Continue to Dashboard'}
          </button>
        </div>

        {error && (
          <div style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#d13438',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: 1000
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
