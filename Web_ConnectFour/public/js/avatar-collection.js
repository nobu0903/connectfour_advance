/**
 * Avatar Collection — carousel + tier metadata (aligned with gameLogic getAvatarPath thresholds).
 * Slot 1 = top tier (Galactic), 7 = entry (Bronze).
 */
const AVATAR_TIERS = [
    { slot: 1, minRating: 2000, image: '/images/avatar1.jpg', name: 'GALACTIC APEX', short: 'Galactic' },
    { slot: 2, minRating: 1800, image: '/images/avatar2.jpg', name: 'NOVA VANGUARD', short: 'Nova' },
    { slot: 3, minRating: 1700, image: '/images/avatar3.jpg', name: 'PLATINUM SENTINEL', short: 'Platinum' },
    { slot: 4, minRating: 1600, image: '/images/avatar4.jpg', name: 'DIAMOND ELITE', short: 'Diamond' },
    { slot: 5, minRating: 1550, image: '/images/avatar5.jpg', name: 'GOLD STRIKER', short: 'Gold' },
    { slot: 6, minRating: 1510, image: '/images/avatar6.jpg', name: 'SILVER RUNNER', short: 'Silver' },
    { slot: 7, minRating: 0, image: '/images/avatar7.jpg', name: 'BRONZE ROOKIE', short: 'Bronze' },
];

let userRating = 1500;
let userName = 'Player';
let focusIndex = 6;

let carouselListenersBound = false;

function tierIndexForRating(r) {
    const x = Number(r);
    for (let i = 0; i < AVATAR_TIERS.length; i++) {
        if (x >= AVATAR_TIERS[i].minRating) {
            return i;
        }
    }
    return AVATAR_TIERS.length - 1;
}

function isTierUnlocked(rating, tier) {
    return Number(rating) >= tier.minRating;
}

function nextBetterTierIndex(fromIndex) {
    if (fromIndex <= 0) {
        return null;
    }
    return fromIndex - 1;
}

