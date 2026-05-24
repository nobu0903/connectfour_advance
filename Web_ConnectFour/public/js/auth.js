import * as gameState from './GameState.js';
import { initializeWebSocket } from './gameLogic.js';
import { openAvatarCollectionOverlay, updateAvatarCollectionEntryVisibility } from './avatar-collection-overlay.js';

let isLoginMode = true;
let authToken = null;

export function showAuthForm() {
    const container = document.getElementById('login-signup-container');
    container.classList.add('active');
}

export function hideAuthForm() {
    const container = document.getElementById('login-signup-container');
    container.classList.remove('active');
}

export function getAuthToken() {
    return authToken || localStorage.getItem('token');
}

function updateAuthFormMode() {
    const title = document.getElementById('auth-title');
    const submitButton = document.getElementById('auth-submit');
    const toggleText = document.getElementById('auth-toggle-text');
    
    if (isLoginMode) {
        title.textContent = 'LOG IN';
        submitButton.textContent = 'LOGIN';
        toggleText.textContent = 'You don\'t have an account? Sign up!';
    } else {
        title.textContent = 'SIGN UP';
        submitButton.textContent = 'REGISTER';
        toggleText.textContent = 'Already have an account? Log in!';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.classList.add('active');
}

function hideError() {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.classList.remove('active');
}

function showPostLoginActions() {
    const panel = document.getElementById('post-login-actions');
    if (panel) {
        panel.hidden = false;
    }
    updateAvatarCollectionEntryVisibility();
}

export function hidePostLoginActions() {
    const panel = document.getElementById('post-login-actions');
    if (panel) {
        panel.hidden = true;
    }
    updateAvatarCollectionEntryVisibility();
}

/** Start queue for online play (after user picks ONLINE MATCH on post-login panel). */
export function startOnlineMatchmaking() {
    const token = authToken || localStorage.getItem('token');
    if (!token) {
        return;
    }

    hidePostLoginActions();

    const socket = initializeWebSocket(token);
    const gameStatus = document.getElementById('gameStatus');
    gameStatus.textContent = `Waiting for opponent...`;
    gameStatus.style.display = 'block';

    socket.addEventListener('open', () => {
        console.log('WebSocket connected. Sending matchmaking request.');
        setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
                const matchRequest = { type: 'findMatch' };
                console.log('Sending matchmaking request:', matchRequest);
                socket.send(JSON.stringify(matchRequest));
            } else {
                console.error('WebSocket is not connected. State:', socket.readyState);
            }
        }, 1000);
    });

    updateAvatarCollectionEntryVisibility();
}

async function handleAuth(username, password) {
    try {
        const endpoint = isLoginMode ? '/api/login' : '/api/register';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Authentication failed');
        }

        authToken = data.token;
        localStorage.setItem('token', data.token);
        hideError();
        hideAuthForm();

        gameState.resetModePlayInOnline();
        updateAvatarCollectionEntryVisibility();

        showPostLoginActions();

        return true;
    } catch (error) {
        if (isLoginMode) {
            localStorage.removeItem('token');
        }
        showError(error.message);
        return false;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('auth-form');
    const toggleText = document.getElementById('auth-toggle-text');

    toggleText.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        updateAuthFormMode();
        hideError();
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        await handleAuth(username, password);
    });

    document.getElementById('post-login-online-btn')?.addEventListener('click', () => {
        startOnlineMatchmaking();
    });

    document.getElementById('post-login-avatar-btn')?.addEventListener('click', () => {
        void openAvatarCollectionOverlay();
    });
}); 