// src/renderer/dashboard/components/EmptyState.tsx
import React from 'react';

interface EmptyStateProps {
  onConnectBook: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onConnectBook }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: 'calc(100vh - 200px)',
      padding: '40px',
      textAlign: 'center'
    }}>
      {/* Icon/Illustration */}
      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '32px',
        boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)',
        position: 'relative'
      }}>
        <svg 
          width="60" 
          height="60" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="white" 
          strokeWidth="2"
          style={{ opacity: 0.9 }}
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="9" y1="7" x2="15" y2="7" />
          <line x1="9" y1="11" x2="15" y2="11" />
          <line x1="9" y1="15" x2="13" y2="15" />
        </svg>
        
        {/* Plus icon overlay */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
        }}>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#667eea" 
            strokeWidth="3"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </div>

      {/* Title */}
      <h2 style={{
        fontSize: '24px',
        fontWeight: '600',
        color: 'var(--text-primary)',
        marginBottom: '12px'
      }}>
        No Books Connected
      </h2>

      {/* Description */}
      <p style={{
        fontSize: '15px',
        color: 'var(--text-secondary)',
        marginBottom: '32px',
        maxWidth: '400px',
        lineHeight: '1.6'
      }}>
        Connect your first Tally book to start syncing data automatically. 
        You can connect multiple books and manage them all from one place.
      </p>

      {/* Connect Button */}
      <button
        onClick={onConnectBook}
        style={{
          padding: '12px 32px',
          fontSize: '15px',
          fontWeight: '600',
          color: 'white',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
        }}
      >
        <svg 
          width="18" 
          height="18" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Connect New Book
      </button>

      {/* Help Text */}
      <p style={{
        fontSize: '12px',
        color: 'var(--text-secondary)',
        marginTop: '24px',
        opacity: 0.7
      }}>
        Need help? Contact support or check the documentation
      </p>
    </div>
  );
};
