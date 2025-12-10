// src/renderer/login/login.ts
console.log('login.ts loaded!');

const form = document.getElementById('loginForm') as HTMLFormElement;
const message = document.getElementById('message') as HTMLDivElement;
const button = document.getElementById('connectBtn') as HTMLButtonElement;
const btnContent = document.getElementById('btnContent') as HTMLSpanElement;

if (!form || !message || !button || !btnContent) {
    alert('HTML elements not found! Check IDs');
}

const setLoading = (loading: boolean) => {
    button.disabled = loading;
    if (loading) {
        btnContent.innerHTML = '<span class="spinner"></span>Connecting...';
    } else {
        btnContent.textContent = 'Connect';
    }
};

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;

    if (!email || !password) {
        message.innerHTML = '<span style="color:red">Enter email and password</span>';
        return;
    }

    setLoading(true);
    message.textContent = '';

    try {
        console.log('Sending login request from renderer:', { email });

        if (!(window as any).electronAPI) {
            throw new Error('electronAPI not available!');
        }

        const result = await (window as any).electronAPI.login({ email, password });
        console.log('Login response received in renderer:', typeof result);

        if (result.success) {
            message.innerHTML = '<span style="color:green">Success! Closing in 1 sec...</span>';
            (window as any).electronAPI.onLoginSuccess(() => {
                console.log('Window closing now...');
                window.close();
            });
            setTimeout(() => window.close(), 1200);
        } else {
            message.innerHTML = `<span style="color:red">${result.message || 'Login failed'}</span>`;
            setLoading(false);
        }
    } catch (err: any) {
        console.error('Login failed:', err);
        message.innerHTML = '<span style="color:red">Server not running or blocked</span>';
        setLoading(false);
    }
});