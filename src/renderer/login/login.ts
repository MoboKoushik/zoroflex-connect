interface ElectronAPI {
    login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
    onLoginSuccess: (callback: () => void) => void;
}

const electronAPI = (window as { electronAPI?: ElectronAPI }).electronAPI;

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
                    electronAPI.onLoginSuccess(() => {
                        window.close();
                    });
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