async function fetchMe() {
    const token = localStorage.getItem('token');
    if (!token) {
        return null;
    }
    try {
        let res = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'same-origin',
        });
        if (!res.ok) {
            res = await fetch(`/api/me?token=${encodeURIComponent(token)}`, {
                credentials: 'same-origin',
            });
        }
        if (!res.ok) {
            return null;
        }
        const data = await res.json();
        if (data && data.success === false) {
            return null;
        }
        const hasProfile =
            typeof data?.username === 'string' ||
            (typeof data?.rating === 'number' && Number.isFinite(data.rating));
        if (!hasProfile) {
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

function setNavActive() {
    if (!document.body.classList.contains('avatar-collection-page')) {
        return;
    }
    const tryMark = () => {
        const links = document.querySelectorAll('.header__nav a[href*="avatar"]');
        if (links.length === 0) {
            return false;
        }
        links.forEach((a) => a.classList.add('active'));
        return true;
    };
    if (tryMark()) {
        return;
    }
    const t0 = performance.now();
    const id = setInterval(() => {
        if (tryMark() || performance.now() - t0 > 4000) {
            clearInterval(id);
        }
    }, 40);
}

function bindCarouselControls() {
    if (carouselListenersBound) {
        return;
    }
    const prev = document.getElementById('avatar-carousel-prev');
    const next = document.getElementById('avatar-carousel-next');
    if (!prev || !next) {
        return;
    }
    carouselListenersBound = true;
    prev.addEventListener('click', () => {
        focusIndex = (focusIndex - 1 + AVATAR_TIERS.length) % AVATAR_TIERS.length;
        renderAll();
    });
    next.addEventListener('click', () => {
        focusIndex = (focusIndex + 1) % AVATAR_TIERS.length;
        renderAll();
    });
}

function renderTierTiles() {
    const root = document.getElementById('avatar-tier-tiles');
    if (!root) {
        return;
    }
    root.innerHTML = '';
    AVATAR_TIERS.forEach((tier, idx) => {
        const unlocked = isTierUnlocked(userRating, tier);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'avatar-tier-tile' + (idx === focusIndex ? ' avatar-tier-tile--active' : '');
        btn.dataset.index = String(idx);
        const img = document.createElement('img');
        img.className = 'avatar-tier-tile__thumb' + (unlocked ? '' : ' avatar-tier-tile__thumb--locked');
        img.src = tier.image;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = () => {
            img.src = '/images/default-avatar.svg';
        };
        const span = document.createElement('span');
        span.className = 'avatar-tier-tile__num';
        span.textContent = `#${tier.slot}`;
        btn.appendChild(img);
        btn.appendChild(span);
        if (!unlocked) {
            const lock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            lock.setAttribute('class', 'avatar-tier-tile__lock');
            lock.setAttribute('viewBox', '0 0 24 24');
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('fill', '#ff62ee');
            p.setAttribute(
                'd',
                'M17 10h-1V8a5 5 0 10-10 0v2H5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zm-7 8a2 2 0 114 0v2h-4v-2zm3-8H9V8a3 3 0 116 0v2z'
            );
            lock.appendChild(p);
            btn.appendChild(lock);
        }
        btn.addEventListener('click', () => {
            focusIndex = idx;
            renderAll();
        });
        root.appendChild(btn);
    });
}

function renderHero() {
    const tier = AVATAR_TIERS[focusIndex];
    const img = document.getElementById('avatar-hero-img');
    const lock = document.getElementById('avatar-hero-lock');
    const label = document.getElementById('avatar-hero-tier-label');
    const req = document.getElementById('avatar-hero-requirement');
    if (!img || !tier) {
        return;
    }
    img.src = tier.image;
    img.onerror = () => {
        img.src = '/images/default-avatar.svg';
    };
    const unlocked = isTierUnlocked(userRating, tier);
    img.classList.toggle('avatar-hero__img--locked', !unlocked);
    if (lock) {
        lock.hidden = unlocked;
    }
    if (label) {
        label.textContent = tier.name;
    }
    if (req) {
        req.textContent =
            tier.minRating > 0 ? `Requires rating ${tier.minRating}+` : 'Everyone starts here — climb the ladder!';
    }
}

function renderProfilePanel() {
    const idx = tierIndexForRating(userRating);
    const tier = AVATAR_TIERS[idx];
    const img = document.getElementById('avatar-profile-img');
    const nameEl = document.getElementById('avatar-profile-name');
    const tierEl = document.getElementById('avatar-profile-tier');
    const ratingEl = document.getElementById('avatar-profile-rating');
    const bar = document.getElementById('avatar-profile-mini-bar');
    const cap = document.getElementById('avatar-profile-mini-caption');

    if (img) {
        img.src = tier.image;
        img.onerror = () => {
            img.src = '/images/default-avatar.svg';
        };
    }
    if (nameEl) {
        nameEl.textContent = userName;
    }
    if (tierEl) {
        tierEl.textContent = tier.short.toUpperCase();
    }
    if (ratingEl) {
        ratingEl.textContent = String(Math.round(Number(userRating)));
    }

    const nextIdx = nextBetterTierIndex(idx);
    if (bar && cap) {
        if (nextIdx === null) {
            bar.style.width = '100%';
            cap.textContent = 'Max tier — you are the apex.';
        } else {
            const floor = tier.minRating;
            const ceiling = AVATAR_TIERS[nextIdx].minRating;
            const span = Math.max(1, ceiling - floor);
            const p = Math.max(0, Math.min(1, (userRating - floor) / span));
            bar.style.width = `${Math.round(p * 100)}%`;
            cap.textContent = `Next tier at ${ceiling} · ${Math.max(0, Math.ceil(ceiling - userRating))} pts to go`;
        }
    }
}

function renderProgressSection() {
    const tier = AVATAR_TIERS[focusIndex];
    const display = document.getElementById('avatar-progress-rating-display');
    const caption = document.getElementById('avatar-progress-caption');
    const fill = document.getElementById('avatar-progress-fill');
    if (!display || !caption || !fill) {
        return;
    }

    display.textContent = String(Math.round(Number(userRating)));

    const unlocked = isTierUnlocked(userRating, tier);
    const userIdx = tierIndexForRating(userRating);

    if (!unlocked && tier.minRating > 0) {
        const need = Math.max(0, Math.ceil(tier.minRating - userRating));
        caption.innerHTML = `<strong>${tier.short}</strong> (Tier ${tier.slot}) unlock in <strong>${need}</strong> pts.`;
        const pct = Math.min(100, (userRating / tier.minRating) * 100);
        fill.style.width = `${pct}%`;
        return;
    }

    if (focusIndex > userIdx) {
        caption.innerHTML = `You’ve already cleared <strong>${tier.short}</strong> — climb toward the next jewel tier.`;
        fill.style.width = '100%';
        return;
    }

    const nextIdx = nextBetterTierIndex(userIdx);
    if (nextIdx === null) {
        caption.innerHTML = 'You’ve reached <strong>Galactic Apex</strong>. Stay on top!';
        fill.style.width = '100%';
        return;
    }

    const floor = AVATAR_TIERS[userIdx].minRating;
    const ceiling = AVATAR_TIERS[nextIdx].minRating;
    const span = Math.max(1, ceiling - floor);
    const p = Math.max(0, Math.min(1, (userRating - floor) / span));
    const need = Math.max(0, Math.ceil(ceiling - userRating));
    caption.innerHTML = `<strong>${AVATAR_TIERS[nextIdx].short}</strong> (Tier ${AVATAR_TIERS[nextIdx].slot}) unlock in <strong>${need}</strong> pts.`;
    fill.style.width = `${Math.round(p * 100)}%`;
}

export function renderAll() {
    renderHero();
    renderTierTiles();
    renderProfilePanel();
    renderProgressSection();
}

/** Fetches /api/me and updates guest banner + focus; re-renders. */
export async function refreshAvatarCollection() {
    const guestBanner = document.getElementById('avatar-guest-banner');
    const me = await fetchMe();
    if (me) {
        const r = Number(me.rating);
        userRating = Number.isFinite(r) ? r : 1500;
        userName = typeof me.username === 'string' && me.username.length ? me.username : 'Player';
        if (guestBanner) {
            guestBanner.hidden = true;
        }
    } else {
        userRating = 1500;
        userName = 'Guest';
        if (guestBanner) {
            guestBanner.hidden = false;
        }
    }

    focusIndex = tierIndexForRating(userRating);
    renderAll();
}

/** One-time carousel wiring + first load; safe to call from overlay or avatar page. */
export async function initAvatarCollection() {
    setNavActive();
    await refreshAvatarCollection();
    bindCarouselControls();
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!document.body.classList.contains('avatar-collection-page')) {
            return;
        }
        void initAvatarCollection();
    });
}
