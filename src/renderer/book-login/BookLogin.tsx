// src/renderer/book-login/BookLogin.tsx
import React, { useState } from 'react';

interface Book {
  id?: number;
  organization_id: string;
  name: string;
  organization_data?: any;
  biller_id: string;
}

export const BookLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [billerInfo, setBillerInfo] = useState<any>(null);
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
      if (!window.electronAPI?.login) {
        setError('Electron API not available');
        return;
      }

      const result = await window.electronAPI.login({ email, password });
      
      if (result?.success) {
        // Get profile to show biller info
        const profile = await window.electronAPI.getProfile?.();
        if (profile) {
          setBillerInfo({
            name: profile.name || profile.email,
            email: profile.email,
            biller_id: profile.biller_id
          });
        }

        // Fetch books and show in same popup
        const booksResult = await window.electronAPI.fetchBooksFromApi?.();
        
        if (booksResult?.success) {
          const allBooks = booksResult.books || [];
          // Filter books by biller_id
          const filteredBooks = profile?.biller_id 
            ? allBooks.filter((b: Book) => b.biller_id === profile.biller_id)
            : allBooks;
          
          setBooks(filteredBooks);
          setLoggedIn(true);
          
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
        // Success - window will be closed by main process
        // Send event to refresh dashboard
        if (window.electronAPI?.sendBookLoginSuccess) {
          window.electronAPI.sendBookLoginSuccess({ book: result.book });
        }
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

  // Show book selector after login
  if (loggedIn && books.length > 0) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
        overflowY: 'auto'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '900px',
          margin: '0 auto',
          padding: '40px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)'
        }}>
          {/* Biller Info */}
          {billerInfo && (
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '32px',
              color: 'white'
            }}>
              <div style={{
                fontSize: '12px',
                opacity: 0.9,
                marginBottom: '8px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>Biller Information</div>
              <div style={{
                fontSize: '20px',
                fontWeight: '600',
                marginBottom: '4px'
              }}>{billerInfo.name}</div>
              <div style={{
                fontSize: '14px',
                opacity: 0.9
              }}>{billerInfo.email}</div>
            </div>
          )}

          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#1a1a1a',
            marginBottom: '24px'
          }}>Select a Book to Connect</h2>

          {error && (
            <div style={{
              padding: '12px 16px',
              background: '#fee2e2',
              color: '#dc2626',
              borderRadius: '6px',
              marginBottom: '24px',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {/* Book List */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
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
                    padding: '20px',
                    background: isSelected 
                      ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)' 
                      : 'white',
                    border: isSelected 
                      ? '2px solid #667eea' 
                      : '1px solid #e5e7eb',
                    borderRadius: '12px',
                    cursor: connecting ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: connecting && !isSelected ? 0.6 : 1,
                    boxShadow: isSelected 
                      ? '0 4px 12px rgba(102, 126, 234, 0.2)' 
                      : '0 2px 4px rgba(0, 0, 0, 0.05)'
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
                  <div style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#1a1a1a',
                    marginBottom: '12px'
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

                  <div style={{
                    marginTop: '16px',
                    padding: '10px 16px',
                    background: isSelected 
                      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                      : connecting && isSelected
                        ? '#e5e7eb' 
                        : '#f3f4f6',
                    color: isSelected || (connecting && isSelected) ? 'white' : '#374151',
                    borderRadius: '8px',
                    fontSize: '13px',
                    textAlign: 'center',
                    fontWeight: '600'
                  }}>
                    {connecting && isSelected ? 'Connecting...' : 'Connect'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Show login form
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '40px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            color: 'white',
            fontWeight: 'bold'
          }}>Z</div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#1a1a1a',
            marginBottom: '8px'
          }}>Connect New Book</h1>
          <p style={{
            fontSize: '14px',
            color: '#666',
            margin: 0
          }}>Login with your biller credentials</p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '12px 16px',
            background: '#fee2e2',
            color: '#dc2626',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '15px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
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
              color: '#374151',
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
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
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
            {loading ? 'Connecting...' : 'Login & Fetch Books'}
          </button>
        </form>

        {/* Footer */}
        <p style={{
          fontSize: '12px',
          color: '#9ca3af',
          textAlign: 'center',
          margin: 0
        }}>
          This will fetch books associated with your account
        </p>
      </div>
    </div>
  );
};
