// src/renderer/company-selector/CompanyCard.tsx
import React from 'react';

// SVG Icons
const icons = {
  building: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18Z" />
      <path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2" />
      <path d="M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  calendar: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  location: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  lock: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
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

interface CompanyCardProps {
  company: Company;
  onSelect: (companyId: number) => void;
  isSelected?: boolean;
  isDisabled?: boolean;
  isAutoSelected?: boolean;
}

export const CompanyCard: React.FC<CompanyCardProps> = ({
  company,
  onSelect,
  isSelected = false,
  isDisabled = false,
  isAutoSelected = false
}) => {
  return (
    <div
      onClick={() => !isDisabled && onSelect(company.id)}
      style={{
        background: isSelected
          ? 'var(--bg-secondary)'
          : isDisabled
            ? 'var(--bg-tertiary)'
            : 'var(--bg-secondary)',
        border: isSelected
          ? '2px solid var(--accent-color)'
          : isDisabled
            ? '1px solid var(--border-light)'
            : '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '20px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: isSelected
          ? 'var(--shadow-md), 0 0 0 3px var(--accent-light)'
          : 'var(--shadow-sm)',
        opacity: isDisabled ? 0.65 : 1,
        position: 'relative',
        filter: isDisabled ? 'grayscale(20%)' : 'none'
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !isDisabled) {
          e.currentTarget.style.borderColor = 'var(--accent-color)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !isDisabled) {
          e.currentTarget.style.borderColor = 'var(--border-light)';
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      {/* Status Badge */}
      {isAutoSelected && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'var(--success-color)',
          color: 'white',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          {icons.check}
          Auto-Selected
        </div>
      )}
      {isDisabled && !isAutoSelected && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'var(--warning-bg)',
          color: 'var(--warning-color)',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          border: '1px solid var(--warning-color)'
        }}>
          {icons.lock}
          Not Available
        </div>
      )}

      {/* Header with Icon and Name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          background: isDisabled ? 'var(--bg-tertiary)' : 'var(--accent-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isDisabled ? 'var(--text-muted)' : 'var(--accent-color)',
          flexShrink: 0
        }}>
          {icons.building}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: isAutoSelected || isDisabled ? '90px' : '0' }}>
          <div style={{
            fontSize: '16px',
            fontWeight: 600,
            color: isDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
            lineHeight: '1.3',
            marginBottom: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {company.name}
          </div>
          {company.gstin && (
            <div style={{
              fontSize: '12px',
              color: isDisabled ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontFamily: 'monospace'
            }}>
              {company.gstin}
            </div>
          )}
        </div>
      </div>

      {/* Details Section */}
      <div style={{ marginBottom: '16px' }}>
        {company.address && (
          <div style={{
            fontSize: '13px',
            color: isDisabled ? 'var(--text-muted)' : 'var(--text-secondary)',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <span style={{ color: isDisabled ? 'var(--text-muted)' : 'var(--text-muted)', marginTop: '2px' }}>
              {icons.location}
            </span>
            <span style={{ lineHeight: '1.4' }}>
              {company.address.length > 60 ? `${company.address.substring(0, 60)}...` : company.address}
              {company.state && `, ${company.state}`}
            </span>
          </div>
        )}
      </div>

      {/* Book Start From Section */}
      <div style={{
        background: isDisabled ? 'var(--bg-primary)' : 'var(--accent-light)',
        padding: '12px 14px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span style={{ color: isDisabled ? 'var(--text-muted)' : 'var(--accent-color)' }}>
          {icons.calendar}
        </span>
        <div>
          <div style={{
            fontSize: '10px',
            color: isDisabled ? 'var(--text-muted)' : 'var(--accent-color)',
            fontWeight: 600,
            textTransform: 'uppercase',
            marginBottom: '2px'
          }}>
            Book Start From
          </div>
          <div style={{
            fontSize: '14px',
            color: isDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
            fontWeight: 500
          }}>
            {company.book_start_from}
          </div>
        </div>
      </div>

      {/* Select Button */}
      {!isDisabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(company.id);
          }}
          style={{
            width: '100%',
            marginTop: '16px',
            padding: '11px 20px',
            background: isSelected ? 'var(--success-color)' : 'var(--accent-color)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isSelected ? '#0e6b0e' : 'var(--accent-hover)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isSelected ? 'var(--success-color)' : 'var(--accent-color)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {isSelected && icons.check}
          {isAutoSelected ? 'Auto-Selected' : isSelected ? 'Selected' : 'Select This Company'}
        </button>
      )}
    </div>
  );
};
