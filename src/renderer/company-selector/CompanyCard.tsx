// src/renderer/company-selector/CompanyCard.tsx
import React from 'react';

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

export const CompanyCard: React.FC<CompanyCardProps> = ({ company, onSelect, isSelected = false, isDisabled = false, isAutoSelected = false }) => {
  return (
    <div
      onClick={() => !isDisabled && onSelect(company.id)}
      style={{
        background: isSelected ? '#2a2d2e' : isDisabled ? '#1a1a1a' : '#252526',
        border: isSelected ? '2px solid #007acc' : isDisabled ? '2px solid #3e3e42' : '2px solid transparent',
        borderRadius: '10px',
        padding: '18px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: isDisabled ? 'none' : 'all 0.2s',
        boxShadow: isSelected ? '0 4px 12px rgba(0, 122, 204, 0.2)' : isDisabled ? '0 1px 4px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.1)',
        opacity: isDisabled ? 0.6 : 1,
        position: 'relative',
        filter: isDisabled ? 'grayscale(30%)' : 'none',
        pointerEvents: isDisabled ? 'none' : 'auto'
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !isDisabled) {
          e.currentTarget.style.background = '#2a2d2e';
          e.currentTarget.style.borderColor = '#007acc';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !isDisabled) {
          e.currentTarget.style.background = '#252526';
          e.currentTarget.style.borderColor = 'transparent';
        }
      }}
    >
      {isAutoSelected && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: '#107c10',
          color: '#ffffff',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase'
        }}>
          ✓ Auto-Selected
        </div>
      )}
      {isDisabled && !isAutoSelected && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: '#ff9800',
          color: '#ffffff',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          boxShadow: '0 2px 6px rgba(255, 152, 0, 0.4)'
        }}>
          Not Available
        </div>
      )}
      <div style={{ 
        fontSize: '18px', 
        fontWeight: 600, 
        color: isDisabled ? '#888888' : '#ffffff', 
        marginBottom: '12px',
        lineHeight: '1.3'
      }}>
        {company.name}
      </div>
      
      {company.gstin && (
        <div style={{ 
          fontSize: '14px', 
          color: isDisabled ? '#666666' : '#cccccc', 
          marginBottom: '8px' 
        }}>
          <strong style={{ color: isDisabled ? '#555555' : '#999' }}>GSTIN:</strong> {company.gstin}
        </div>
      )}
      
      {company.address && (
        <div style={{ 
          fontSize: '14px', 
          color: isDisabled ? '#666666' : '#cccccc', 
          marginBottom: '8px' 
        }}>
          <strong style={{ color: isDisabled ? '#555555' : '#999' }}>Address:</strong>{' '}
          {company.address.length > 60 ? `${company.address.substring(0, 60)}...` : company.address}
        </div>
      )}
      
      {company.state && (
        <div style={{ 
          fontSize: '14px', 
          color: isDisabled ? '#666666' : '#cccccc', 
          marginBottom: '12px' 
        }}>
          <strong style={{ color: isDisabled ? '#555555' : '#999' }}>State:</strong> {company.state}
        </div>
      )}
      
      <div
        style={{
          background: isDisabled ? '#1a1a1a' : '#1e3a5f',
          padding: '12px 16px',
          borderRadius: '8px',
          border: isDisabled ? '1px solid #3e3e42' : '1px solid #007acc',
          marginTop: '12px'
        }}
      >
        <div style={{ 
          fontSize: '11px', 
          color: isDisabled ? '#666666' : '#7fb3d3', 
          marginBottom: '4px', 
          fontWeight: 600,
          textTransform: 'uppercase'
        }}>
          Book Start From
        </div>
        <div style={{ 
          fontSize: '16px', 
          color: isDisabled ? '#888888' : '#ffffff', 
          fontWeight: 600 
        }}>
          {company.book_start_from}
        </div>
      </div>
      
      {!isDisabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(company.id);
          }}
          style={{
            width: '100%',
            marginTop: '15px',
            padding: '12px 20px',
            background: isSelected ? '#107c10' : '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isSelected ? '#0e6b0e' : '#005a9e';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isSelected ? '#107c10' : '#007acc';
          }}
        >
          {isAutoSelected ? '✓ Auto-Selected' : isSelected ? '✓ Selected' : 'Select This Company'}
        </button>
      )}
    </div>
  );
};
