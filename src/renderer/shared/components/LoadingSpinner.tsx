// src/renderer/shared/components/LoadingSpinner.tsx
import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 40, 
  color = '#007acc' 
}) => {
  return (
    <div style={{
      display: 'inline-block',
      width: `${size}px`,
      height: `${size}px`,
      border: `3px solid ${color}20`,
      borderTop: `3px solid ${color}`,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
