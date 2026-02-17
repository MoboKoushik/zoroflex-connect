// src/renderer/login/Login.tsx
import React, { useState, FormEvent } from 'react';
import { validateTallyInput, type TallyInputValidation } from '../../services/config/tally-url-helper';

interface LoginProps {}

export const Login: React.FC<LoginProps> = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tallyMode, setTallyMode] = useState<'local' | 'remote'>('local');
  const [tallyServerIp, setTallyServerIp] = useState('');
  const [tallyServerPort, setTallyServerPort] = useState('9000');
  const [tallyValidation, setTallyValidation] = useState<TallyInputValidation | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      setMessage({ text: 'Enter email and password', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      // Save Tally server configuration if remote mode is selected
      if (window.electronAPI?.setSetting && tallyMode === 'remote') {
        const ip = tallyServerIp.trim();
        const port = tallyServerPort.trim() || '9000';

        if (ip) {
          const constructedUrl = `http://${ip}:${port}`;
          await window.electronAPI.setSetting('tallyServerUrl', constructedUrl);
          console.log('Tally server configuration saved:', constructedUrl);
        }
      }

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

            {/* Advanced Settings - Expandable */}
            <div style={{ marginBottom: '0.875rem' }}>
              <div
                onClick={() => !loading && setShowAdvanced(!showAdvanced)}
                style={{
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.8125rem',
                  color: '#605e5c',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 8px',
                  userSelect: 'none',
                  opacity: loading ? 0.5 : 1,
                  borderRadius: '2px',
                  transition: 'background-color 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = '#f3f2f1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{
                  fontSize: '0.625rem',
                  transition: 'transform 0.15s ease',
                  transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
                  display: 'inline-block'
                }}>
                  ▶
                </span>
                <span>Advanced settings</span>
              </div>

              {showAdvanced && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: '#faf9f8',
                  border: '1px solid #edebe9',
                  borderRadius: '2px',
                }}>
                  {/* Radio buttons for Local/Remote */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.8125rem',
                      color: '#201f1e',
                      padding: '4px',
                      borderRadius: '2px',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) e.currentTarget.style.background = '#f3f2f1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}>
                      <input
                        type="radio"
                        name="tallyMode"
                        value="local"
                        checked={tallyMode === 'local'}
                        onChange={() => {
                          setTallyMode('local');
                          setTallyValidation(null);
                        }}
                        disabled={loading}
                        style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
                      />
                      <span>Local Tally <span style={{ color: '#605e5c', fontSize: '0.75rem' }}>(localhost:9000)</span></span>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.8125rem',
                      color: '#201f1e',
                      padding: '4px',
                      borderRadius: '2px',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) e.currentTarget.style.background = '#f3f2f1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}>
                      <input
                        type="radio"
                        name="tallyMode"
                        value="remote"
                        checked={tallyMode === 'remote'}
                        onChange={() => {
                          setTallyMode('remote');
                          // Validate if fields are filled
                          if (tallyServerIp.trim()) {
                            const ip = tallyServerIp.trim();
                            const port = tallyServerPort.trim() || '9000';
                            const constructedUrl = `http://${ip}:${port}`;
                            setTallyValidation(validateTallyInput(constructedUrl));
                          }
                        }}
                        disabled={loading}
                        style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
                      />
                      <span>Remote Tally</span>
                    </label>
                  </div>

                  {/* Show IP and Port fields only when Remote is selected */}
                  {tallyMode === 'remote' && (
                    <div style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: 'white',
                      border: '1px solid #edebe9',
                      borderRadius: '2px',
                    }}>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                        {/* IP/Domain Input */}
                        <div style={{ flex: 2 }}>
                          <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            color: '#323130',
                            marginBottom: '3px',
                            fontWeight: 400,
                          }}>
                            IP/Domain
                          </label>
                          <input
                            type="text"
                            placeholder="192.168.1.100"
                            value={tallyServerIp}
                            onChange={(e) => {
                              const value = e.target.value;
                              setTallyServerIp(value);
                              // Validate the constructed URL
                              if (value.trim()) {
                                const ip = value.trim();
                                const port = tallyServerPort.trim() || '9000';
                                const constructedUrl = `http://${ip}:${port}`;
                                setTallyValidation(validateTallyInput(constructedUrl));
                              } else {
                                setTallyValidation(null);
                              }
                            }}
                            disabled={loading}
                            style={{
                              width: '100%',
                              height: '30px',
                              padding: '0 8px',
                              border: '1px solid #e1e1e1',
                              borderRadius: '2px',
                              fontSize: '0.8125rem',
                              fontFamily: '"Segoe UI", sans-serif',
                              boxSizing: 'border-box',
                              transition: 'border-color 0.1s ease',
                              borderColor: tallyValidation?.isValid === false ? '#e81123' : '#e1e1e1',
                              outline: 'none',
                            }}
                          />
                        </div>

                        {/* Port Input */}
                        <div style={{ flex: 1 }}>
                          <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            color: '#323130',
                            marginBottom: '3px',
                            fontWeight: 400,
                          }}>
                            Port
                          </label>
                          <input
                            type="number"
                            placeholder="9000"
                            min="1"
                            max="65535"
                            value={tallyServerPort}
                            onChange={(e) => {
                              const value = e.target.value;
                              setTallyServerPort(value);
                              // Validate the constructed URL
                              if (tallyServerIp.trim()) {
                                const ip = tallyServerIp.trim();
                                const port = value.trim() || '9000';
                                const constructedUrl = `http://${ip}:${port}`;
                                setTallyValidation(validateTallyInput(constructedUrl));
                              }
                            }}
                            disabled={loading}
                            style={{
                              width: '100%',
                              height: '30px',
                              padding: '0 8px',
                              border: '1px solid #e1e1e1',
                              borderRadius: '2px',
                              fontSize: '0.8125rem',
                              fontFamily: '"Segoe UI", sans-serif',
                              boxSizing: 'border-box',
                              transition: 'border-color 0.1s ease',
                              borderColor: tallyValidation?.isValid === false ? '#e81123' : '#e1e1e1',
                              outline: 'none',
                            }}
                          />
                        </div>
                      </div>

                      {/* Validation Feedback */}
                      <div style={{
                        fontSize: '0.6875rem',
                        minHeight: '14px',
                        marginTop: '4px',
                        paddingLeft: '2px',
                      }}>
                        {tallyValidation?.error ? (
                          <span style={{ color: '#e81123' }}>⚠ {tallyValidation.error}</span>
                        ) : tallyValidation?.resolvedUrl ? (
                          <span style={{ color: '#107c10' }}>✓ {tallyValidation.resolvedUrl}</span>
                        ) : tallyServerIp.trim() ? (
                          <span style={{ color: '#8a8886' }}>Validating...</span>
                        ) : (
                          <span style={{ color: '#8a8886' }}>Enter server details</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
    background: '#f3f2f1',
    margin: 0,
    height: '100vh',
    fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  card: {
    background: 'white',
    width: '100%',
    maxWidth: '400px',
    borderRadius: '2px',
    border: '1px solid #edebe9',
    overflow: 'hidden',
    boxShadow: '0 3.2px 7.2px rgba(0,0,0,.132), 0 0.6px 1.8px rgba(0,0,0,.108)',
  },
  header: {
    padding: '20px 20px 16px',
    textAlign: 'center',
    background: '#0078d4',
    color: 'white',
  },
  headerTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    marginBottom: '6px',
    color: 'white',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  headerSubtitle: {
    fontSize: '0.8125rem',
    opacity: 0.95,
    color: 'rgba(255, 255, 255, 0.95)',
    margin: 0,
    fontWeight: 400,
  },
  body: {
    padding: '20px',
  },
  field: {
    marginBottom: '12px',
  },
  input: {
    width: '100%',
    height: '32px',
    padding: '0 10px',
    border: '1px solid #8a8886',
    borderRadius: '2px',
    fontSize: '0.875rem',
    transition: 'border-color 0.1s ease, box-shadow 0.1s ease',
    background: 'white',
    fontFamily: '"Segoe UI", sans-serif',
    boxSizing: 'border-box',
    color: '#323130',
  },
  button: {
    width: '100%',
    height: '32px',
    background: '#0078d4',
    color: 'white',
    border: '1px solid transparent',
    borderRadius: '2px',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'background-color 0.1s ease',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Segoe UI", sans-serif',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block',
    marginRight: '8px',
  },
  message: {
    textAlign: 'center',
    marginTop: '12px',
    fontSize: '0.8125rem',
    minHeight: '18px',
    fontWeight: 400,
  },
  footer: {
    textAlign: 'center',
    background: '#faf9f8',
    fontSize: '0.6875rem',
    color: '#605e5c',
    padding: '10px',
    borderTop: '1px solid #edebe9',
  },
};

// Add Windows 11 style animations and interactions
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  button:hover:not(:disabled) {
    background: #106ebe !important;
  }
  button:active:not(:disabled) {
    background: #005a9e !important;
  }
  button:disabled {
    background: #f3f2f1 !important;
    color: #a19f9d !important;
    border-color: transparent !important;
    cursor: not-allowed;
  }
  input:focus {
    outline: none;
    border-color: #0078d4 !important;
    box-shadow: inset 0 0 0 1px #0078d4 !important;
  }
  input:hover:not(:focus):not(:disabled) {
    border-color: #323130 !important;
  }
  input::placeholder {
    color: #8a8886;
    font-weight: 400;
  }
`;
document.head.appendChild(styleSheet);
