// src/renderer/login/login.ts
// No need for declare global here – handled in preload.ts

// Type for Electron API (matches preload)
interface ElectronAPI {
  login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  onLoginSuccess: (callback: () => void) => void;
}

// Safe access to window.electronAPI
const electronAPI = (window as { electronAPI?: ElectronAPI }).electronAPI;

// Type-safe event listener
if (electronAPI?.login && electronAPI.onLoginSuccess) {
  const loginForm = document.getElementById('loginForm') as HTMLFormElement | null;
  const emailInput = document.getElementById('email') as HTMLInputElement | null;
  const passwordInput = document.getElementById('password') as HTMLInputElement | null;
  const errorDiv = document.getElementById('error') as HTMLDivElement | null;

  if (loginForm && emailInput && passwordInput && errorDiv) {
    loginForm.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      
      if (!email || !password) {
        errorDiv.textContent = 'Please enter email and password.';
        return;
      }

      errorDiv.textContent = 'Logging in...';

      try {
        const result: { success: boolean; message?: string } = await electronAPI.login({ email, password });
        if (result.success) {
          // Set up listener for success event
          electronAPI.onLoginSuccess(() => {
            window.close();
          });
          // Fallback close after delay
          setTimeout(() => window.close(), 500);
        } else {
          errorDiv.textContent = result.message || 'Login failed.';
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred.';
        errorDiv.textContent = 'Error: ' + errorMessage;
        console.error('Login error:', err);
      }
    });
  } else {
    console.error('Required DOM elements not found');
  }
} else {
  console.error('Preload not loaded: electronAPI unavailable');
}