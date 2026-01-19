// src/renderer/dashboard/components/ConnectBookModal.tsx
import React, { useState } from 'react';

interface Book {
  id?: number;
  organization_id: string;
  name: string;
  organization_data?: any;
  biller_id: string;
}

interface BillerInfo {
  name?: string;
  email?: string;
  biller_id?: string;
  organization?: any;
}

interface ConnectBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookConnected?: () => void;
}

export const ConnectBookModal: React.FC<ConnectBookModalProps> = ({
  isOpen,
  onClose,
  onBookConnected
}) => {
  const [step, setStep] = useState<'login' | 'books'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billerInfo, setBillerInfo] = useState<BillerInfo | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [connecting, setConnecting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!window.electronAPI) {
        setError('Electron API not available. Please refresh the page.');
        return;
      }

      if (!window.electronAPI.login) {
        setError('Login API not available. Please refresh the page.');
        return;
      }

      const result = await window.electronAPI.login({ email, password });
      
      if (result?.success) {
        // Get profile to show biller info
        const profile = await window.electronAPI.getProfile?.();
        if (profile) {
          // ✅ Enhanced profile info with organization data
          setBillerInfo({
            name: profile.organization?.response?.name || profile.name || profile.email,
            email: profile.email,
            biller_id: profile.biller_id,
            organization: profile.organization
          });
        }

        // Fetch books and show in modal
        const booksResult = await window.electronAPI.fetchBooksFromApi?.();
        
        if (booksResult?.success) {
          const allBooks = booksResult.books || [];
          // Filter books by biller_id
          const filteredBooks = profile?.biller_id 
            ? allBooks.filter((b: Book) => b.biller_id === profile.biller_id)
            : allBooks;
          
          setBooks(filteredBooks);
          setStep('books');
          
          if (filteredBooks.length === 0) {
            setError('No books found for your account. Please contact support.');
          }
        } else {
          setError(booksResult?.error || 'Failed to fetch books');
        }
      } else {
        setError(result?.message || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectBook = async (book: Book) => {
    if (connecting) return;
    
    setSelectedBook(book);
    setConnecting(true);
    setError(null);

    try {
      const result = await window.electronAPI?.connectBook?.(book.organization_id);
      
      if (result?.success) {
        // Success - close modal and refresh
        onBookConnected?.();
        handleClose();
      } else {
        setError(result?.error || 'Failed to connect book');
        setSelectedBook(null);
      }
    } catch (err: any) {
      console.error('Error connecting book:', err);
      setError(err.message || 'Failed to connect to book');
      setSelectedBook(null);
    } finally {
      setConnecting(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setStep('login');
    setEmail('');
    setPassword('');
    setLoading(false);
    setError(null);
    setBillerInfo(null);
    setBooks([]);
    setSelectedBook(null);
    setConnecting(false);
    onClose();
  };

  const handleBack = () => {
    setStep('login');
    setBooks([]);
    setBillerInfo(null);
    setError(null);
  };

  if (!isOpen) return null;

  // Desktop-style modal with backdrop blur
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
      animation: 'fadeIn 0.2s ease-out'
    }} onClick={handleClose}>
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      
      <div style={{
        width: '100%',
        maxWidth: step === 'login' ? '480px' : '1200px',
        maxHeight: '90vh',
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUp 0.3s ease-out'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header - Desktop Style */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {step === 'books' && (
              <button
                onClick={handleBack}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '6px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'white',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateX(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                ←
              </button>
            )}
            <div>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                margin: 0,
                lineHeight: '1.2'
              }}>
                {step === 'login' ? 'Connect New Book' : 'Select a Book to Connect'}
              </h2>
              {step === 'books' && billerInfo && (
                <p style={{
                  fontSize: '13px',
                  margin: '4px 0 0 0',
                  opacity: 0.9,
                  fontWeight: '400'
                }}>
                  Logged in as: {billerInfo.name || billerInfo.email}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
              fontSize: '20px',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'rotate(90deg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'rotate(0deg)';
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: step === 'login' ? '40px' : '24px',
          background: 'var(--bg-secondary, #f9fafb)'
        }}>
          {step === 'login' ? (
            // Login Step
            <>
              {error && (
                <div style={{
                  padding: '12px 16px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  borderRadius: '8px',
                  marginBottom: '24px',
                  fontSize: '14px',
                  border: '1px solid #fecaca',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} style={{ margin: 0 }}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-primary, #374151)',
                    marginBottom: '8px'
                  }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    disabled={loading}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '15px',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box',
                      background: 'var(--bg-primary, #ffffff)'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-primary, #374151)',
                    marginBottom: '8px'
                  }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '15px',
                      border: '1px solid var(--border-color, #d1d5db)',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box',
                      background: 'var(--bg-primary, #ffffff)'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: 'white',
                    background: loading 
                      ? '#9ca3af' 
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: loading 
                      ? 'none' 
                      : '0 4px 12px rgba(102, 126, 234, 0.4)',
                    transition: 'all 0.2s',
                    marginBottom: '16px'
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                    }
                  }}
                >
                  {loading ? 'Connecting...' : 'Continue'}
                </button>
              </form>
            </>
          ) : (
            // Books Selection Step
            <>
              {billerInfo && (
                <div style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '24px',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                  color: 'white'
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: 'rgba(255, 255, 255, 0.8)',
                    marginBottom: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}>✓ Logged In As</div>
                  
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '22px',
                        fontWeight: '700',
                        color: '#ffffff',
                        marginBottom: '8px',
                        lineHeight: '1.3'
                      }}>
                        {billerInfo.name || billerInfo.email}
                      </div>
                      
                      <div style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.9)',
                        marginBottom: '12px'
                      }}>
                        {billerInfo.email}
                      </div>
                      
                      {billerInfo.biller_id && (
                        <div style={{
                          display: 'inline-block',
                          fontSize: '11px',
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontFamily: 'monospace',
                          background: 'rgba(255, 255, 255, 0.15)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          marginTop: '8px',
                          fontWeight: '500'
                        }}>
                          Biller ID: {billerInfo.biller_id}
                        </div>
                      )}
                    </div>
                    
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      flexShrink: 0,
                      border: '2px solid rgba(255, 255, 255, 0.3)'
                    }}>
                      👤
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div style={{
                  padding: '12px 16px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  borderRadius: '8px',
                  marginBottom: '24px',
                  fontSize: '14px',
                  border: '1px solid #fecaca'
                }}>
                  {error}
                </div>
              )}

              {books.length > 0 ? (
                <>
                  <div style={{
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: 'var(--text-primary, #1f2937)',
                        marginBottom: '4px'
                      }}>
                        Available Books
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary, #6b7280)'
                      }}>
                        Select a book to connect
                      </div>
                    </div>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#667eea',
                      background: 'rgba(102, 126, 234, 0.1)',
                      padding: '6px 12px',
                      borderRadius: '8px'
                    }}>
                      {books.length} {books.length === 1 ? 'book' : 'books'}
                    </div>
                  </div>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '16px'
                  }}>
                    {books.map((book) => {
                      const orgData = book.organization_data || {};
                      const displayName = book.name || orgData.company_name || orgData.name || book.organization_id;
                      const isSelected = selectedBook?.organization_id === book.organization_id;
                      
                      return (
                        <div
                          key={book.organization_id}
                          onClick={() => !connecting && handleConnectBook(book)}
                          style={{
                            padding: '24px',
                            background: isSelected 
                              ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)' 
                              : 'var(--bg-primary, #ffffff)',
                            border: isSelected 
                              ? '2px solid #667eea' 
                              : '1px solid var(--border-color, #e5e7eb)',
                            borderRadius: '12px',
                            cursor: connecting ? 'wait' : 'pointer',
                            transition: 'all 0.2s ease',
                            opacity: connecting && !isSelected ? 0.6 : 1,
                            boxShadow: isSelected 
                              ? '0 4px 12px rgba(102, 126, 234, 0.2)' 
                              : '0 2px 4px rgba(0, 0, 0, 0.05)',
                            position: 'relative'
                          }}
                          onMouseEnter={(e) => {
                            if (!connecting) {
                              e.currentTarget.style.transform = 'translateY(-4px)';
                              e.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.15)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!connecting) {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = isSelected 
                                ? '0 4px 12px rgba(102, 126, 234, 0.2)' 
                                : '0 2px 4px rgba(0, 0, 0, 0.05)';
                            }
                          }}
                        >
                          {/* Book Icon */}
                          <div style={{
                            fontSize: '32px',
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                          }}>
                            <span>📚</span>
                            <div style={{
                              fontSize: '18px',
                              fontWeight: '700',
                              color: 'var(--text-primary, #1f2937)',
                              flex: 1
                            }}>
                              {displayName}
                            </div>
                          </div>
                          
                          {/* Organization ID */}
                          <div style={{
                            fontSize: '11px',
                            color: 'var(--text-secondary, #6b7280)',
                            marginBottom: '16px',
                            fontFamily: 'monospace',
                            background: 'var(--bg-tertiary, #f3f4f6)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            display: 'inline-block',
                            fontWeight: '500'
                          }}>
                            ID: {book.organization_id.slice(0, 8)}...
                          </div>

                          {/* Additional Info */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            marginBottom: '16px'
                          }}>
                            {orgData.gstin && (
                              <div style={{
                                fontSize: '13px',
                                color: 'var(--text-secondary, #4b5563)',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}>
                                <span>🏢</span>
                                <span>GSTIN: {orgData.gstin}</span>
                              </div>
                            )}
                            
                            {orgData.address && (
                              <div style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary, #6b7280)',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px'
                              }}>
                                <span>📍</span>
                                <span style={{ flex: 1 }}>{orgData.address}</span>
                              </div>
                            )}
                          </div>

                          {/* Connect Button */}
                          <div style={{
                            marginTop: '20px',
                            padding: '12px 20px',
                            background: isSelected 
                              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                              : connecting && isSelected
                                ? '#e5e7eb' 
                                : '#f3f4f6',
                            color: isSelected || (connecting && isSelected) ? 'white' : 'var(--text-primary, #374151)',
                            borderRadius: '8px',
                            fontSize: '14px',
                            textAlign: 'center',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                            border: isSelected ? 'none' : '1px solid #e5e7eb'
                          }}>
                            {connecting && isSelected ? (
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <span style={{
                                  width: '14px',
                                  height: '14px',
                                  border: '2px solid rgba(255, 255, 255, 0.3)',
                                  borderTopColor: 'white',
                                  borderRadius: '50%',
                                  animation: 'spin 0.8s linear infinite',
                                  display: 'inline-block'
                                }}></span>
                                Connecting...
                              </span>
                            ) : (
                              'Connect Book'
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <style>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                </>
              ) : (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: 'var(--text-secondary, #6b7280)'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
                  <div style={{ fontSize: '16px', fontWeight: '500' }}>No books available</div>
                  <div style={{ fontSize: '14px', marginTop: '8px' }}>Please contact support to add books to your account</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
