// src/renderer/dashboard/components/BookSelectorDropdown.tsx
import React, { useEffect, useState } from 'react';

interface Book {
  id: number;
  biller_id: string;
  organization_id: string;
  name: string;
  tally_id: string;
  gstin?: string;
  is_active: number;
  sync_status?: string;
  last_synced_at?: string;
}

interface BookSelectorDropdownProps {
  onBookChange?: (bookId: number) => void;
  showConnectButton?: boolean;
  onConnectClick?: () => void;
}

export const BookSelectorDropdown: React.FC<BookSelectorDropdownProps> = ({
  onBookChange,
  showConnectButton = true,
  onConnectClick
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBooks();
    
    // Listen for book connection event
    if (window.electronAPI?.onBookConnected) {
      const cleanup = window.electronAPI.onBookConnected((data: any) => {
        console.log('Book connected event received:', data);
        loadBooks();
      });
      return cleanup;
    }
  }, []);

  const loadBooks = async () => {
    try {
      setLoading(true);
      
      // Get all books
      const allBooksResult = await window.electronAPI?.getAllBooks?.();
      
      // Get active book
      const activeBooksResult = await window.electronAPI?.getActiveBooks?.();
      
      if (allBooksResult?.success) {
        const allBooks = allBooksResult.books || [];
        setBooks(allBooks);
        
        // Set current book
        if (activeBooksResult?.success && activeBooksResult.books && activeBooksResult.books.length > 0) {
          const activeBook = activeBooksResult.books[0];
          setCurrentBook(activeBook);
        } else if (allBooks.length > 0) {
          // If no active book but books exist, select first one
          setCurrentBook(allBooks[0]);
        }
      }
    } catch (error: any) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookChange = async (bookId: number) => {
    try {
      const book = books.find(b => b.id === bookId);
      if (!book) return;

      // Switch to this book
      const result = await window.electronAPI?.switchBook?.(bookId, false);
      
      if (result?.success) {
        setCurrentBook(book);
        // Reload all data
        onBookChange?.(bookId);
        
        // Notify dashboard to reload
        window.dispatchEvent(new CustomEvent('book-switched', { detail: { bookId } }));
      } else {
        console.error('Failed to switch book:', result?.error);
      }
    } catch (error: any) {
      console.error('Error switching book:', error);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        background: 'var(--bg-secondary)',
        borderRadius: '6px'
      }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading books...</div>
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px'
      }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          No books connected
        </div>
        {showConnectButton && (
          <button
            onClick={onConnectClick}
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: '500',
              color: 'white',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}
          >
            + Connect New Book
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 16px',
      background: 'var(--bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)'
    }}>
      <label style={{
        fontSize: '13px',
        fontWeight: '500',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap'
      }}>
        Book:
      </label>
      
      <select
        value={currentBook?.id || ''}
        onChange={(e) => {
          const bookId = parseInt(e.target.value);
          if (bookId) {
            handleBookChange(bookId);
          }
        }}
        style={{
          minWidth: '250px',
          padding: '6px 32px 6px 12px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'var(--text-primary)',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          cursor: 'pointer',
          outline: 'none'
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#667eea';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-color)';
        }}
      >
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {book.name} {book.is_active ? '✓' : ''}
          </option>
        ))}
      </select>

      {currentBook?.last_synced_at && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap'
        }}>
          Last synced: {new Date(currentBook.last_synced_at).toLocaleDateString()}
        </div>
      )}

      {showConnectButton && (
        <button
          onClick={onConnectClick}
          style={{
            padding: '6px 16px',
            fontSize: '13px',
            fontWeight: '500',
            color: 'white',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
            marginLeft: '8px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
          }}
        >
          + Connect New Book
        </button>
      )}
    </div>
  );
};
