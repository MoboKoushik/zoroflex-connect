// src/renderer/login/Login.tsx
import React, { useState, FormEvent } from 'react';

interface LoginProps {}

export const Login: React.FC<LoginProps> = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      setMessage({ text: 'Enter email and password', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      console.log('Sending login request from renderer:', { email });

      if (!window.electronAPI || !window.electronAPI.login) {
        throw new Error('electronAPI not available!');
      }

      const result = await window.electronAPI.login({ email: email.trim(), password });
      console.log('Login response received in renderer:', typeof result);

      if (result.success) {
        setMessage({ text: 'Success! Redirecting...', type: 'success' });
        // The main process will handle window closing and navigation
        if (window.electronAPI?.onLoginSuccess) {
          window.electronAPI.onLoginSuccess(() => {
            console.log('Login success callback triggered');
          });
        }
      } else {
        setMessage({ text: result.message || 'Login failed', type: 'error' });
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setMessage({ text: 'Server not running or blocked', type: 'error' });
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.headerTitle}>Zorrofin Connect</h1>
          <p style={styles.headerSubtitle}>Tally to Cloud Sync Client</p>
        </div>
        <div style={styles.body}>
          <form onSubmit={handleSubmit}>
            <div style={styles.field}>
              <input
                type="email"
                id="email"
                placeholder="admin@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={styles.input}
              />
            </div>
            <div style={styles.field}>
              <input
                type="password"
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                style={styles.input}
              />
            </div>
            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? (
                <>
                  <span style={styles.spinner}></span>
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
            {message.text && (
              <div style={{ ...styles.message, color: message.type === 'success' ? '#107c10' : '#d13438' }}>
                {message.text}
              </div>
            )}
          </form>
        </div>
        <div style={styles.footer}>© 2025 Zorrofin Solutions • Version 1.0.0</div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f3f3f3',
    margin: 0,
    height: '100vh',
    fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", sans-serif',
  },
  card: {
    background: 'white',
    width: '100%',
    maxWidth: '400px',
    borderRadius: '2px',
    border: '1px solid #e1e1e1',
    overflow: 'hidden',
  },
  header: {
    padding: '1rem 1rem 0.875rem',
    textAlign: 'center',
    background: '#0078d4',
    color: 'white',
  },
  headerTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    marginBottom: '0.375rem',
    color: 'white',
    margin: 0,
  },
  headerSubtitle: {
    fontSize: '0.8125rem',
    opacity: 0.95,
    color: 'rgba(255, 255, 255, 0.95)',
    margin: 0,
  },
  body: {
    padding: '1.25rem',
  },
  field: {
    marginBottom: '0.875rem',
  },
  input: {
    width: '100%',
    height: '36px',
    padding: '0 12px',
    border: '1px solid #e1e1e1',
    borderRadius: '2px',
    fontSize: '0.875rem',
    transition: 'border-color 0.15s ease',
    background: 'white',
    fontFamily: '"Segoe UI", sans-serif',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    height: '36px',
    background: '#0078d4',
    color: 'white',
    border: '1px solid #0078d4',
    borderRadius: '2px',
    fontSize: '0.875rem',
    fontWeight: 400,
    cursor: 'pointer',
    marginTop: '0.5rem',
    transition: 'background-color 0.15s ease',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid rgba(255, 255, 255, 0.25)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    display: 'inline-block',
    marginRight: '10px',
  },
  message: {
    textAlign: 'center',
    marginTop: '0.75rem',
    fontSize: '0.8125rem',
    minHeight: '18px',
    fontWeight: 400,
  },
  footer: {
    textAlign: 'center',
    background: '#f3f3f3',
    fontSize: '0.75rem',
    color: '#605e5c',
    padding: '0.625rem',
    borderTop: '1px solid #e1e1e1',
  },
};

// Add spinner animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  button:hover:not(:disabled) {
    background: #106ebe !important;
    border-color: #106ebe !important;
  }
  button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  input:focus {
    outline: none;
    border-color: #0078d4;
  }
`;
document.head.appendChild(styleSheet);
