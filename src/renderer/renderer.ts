// src/renderer/main/dashboard.ts
// Renderer process script for dashboard/status window

// No need for 'declare document: any' – use tsconfig lib "DOM"

// Wait for DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('statusText') as HTMLElement | null;
  const syncNowBtn = document.getElementById('syncNow') as HTMLButtonElement | null;
  const restartBtn = document.getElementById('restartServices') as HTMLButtonElement | null;
  const statusDiv = document.getElementById('status') as HTMLDivElement | null;

  // Set initial status
  if (statusText) {
    statusText.textContent = 'Running';
  }

  if (statusDiv) {
    statusDiv.classList.add('running');
  }

  // Sync Now button handler
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();  // Prevent default if button in form
      // Real IPC: window.electronAPI?.triggerSync();  // From preload
      if (statusText) {
        statusText.textContent = 'Syncing...';
      }
      // Mock delay
      setTimeout(() => {
        if (statusText) {
          statusText.textContent = 'Running';
        }
      }, 2000);
    });
  }

  // Restart Services button handler
  if (restartBtn) {
    restartBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      // Real IPC: window.electronAPI?.restartServices();  // From preload
      if (statusText) {
        statusText.textContent = 'Restarting...';
      }
      // Mock delay
      setTimeout(() => {
        if (statusText) {
          statusText.textContent = 'Running';
        }
      }, 1000);
    });
  }
});