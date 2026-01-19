// src/renderer/book-selector/BookCard.tsx
import React from 'react';

interface Book {
  id?: number;
  organization_id: string;
  name: string;
  organization_data?: any;
  biller_id: string;
}

interface BookCardProps {
  book: Book;
  isSelected: boolean;
  isConnecting: boolean;
  onSelect: () => void;
}

export const BookCard: React.FC<BookCardProps> = ({ book, isSelected, isConnecting, onSelect }) => {
  const orgData = book.organization_data || {};
  const displayName = book.name || orgData.company_name || orgData.name || book.organization_id;

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '24px',
        background: isSelected 
          ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)' 
          : 'white',
        border: isSelected 
          ? '2px solid #667eea' 
          : '1px solid #e5e7eb',
        borderRadius: '12px',
        cursor: isConnecting ? 'wait' : 'pointer',
        transition: 'all 0.2s ease',
        opacity: isConnecting ? 0.7 : 1,
        position: 'relative',
        boxShadow: isSelected 
          ? '0 4px 12px rgba(102, 126, 234, 0.2)' 
          : '0 2px 4px rgba(0, 0, 0, 0.05)'
      }}
      onMouseEnter={(e) => {
        if (!isConnecting) {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)';
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.15)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isConnecting) {
          e.currentTarget.style.background = isSelected 
            ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)' 
            : 'white';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = isSelected 
            ? '0 4px 12px rgba(102, 126, 234, 0.2)' 
            : '0 2px 4px rgba(0, 0, 0, 0.05)';
        }
      }}
    >
      {isConnecting && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '14px',
          color: '#007acc',
          fontWeight: '500'
        }}>
          Connecting...
        </div>
      )}
      
      <div style={{ opacity: isConnecting ? 0.5 : 1 }}>
        <div style={{
          fontSize: '20px',
          fontWeight: '600',
          marginBottom: '12px',
          color: '#1a1a1a',
          lineHeight: '1.3'
        }}>
          {displayName}
        </div>
        
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          marginBottom: '12px',
          fontFamily: 'monospace',
          background: '#f3f4f6',
          padding: '4px 8px',
          borderRadius: '4px',
          display: 'inline-block'
        }}>
          {book.organization_id}
        </div>

        {orgData.gstin && (
          <div style={{
            fontSize: '13px',
            color: '#4b5563',
            marginBottom: '8px',
            fontWeight: '500'
          }}>
            GSTIN: {orgData.gstin}
          </div>
        )}

        {orgData.address && (
          <div style={{
            fontSize: '12px',
            color: '#6b7280',
            marginTop: '12px',
            lineHeight: '1.5',
            paddingTop: '12px',
            borderTop: '1px solid #e5e7eb'
          }}>
            {orgData.address}
          </div>
        )}

        <div style={{
          marginTop: '20px',
          padding: '10px 16px',
          background: isSelected 
            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
            : isConnecting 
              ? '#e5e7eb' 
              : '#f3f4f6',
          color: isSelected || isConnecting ? 'white' : '#374151',
          borderRadius: '8px',
          fontSize: '13px',
          textAlign: 'center',
          fontWeight: '600',
          transition: 'all 0.2s',
          boxShadow: isSelected ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none'
        }}>
          {isConnecting ? 'Connecting...' : isSelected ? '✓ Selected' : 'Connect'}
        </div>
      </div>
    </div>
  );
};
