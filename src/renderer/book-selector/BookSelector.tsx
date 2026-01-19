// src/renderer/book-selector/BookSelector.tsx
import React, { useEffect, useState } from 'react';
import { BookCard } from './BookCard';

interface Book {
  id?: number;
  organization_id: string;
  name: string;
  organization_data?: any;
  biller_id: string;
}

interface BookSelectorProps {
  profile?: any;
}

export const BookSelector: React.FC<BookSelectorProps> = ({ profile }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [billerInfo, setBillerInfo] = useState<any>(null);

  useEffect(() => {
    loadBooks();
    
    // Listen for profile data from main process
    if (window.electronAPI?.onProfileData) {
      window.electronAPI.onProfileData((data: any) => {
        console.log('Profile data received:', data);
        loadBooks();
      });
    }
  }, []);

  const loadBooks = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get profile to show biller info
      const profile = await window.electronAPI?.getProfile?.();
      if (profile) {
        setBillerInfo({
          name: profile.name || profile.email,
          email: profile.email,
          biller_id: profile.biller_id
        });
      }
      
      const result = await window.electronAPI?.fetchBooksFromApi?.();
      
      if (result?.success) {
        // Filter books by biller_id (only show books for this biller)
        const allBooks = result.books || [];
        const filteredBooks = profile?.biller_id 
          ? allBooks.filter((b: Book) => b.biller_id === profile.biller_id)
          : allBooks;
        
        setBooks(filteredBooks);
        if (filteredBooks.length === 0) {
          setError('No books found for your account. Please contact support to add books.');
        }
      } else {
        setError(result?.error || 'Failed to load books');
      }
    } catch (err: any) {
      console.error('Error loading books:', err);
      setError(err.message || 'Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  const handleBookSelect = async (book: Book) => {
    if (connecting) return;
    
    setSelectedBook(book);
    setConnecting(true);
    
    try {
      const result = await window.electronAPI?.connectBook?.(book.organization_id);
      
      if (result?.success) {
        // Success - main process will handle navigation
        console.log('Book connected successfully:', book.name);
      } else {
        setError(result?.error || 'Failed to connect to book');
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

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}>
        <div style={{ fontSize: '18px', marginBottom: '16px' }}>Loading books...</div>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Please wait</div>
      </div>
    );
  }

  if (error && books.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        padding: '40px'
      }}>
        <div style={{ fontSize: '18px', marginBottom: '16px', color: '#ef4444' }}>{error}</div>
        <button
          onClick={loadBooks}
          style={{
            padding: '10px 20px',
            background: '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      padding: '40px',
      overflow: 'hidden'
    }}>
      {/* Biller Info Section */}
      {billerInfo && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '32px',
          color: 'white',
          boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
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

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px', fontWeight: '600' }}>Select a Book</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Choose a book to connect and start syncing data
        </p>
      </div>

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

      {books.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '12px', fontWeight: '500' }}>No books available</div>
          <div style={{ fontSize: '14px' }}>Please contact support to add books to your account</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
          overflowY: 'auto',
          flex: 1,
          paddingRight: '8px'
        }}>
          {books.map((book) => (
            <BookCard
              key={book.organization_id}
              book={book}
              isSelected={selectedBook?.organization_id === book.organization_id}
              isConnecting={connecting && selectedBook?.organization_id === book.organization_id}
              onSelect={() => handleBookSelect(book)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
