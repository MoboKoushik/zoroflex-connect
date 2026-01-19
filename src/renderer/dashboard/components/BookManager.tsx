// src/renderer/dashboard/components/BookManager.tsx
import React, { useEffect, useState } from 'react';

interface Book {
  id: number;
  biller_id: string;
  organization_id: string;
  tally_id: string;
  name: string;
  gstin?: string;
  address?: string;
  state?: string;
  country: string;
  is_active: number;
  sync_status?: 'ACTIVE' | 'SYNCING' | 'ERROR' | 'INACTIVE';
  connection_status?: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  last_synced_at?: string;
  auto_sync_enabled?: number;
}

interface BookManagerProps {
  onBookSwitched?: (bookId: number) => void;
}

export const BookManager: React.FC<BookManagerProps> = ({ onBookSwitched }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [syncingBooks, setSyncingBooks] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI?.getAllBooks?.();
      if (result?.success) {
        setBooks(result.books || []);
      } else {
        setToast({ message: result?.error || 'Failed to load books', type: 'error' });
      }
    } catch (error: any) {
      setToast({ message: error.message || 'Error loading books', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddBook = () => {
    setShowAddDialog(true);
  };

  const handleSaveBook = async (bookData: any) => {
    try {
      const result = await window.electronAPI?.addBook?.(bookData);
      if (result?.success) {
        setToast({ message: result.message || 'Book added successfully', type: 'success' });
        setShowAddDialog(false);
        await loadBooks();
      } else {
        setToast({ message: result?.error || 'Failed to add book', type: 'error' });
      }
    } catch (error: any) {
      setToast({ message: error.message || 'Error adding book', type: 'error' });
    }
  };

  const handleSwitchBook = async (bookId: number, makeExclusive: boolean = false) => {
    try {
      const result = await window.electronAPI?.switchBook?.(bookId, makeExclusive);
      if (result?.success) {
        setToast({ message: 'Book switched successfully', type: 'success' });
        await loadBooks();
        onBookSwitched?.(bookId);
      } else {
        setToast({ message: result?.error || 'Failed to switch book', type: 'error' });
      }
    } catch (error: any) {
      setToast({ message: error.message || 'Error switching book', type: 'error' });
    }
  };

  const handleSyncBook = async (bookId: number) => {
    try {
      setSyncingBooks(prev => new Set(prev).add(bookId));
      const result = await window.electronAPI?.syncBook?.(bookId, 'MANUAL');
      if (result?.success) {
        setToast({ message: 'Sync started successfully', type: 'success' });
        await loadBooks();
      } else {
        setToast({ message: result?.error || 'Failed to start sync', type: 'error' });
      }
    } catch (error: any) {
      setToast({ message: error.message || 'Error syncing book', type: 'error' });
    } finally {
      setSyncingBooks(prev => {
        const newSet = new Set(prev);
        newSet.delete(bookId);
        return newSet;
      });
    }
  };

  const handleRemoveBook = async (bookId: number) => {
    if (!window.electronAPI?.showConfirmDialog) {
      const confirmed = window.confirm('Are you sure you want to remove this book? This action cannot be undone.');
      if (!confirmed) return;
    } else {
      const confirmed = await window.electronAPI.showConfirmDialog({
        type: 'warning',
        title: 'Remove Book',
        message: 'Are you sure you want to remove this book?',
        detail: 'This will disconnect the book and remove it from your list. The database will be kept locally.',
        buttons: ['Cancel', 'Remove'],
        defaultId: 0,
        cancelId: 0
      });
      if (!confirmed) return;
    }

    try {
      const result = await window.electronAPI?.removeBook?.(bookId);
      if (result?.success) {
        setToast({ message: 'Book removed successfully', type: 'success' });
        await loadBooks();
      } else {
        setToast({ message: result?.error || 'Failed to remove book', type: 'error' });
      }
    } catch (error: any) {
      setToast({ message: error.message || 'Error removing book', type: 'error' });
    }
  };

  const handleUpdateCredentials = async (bookId: number, credentials: any) => {
    try {
      const result = await window.electronAPI?.updateBookCredentials?.(bookId, credentials);
      if (result?.success) {
        setToast({ message: 'Credentials updated successfully', type: 'success' });
        setShowCredentialsDialog(false);
        await loadBooks();
      } else {
        setToast({ message: result?.error || 'Failed to update credentials', type: 'error' });
      }
    } catch (error: any) {
      setToast({ message: error.message || 'Error updating credentials', type: 'error' });
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'CONNECTED':
        return 'bg-green-500';
      case 'SYNCING':
        return 'bg-blue-500';
      case 'ERROR':
      case 'DISCONNECTED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (book: Book) => {
    if (book.sync_status === 'SYNCING') return 'Syncing...';
    if (book.connection_status === 'CONNECTED' && book.sync_status === 'ACTIVE') return 'Active';
    if (book.connection_status === 'ERROR' || book.sync_status === 'ERROR') return 'Error';
    if (book.connection_status === 'DISCONNECTED') return 'Disconnected';
    return 'Inactive';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading books...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Manage Tally Books</h2>
        <button
          onClick={handleAddBook}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Add New Book
        </button>
      </div>

      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            toast.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {books.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 mb-4">No books configured yet.</p>
          <button
            onClick={handleAddBook}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Your First Book
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isActive={book.is_active === 1}
              isSyncing={syncingBooks.has(book.id)}
              statusText={getStatusText(book)}
              statusColor={getStatusColor(
                book.sync_status === 'SYNCING' ? 'SYNCING' : book.connection_status
              )}
              onSwitch={() => handleSwitchBook(book.id, false)}
              onSync={() => handleSyncBook(book.id)}
              onRemove={() => handleRemoveBook(book.id)}
              onUpdateCredentials={() => {
                setSelectedBook(book);
                setShowCredentialsDialog(true);
              }}
              lastSyncedAt={book.last_synced_at}
            />
          ))}
        </div>
      )}

      {showAddDialog && (
        <AddBookDialog
          onClose={() => setShowAddDialog(false)}
          onSave={handleSaveBook}
        />
      )}

      {showCredentialsDialog && selectedBook && (
        <UpdateCredentialsDialog
          book={selectedBook}
          onClose={() => {
            setShowCredentialsDialog(false);
            setSelectedBook(null);
          }}
          onSave={(credentials) => handleUpdateCredentials(selectedBook.id, credentials)}
        />
      )}
    </div>
  );
};

