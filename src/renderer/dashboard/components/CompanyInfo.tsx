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
      <div className="card">
        <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-primary)' }}>Company Information</h2>
        <p style={{ color: 'var(--text-secondary)' }}>No company selected</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: 'var(--text-primary)' }}>Company Information</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Company Name</div>
            <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 500 }}>{company.name}</div>
          </div>
          
          {company.gstin && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>GSTIN</div>
              <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{company.gstin}</div>
            </div>
          )}
          
          {company.state && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>State</div>
              <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{company.state}</div>
            </div>
          )}
        </div>
        
        <div>
          <div style={{ 
            marginBottom: '12px',
            padding: '12px',
            background: 'var(--bg-tertiary)',
            borderRadius: '6px',
            border: '1px solid #007acc'
          }}>
            <div style={{ fontSize: '12px', color: '#007acc', marginBottom: '4px', fontWeight: 600 }}>
              BOOK START FROM
            </div>
            <div style={{ fontSize: '18px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {company.book_start_from}
            </div>
          </div>
          
          {company.address && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Address</div>
              <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{company.address}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
