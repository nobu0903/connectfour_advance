import * as gameState from './GameState.js';
import { initAvatarCollection, refreshAvatarCollection } from './avatar-collection.js';

let overlayPrepared = false;

export function updateAvatarCollectionEntryVisibility() {
    const btn = document.getElementById('open-avatar-collection-btn');
    if (!btn) {
        return;
    }
    const postLogin = document.getElementById('post-login-actions');
    const postLoginVisible = postLogin && !postLogin.hidden;
    const token = localStorage.getItem('token');
    const show = Boolean(token && gameState.mode === 'play-in-online');
    btn.hidden = !show || postLoginVisible;
}

function setOverlayOpen(open) {
    const overlay = document.getElementById('avatar-collection-overlay');
    if (!overlay) {
        return;
    }
    if (!open) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && overlay.contains(active)) {
            active.blur();
        }
    }
    overlay.hidden = !open;
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
        const closeBtn = document.getElementById('avatar-collection-overlay-close');
        closeBtn?.focus({ preventScroll: true });
    }
}

/** Used by post-login AVATAR button and the in-match “Avatar collection” control. */
export async function openAvatarCollectionOverlay() {
    const overlay = document.getElementById('avatar-collection-overlay');
    if (!overlay) {
        return;
    }
    if (!overlayPrepared) {
        await initAvatarCollection();
        overlayPrepared = true;
    } else {
        await refreshAvatarCollection();
    }
    setOverlayOpen(true);
}

export function setupAvatarCollectionOverlay() {
    const openBtn = document.getElementById('open-avatar-collection-btn');
    const overlay = document.getElementById('avatar-collection-overlay');
    const closeBtn = document.getElementById('avatar-collection-overlay-close');
    if (!openBtn || !overlay || !closeBtn) {
        return;
    }

    openBtn.addEventListener('click', () => {
        void openAvatarCollectionOverlay();
    });

    closeBtn.addEventListener('click', () => setOverlayOpen(false));

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            setOverlayOpen(false);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') {
            return;
        }
        if (!overlay.hidden) {
            setOverlayOpen(false);
        }
    });
}