// Book Card Component
interface BookCardProps {
  book: Book;
  isActive: boolean;
  isSyncing: boolean;
  statusText: string;
  statusColor: string;
  onSwitch: () => void;
  onSync: () => void;
  onRemove: () => void;
  onUpdateCredentials: () => void;
  lastSyncedAt?: string;
}

const BookCard: React.FC<BookCardProps> = ({
  book,
  isActive,
  isSyncing,
  statusText,
  statusColor,
  onSwitch,
  onSync,
  onRemove,
  onUpdateCredentials,
  lastSyncedAt
}) => {
  return (
    <div
      className={`bg-white rounded-lg shadow-md p-4 border-2 ${
        isActive ? 'border-blue-500' : 'border-gray-200'
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-gray-800">{book.name}</h3>
          <p className="text-sm text-gray-600">{book.organization_id}</p>
        </div>
        {isActive && (
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            Active
          </span>
        )}
      </div>

      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${statusColor}`}></div>
          <span className="text-sm text-gray-600">{statusText}</span>
        </div>
        {lastSyncedAt && (
          <p className="text-xs text-gray-500">
            Last sync: {new Date(lastSyncedAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {!isActive && (
          <button
            onClick={onSwitch}
            className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Switch
          </button>
        )}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
            isSyncing
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {isSyncing ? 'Syncing...' : 'Sync'}
        </button>
        <button
          onClick={onUpdateCredentials}
          className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
          title="Update Credentials"
        >
          🔑
        </button>
        <button
          onClick={onRemove}
          className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
          title="Remove Book"
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

// Add Book Dialog Component
interface AddBookDialogProps {
  onClose: () => void;
  onSave: (bookData: any) => void;
}

const AddBookDialog: React.FC<AddBookDialogProps> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    organization_id: '',
    tally_id: '',
    name: '',
    tally_username: '',
    tally_password: '',
    gstin: '',
    address: '',
    state: '',
    country: 'India',
    pin: '',
    trn: '',
    book_start_from: new Date().toISOString().split('T')[0],
    auto_sync_enabled: true,
    sync_interval_minutes: 60
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.organization_id || !formData.name || !formData.tally_username || !formData.tally_password) {
      alert('Please fill in all required fields');
      return;
    }
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">Add New Tally Book</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Book Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Company Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.organization_id}
                onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Organization UUID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tally ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.tally_id}
                onChange={(e) => setFormData({ ...formData, tally_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Tally Company ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Book Start From
              </label>
              <input
                type="date"
                value={formData.book_start_from}
                onChange={(e) => setFormData({ ...formData, book_start_from: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tally Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.tally_username}
                onChange={(e) => setFormData({ ...formData, tally_username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Tally username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tally Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                value={formData.tally_password}
                onChange={(e) => setFormData({ ...formData, tally_password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Tally password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
              <input
                type="text"
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="GST Number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TRN/VAT</label>
              <input
                type="text"
                value={formData.trn}
                onChange={(e) => setFormData({ ...formData, trn: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Tax Registration Number"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Company Address"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="State"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Country"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN Code</label>
              <input
                type="text"
                value={formData.pin}
                onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="PIN"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto_sync"
              checked={formData.auto_sync_enabled}
              onChange={(e) => setFormData({ ...formData, auto_sync_enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="auto_sync" className="text-sm text-gray-700">
              Enable automatic sync for this book
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Book
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Update Credentials Dialog Component
interface UpdateCredentialsDialogProps {
  book: Book;
  onClose: () => void;
  onSave: (credentials: any) => void;
}

const UpdateCredentialsDialog: React.FC<UpdateCredentialsDialogProps> = ({ book, onClose, onSave }) => {
  const [credentials, setCredentials] = useState({
    tally_username: '',
    tally_password: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.tally_username || !credentials.tally_password) {
      alert('Please fill in both username and password');
      return;
    }
    onSave(credentials);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold mb-4">Update Credentials - {book.name}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tally Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={credentials.tally_username}
              onChange={(e) => setCredentials({ ...credentials, tally_username: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Tally username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tally Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={credentials.tally_password}
              onChange={(e) => setCredentials({ ...credentials, tally_password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Tally password"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
