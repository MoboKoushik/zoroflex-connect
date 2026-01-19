// src/renderer/splash/SplashScreen.tsx
import React, { useEffect, useState } from 'react';

export const SplashScreen: React.FC = () => {
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    // Simulate loading steps
    const steps = [
      { delay: 300, message: 'Loading application...' },
      { delay: 600, message: 'Connecting to services...' },
      { delay: 900, message: 'Almost ready...' }
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        setStatus(steps[currentStep].message);
        currentStep++;
      } else {
        clearInterval(interval);
      }
    }, 300);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated background circles */}
      <div style={{
        position: 'absolute',
        width: '200px',
        height: '200px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        top: '-50px',
        left: '-50px',
        animation: 'float 6s ease-in-out infinite'
      }}></div>
      <div style={{
        position: 'absolute',
        width: '150px',
        height: '150px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.08)',
        bottom: '-30px',
        right: '-30px',
        animation: 'float 8s ease-in-out infinite'
      }}></div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 20px) scale(1.1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* App Logo/Icon */}
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '16px',
        background: 'rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
        <div style={{
          fontSize: '40px',
          fontWeight: 'bold'
        }}>Z</div>
      </div>

      {/* App Name */}
      <h1 style={{
        fontSize: '28px',
        fontWeight: '600',
        marginBottom: '8px',
        letterSpacing: '0.5px'
      }}>Zorrofin Connect</h1>

      {/* Status Message */}
      <p style={{
        fontSize: '14px',
        opacity: 0.9,
        marginBottom: '32px',
        minHeight: '20px'
      }}>{status}</p>

      {/* Loading Spinner */}
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid rgba(255, 255, 255, 0.3)',
        borderTop: '3px solid white',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}></div>

      {/* Version Info */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        fontSize: '11px',
        opacity: 0.7
      }}>
        Version 1.0.1
      </div>
    </div>
  );
};
