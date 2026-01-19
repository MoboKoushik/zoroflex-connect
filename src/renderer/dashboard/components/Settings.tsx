// src/renderer/dashboard/components/Settings.tsx
import React, { useEffect, useState } from 'react';

interface SettingsProps {
  company?: any;
}

export const Settings: React.FC<SettingsProps> = ({ company }) => {
  const [settings, setSettings] = useState({
    soundEnabled: true,
    theme: 'system', // ✅ Default to system mode
    syncDuration: 300, // 5 minutes in seconds
    backgroundSyncEnabled: true,
    apiEndpoint: '',
    autoSync: true,
    syncOnStartup: true,
    showNotifications: true,
    autoStart: true, // Auto-start with Windows
    tallyPort: 9000,
    tallyHealthCheckInterval: 30,
    apiHealthCheckInterval: 60,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
    
    // ✅ Listen for system theme changes when using system mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => {
      if (settings.theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleThemeChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
    };
  }, [settings.theme]);

  const loadSettings = async () => {
    try {
      if (!window.electronAPI?.getAllSettings) return;
      
      const allSettings = await window.electronAPI.getAllSettings();
      
      // Load auto-start setting separately
      let autoStartEnabled = true; // Default to true
      if (window.electronAPI?.getAutoStart) {
        try {
          const autoStartResult = await window.electronAPI.getAutoStart();
          autoStartEnabled = autoStartResult?.enabled ?? (allSettings.autoStart !== 'false');
        } catch (error) {
          console.error('Error loading auto-start setting:', error);
          autoStartEnabled = allSettings.autoStart !== 'false';
        }
      } else {
        autoStartEnabled = allSettings.autoStart !== 'false';
      }
      
      const loadedTheme = allSettings.theme || 'system'; // ✅ Default to system mode
      setSettings({
        soundEnabled: allSettings.soundEnabled !== 'false',
        theme: loadedTheme,
        syncDuration: parseInt(allSettings.syncDuration || '300', 10),
        backgroundSyncEnabled: allSettings.backgroundSyncEnabled !== 'false',
        apiEndpoint: allSettings.apiEndpoint || '',
        autoSync: allSettings.autoSync !== 'false',
        syncOnStartup: allSettings.syncOnStartup !== 'false',
        showNotifications: allSettings.showNotifications !== 'false',
        autoStart: autoStartEnabled,
        tallyPort: parseInt(allSettings.tallyPort || '9000', 10),
        tallyHealthCheckInterval: parseInt(allSettings.tallyHealthCheckInterval || '30', 10),
        apiHealthCheckInterval: parseInt(allSettings.apiHealthCheckInterval || '60', 10),
      });
      
      // Apply theme after loading
      applyTheme(loadedTheme);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  };

  const saveSetting = async (key: string, value: string | boolean | number) => {
    try {
      if (!window.electronAPI?.setSetting) return;
      
      await window.electronAPI.setSetting(key, String(value));
      
      // Update local state
      setSettings(prev => ({
        ...prev,
        [key]: value
      }));
      
      // Apply theme immediately if changed
      if (key === 'theme') {
        applyTheme(value as string);
      }
      
      setSaveMessage({ type: 'success', text: 'Settings saved successfully' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Error saving setting:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save setting' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const applyTheme = (theme: string) => {
    const root = document.documentElement;
    
    // ✅ Detect system preference if theme is 'system'
    let effectiveTheme = theme;
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
    }
    
    if (effectiveTheme === 'light') {
      root.style.setProperty('--bg-primary', '#ffffff');
      root.style.setProperty('--bg-secondary', '#f3f3f3');
      root.style.setProperty('--bg-tertiary', '#e8e8e8');
      root.style.setProperty('--bg-titlebar', '#f3f3f3');
      root.style.setProperty('--text-primary', '#1e1e1e');
      root.style.setProperty('--text-secondary', '#666666');
      root.style.setProperty('--border-color', '#d4d4d4');
      // Update body background
      document.body.style.background = '#ffffff';
      document.body.style.color = '#1e1e1e';
    } else {
      root.style.setProperty('--bg-primary', '#1e1e1e');
      root.style.setProperty('--bg-secondary', '#252526');
      root.style.setProperty('--bg-tertiary', '#2a2d2e');
      root.style.setProperty('--bg-titlebar', '#2d2d30');
      root.style.setProperty('--text-primary', '#cccccc');
      root.style.setProperty('--text-secondary', '#999999');
      root.style.setProperty('--border-color', '#3e3e42');
      // Update body background
      document.body.style.background = '#1e1e1e';
      document.body.style.color = '#cccccc';
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      if (!window.electronAPI?.setSetting) return;
      
      await Promise.all([
        window.electronAPI.setSetting('soundEnabled', String(settings.soundEnabled)),
        window.electronAPI.setSetting('theme', settings.theme),
        window.electronAPI.setSetting('syncDuration', String(settings.syncDuration)),
        window.electronAPI.setSetting('backgroundSyncEnabled', String(settings.backgroundSyncEnabled)),
        window.electronAPI.setSetting('autoSync', String(settings.autoSync)),
        window.electronAPI.setSetting('syncOnStartup', String(settings.syncOnStartup)),
        window.electronAPI.setSetting('showNotifications', String(settings.showNotifications)),
      ]);
      
      // Restart background sync if settings changed
      if (window.electronAPI?.restartBackgroundSync) {
        await window.electronAPI.restartBackgroundSync();
      }
      
      applyTheme(settings.theme);
      
      setSaveMessage({ type: 'success', text: 'All settings saved successfully' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const ToggleSwitch: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description?: string;
  }> = ({ checked, onChange, label, description }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, marginBottom: description ? '4px' : 0 }}>
          {label}
        </div>
        {description && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '3px', lineHeight: '1.4' }}>
            {description}
          </div>
        )}
      </div>
      <label style={{
        position: 'relative',
        display: 'inline-block',
        width: '44px',
        height: '24px',
        cursor: 'pointer'
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: checked ? '#007acc' : '#3e3e42',
          borderRadius: '12px',
          transition: 'background-color 0.3s',
        }}>
          <span style={{
            position: 'absolute',
            content: '""',
            height: '18px',
            width: '18px',
            left: checked ? '22px' : '3px',
            bottom: '3px',
            backgroundColor: '#ffffff',
            borderRadius: '50%',
            transition: 'left 0.3s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }} />
        </span>
      </label>
    </div>
  );

  const SettingSection: React.FC<{
    title: string;
    icon: string;
    children: React.ReactNode;
  }> = ({ title, icon, children }) => (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '6px',
      padding: '16px',
      marginBottom: '16px',
      border: '1px solid var(--border-color)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '12px',
        paddingBottom: '10px',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <span style={{ 
          fontSize: '18px',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {icon}
        </span>
        <h2 style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          letterSpacing: '0.3px'
        }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          letterSpacing: '0.5px'
        }}>
          Settings
        </h1>
        <button
          onClick={handleSaveAll}
          disabled={saving}
          style={{
            padding: '7px 14px',
            background: saving ? '#3e3e42' : '#007acc',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!saving) e.currentTarget.style.background = '#005a9e';
          }}
          onMouseLeave={(e) => {
            if (!saving) e.currentTarget.style.background = '#007acc';
          }}
        >
          {saving ? 'Saving...' : 'Save All'}
        </button>
      </div>

      {saveMessage && (
        <div style={{
          padding: '10px 14px',
          marginBottom: '16px',
          borderRadius: '4px',
          background: saveMessage.type === 'success' ? '#1e7e34' : '#a1260d',
          color: '#ffffff',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>{saveMessage.type === 'success' ? '✓' : '✕'}</span>
          {saveMessage.text}
        </div>
      )}

      {/* Appearance Settings */}
      <SettingSection title="Appearance" icon="◐">
        <div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{
              display: 'block',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px'
            }}>
              Theme
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setSettings(prev => ({ ...prev, theme: 'system' }));
                  saveSetting('theme', 'system');
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: settings.theme === 'system' ? '#007acc' : 'var(--bg-tertiary)',
                  color: settings.theme === 'system' ? '#ffffff' : 'var(--text-primary)',
                  border: `1px solid ${settings.theme === 'system' ? '#007acc' : 'var(--border-color)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
              >
                ⚙️ System
              </button>
              <button
                onClick={() => {
                  setSettings(prev => ({ ...prev, theme: 'dark' }));
                  saveSetting('theme', 'dark');
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: settings.theme === 'dark' ? '#007acc' : 'var(--bg-tertiary)',
                  color: settings.theme === 'dark' ? '#ffffff' : 'var(--text-primary)',
                  border: `1px solid ${settings.theme === 'dark' ? '#007acc' : 'var(--border-color)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
              >
                🌙 Dark
              </button>
              <button
                onClick={() => {
                  setSettings(prev => ({ ...prev, theme: 'light' }));
                  saveSetting('theme', 'light');
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: settings.theme === 'light' ? '#007acc' : 'var(--bg-tertiary)',
                  color: settings.theme === 'light' ? '#ffffff' : 'var(--text-primary)',
                  border: `1px solid ${settings.theme === 'light' ? '#007acc' : 'var(--border-color)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
              >
                ☀️ Light
              </button>
            </div>
          </div>
        </div>
      </SettingSection>

      {/* Sound Settings */}
      <SettingSection title="Sound & Notifications" icon="🔊">
        <div>
          <ToggleSwitch
            checked={settings.soundEnabled}
            onChange={(checked) => {
              setSettings(prev => ({ ...prev, soundEnabled: checked }));
              saveSetting('soundEnabled', checked);
            }}
            label="Enable Sound"
            description="Play sound notifications for sync events"
          />
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '8px 0' }} />
          <ToggleSwitch
            checked={settings.showNotifications}
            onChange={(checked) => {
              setSettings(prev => ({ ...prev, showNotifications: checked }));
              saveSetting('showNotifications', checked);
            }}
            label="Show Notifications"
            description="Display system notifications for important events"
          />
        </div>
      </SettingSection>

      {/* Sync Settings */}
      <SettingSection title="Sync Settings" icon="⇄">
        <div>
          <ToggleSwitch
            checked={settings.backgroundSyncEnabled}
            onChange={async (checked) => {
              setSettings(prev => ({ ...prev, backgroundSyncEnabled: checked }));
              await saveSetting('backgroundSyncEnabled', checked);
              // Restart background sync with new setting
              if (window.electronAPI?.restartBackgroundSync) {
                await window.electronAPI.restartBackgroundSync();
              }
            }}
            label="Background Sync"
            description="Enable automatic background synchronization"
          />
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '8px 0' }} />
          <div style={{ marginBottom: '12px' }}>
            <label style={{
              display: 'block',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '6px'
            }}>
              Sync Duration (seconds)
            </label>
            <input
              type="number"
              min="60"
              max="3600"
              step="60"
              value={settings.syncDuration}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 60 && value <= 3600) {
                  setSettings(prev => ({ ...prev, syncDuration: value }));
                }
              }}
              onBlur={async () => {
                await saveSetting('syncDuration', settings.syncDuration);
                // Restart background sync with new interval
                if (window.electronAPI?.restartBackgroundSync) {
                  await window.electronAPI.restartBackgroundSync();
                }
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
            <div style={{
              color: 'var(--text-secondary)',
              fontSize: '11px',
              marginTop: '5px',
              lineHeight: '1.4'
            }}>
              Background sync will run every {Math.floor(settings.syncDuration / 60)} minute(s) ({settings.syncDuration} seconds)
            </div>
          </div>
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '12px 0' }} />
          <ToggleSwitch
            checked={settings.autoSync}
            onChange={(checked) => {
              setSettings(prev => ({ ...prev, autoSync: checked }));
              saveSetting('autoSync', checked);
            }}
            label="Auto Sync"
            description="Automatically sync data in the background"
          />
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '8px 0' }} />
          <ToggleSwitch
            checked={settings.syncOnStartup}
            onChange={(checked) => {
              setSettings(prev => ({ ...prev, syncOnStartup: checked }));
              saveSetting('syncOnStartup', checked);
            }}
            label="Sync on Startup"
            description="Start syncing when the application starts"
          />
        </div>
      </SettingSection>

      {/* API Settings */}
      <SettingSection title="API Configuration" icon="⚡">
        <div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{
              display: 'block',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '6px'
            }}>
              API Endpoint
            </label>
            <input
              type="text"
              value={settings.apiEndpoint}
              onChange={(e) => setSettings(prev => ({ ...prev, apiEndpoint: e.target.value }))}
              onBlur={() => saveSetting('apiEndpoint', settings.apiEndpoint)}
              placeholder="https://api.example.com"
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
          </div>
        </div>
      </SettingSection>

      {/* Company Info */}
      {company && (
        <SettingSection title="Company Information" icon="◉">
          <div style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
            <div style={{ marginBottom: '6px', lineHeight: '1.5' }}>
              <strong style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>Name:</strong> {company.name}
            </div>
            {company.organization_id && (
              <div style={{ marginBottom: '6px', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>Organization ID:</strong> {company.organization_id}
              </div>
            )}
            {company.tally_id && (
              <div style={{ marginBottom: '6px', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>Tally ID:</strong> {company.tally_id}
              </div>
            )}
            {company.address && (
              <div style={{ marginBottom: '6px', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>Address:</strong> {company.address}
              </div>
            )}
          </div>
        </SettingSection>
      )}

      {/* Connectivity Settings */}
      <SettingSection title="Connectivity Settings" icon="🔌">
        <div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{
              display: 'block',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '6px'
            }}>
              Tally Port
            </label>
            <input
              type="number"
              min="1"
              max="65535"
              value={settings.tallyPort}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 1 && value <= 65535) {
                  setSettings(prev => ({ ...prev, tallyPort: value }));
                }
              }}
              onBlur={() => {
                saveSetting('tallyPort', settings.tallyPort);
                saveSetting('tallyUrl', `http://localhost:${settings.tallyPort}`);
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Port number for Tally connection (default: 9000)
            </div>
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.testTallyConnectivity?.();
                  if (result?.success) {
                    setSaveMessage({ type: 'success', text: 'Tally connection successful!' });
                  } else {
                    setSaveMessage({ type: 'error', text: `Tally connection failed: ${result?.status?.errorMessage || 'Unknown error'}` });
                  }
                } catch (error: any) {
                  setSaveMessage({ type: 'error', text: `Test failed: ${error.message}` });
                }
                setTimeout(() => setSaveMessage(null), 5000);
              }}
              style={{
                padding: '8px 16px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Test Tally Connection
            </button>
          </div>

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '12px 0' }} />

          <div style={{ marginBottom: '12px' }}>
            <label style={{
              display: 'block',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '6px'
            }}>
              Tally Health Check Interval (seconds)
            </label>
            <input
              type="number"
              min="10"
              max="300"
              step="10"
              value={settings.tallyHealthCheckInterval}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 10 && value <= 300) {
                  setSettings(prev => ({ ...prev, tallyHealthCheckInterval: value }));
                }
              }}
              onBlur={() => saveSetting('tallyHealthCheckInterval', settings.tallyHealthCheckInterval)}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{
              display: 'block',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '6px'
            }}>
              API Health Check Interval (seconds)
            </label>
            <input
              type="number"
              min="10"
              max="300"
              step="10"
              value={settings.apiHealthCheckInterval}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 10 && value <= 300) {
                  setSettings(prev => ({ ...prev, apiHealthCheckInterval: value }));
                }
              }}
              onBlur={() => saveSetting('apiHealthCheckInterval', settings.apiHealthCheckInterval)}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.testApiConnectivity?.();
                  if (result?.success) {
                    setSaveMessage({ type: 'success', text: 'API connection successful!' });
                  } else {
                    setSaveMessage({ type: 'error', text: `API connection failed: ${result?.status?.errorMessage || 'Unknown error'}` });
                  }
                } catch (error: any) {
                  setSaveMessage({ type: 'error', text: `Test failed: ${error.message}` });
                }
                setTimeout(() => setSaveMessage(null), 5000);
              }}
              style={{
                padding: '8px 16px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Test API Connection
            </button>
          </div>
        </div>
      </SettingSection>

      {/* System Settings */}
      <SettingSection title="System Settings" icon="⚙️">
        <div>
          <ToggleSwitch
            checked={settings.autoStart}
            onChange={async (checked) => {
              setSettings(prev => ({ ...prev, autoStart: checked }));
              
              // Save to database
              await saveSetting('autoStart', checked);
              
              // Apply auto-start setting via IPC
              if (window.electronAPI?.setAutoStart) {
                try {
                  const result = await window.electronAPI.setAutoStart(checked);
                  if (result?.success) {
                    setSaveMessage({ type: 'success', text: `Auto-start ${checked ? 'enabled' : 'disabled'}. Changes will take effect after restart.` });
                  } else {
                    setSaveMessage({ type: 'error', text: `Failed to ${checked ? 'enable' : 'disable'} auto-start: ${result?.error || 'Unknown error'}` });
                  }
                } catch (error: any) {
                  console.error('Error setting auto-start:', error);
                  setSaveMessage({ type: 'error', text: `Failed to update auto-start: ${error.message}` });
                }
                setTimeout(() => setSaveMessage(null), 5000);
              }
            }}
            label="Start with Windows"
            description="Automatically start Zorrofin Connect when Windows starts (runs minimized in background)"
          />
        </div>
      </SettingSection>
    </div>
  );
};
