// src/renderer/dashboard/components/CompanyInfo.tsx
import React from 'react';

interface Company {
  id: number;
  name: string;
  gstin?: string;
  address?: string;
  state?: string;
  country: string;
  book_start_from: string;
}

interface CompanyInfoProps {
  company: Company | null;
}

export const CompanyInfo: React.FC<CompanyInfoProps> = ({ company }) => {
  if (!company) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        padding: '20px',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
              <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Company Information
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              No company selected
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '8px',
      padding: '20px',
      border: '1px solid var(--border-light)',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
        {/* Left section - Company details */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0078d4 0%, #00bcf2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '18px',
              fontWeight: 600
            }}>
              {company.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {company.name}
              </h3>
              {company.gstin && (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  GSTIN: {company.gstin}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {company.state && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                  State
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{company.state}</div>
              </div>
            )}
            {company.address && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                  Address
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{company.address}</div>
              </div>
            )}
          </div>
        </div>

        {/* Right section - Book Start From */}
        <div style={{
          padding: '16px 20px',
          background: 'var(--accent-light)',
          borderRadius: '8px',
          border: '1px solid var(--accent-color)',
          textAlign: 'center',
          minWidth: '140px'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Book Start From
          </div>
          <div style={{ fontSize: '20px', color: 'var(--accent-color)', fontWeight: 600 }}>
            {company.book_start_from}
          </div>
        </div>
      </div>
    </div>
  );
};
