// Renderer process script

// If DOM types are not available, manually declare 'document' as any for type safety workaround
declare const document: any;

document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('statusText');
  const syncNowBtn = document.getElementById('syncNow');
  const restartBtn = document.getElementById('restartServices');
  const statusDiv = document.getElementById('status');

  if (statusText) {
    statusText.textContent = 'Running';
  }

  if (statusDiv) {
    statusDiv.classList.add('running');
  }

  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', () => {
      // Trigger sync via IPC (if needed)
      // For now, just show a message
      if (statusText) {
        statusText.textContent = 'Syncing...';
      }
      setTimeout(() => {
        if (statusText) {
          statusText.textContent = 'Running';
        }
      }, 2000);
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      // Trigger restart via IPC (if needed)
      if (statusText) {
        statusText.textContent = 'Restarting...';
      }
      setTimeout(() => {
        if (statusText) {
          statusText.textContent = 'Running';
        }
      }, 1000);
    });
  }
});

