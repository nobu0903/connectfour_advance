/**
 * Same avatar tiers as PLAY page (`gameLogic.js` getAvatarPath).
 */
function getAvatarPathForRating(rating) {
    const r = Number(rating);
    if (r >= 2000) return '/images/avatar1.jpg';
    if (r >= 1800) return '/images/avatar2.jpg';
    if (r >= 1700) return '/images/avatar3.jpg';
    if (r >= 1600) return '/images/avatar4.jpg';
    if (r >= 1550) return '/images/avatar5.jpg';
    if (r >= 1510) return '/images/avatar6.jpg';
    return '/images/avatar7.jpg';
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text == null ? '' : String(text);
    return d.innerHTML;
}

async function fetchRankings() {
    const response = await fetch('/api/rankings');
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to load rankings');
    }
    return result.data;
}

function rowRankClass(position) {
    if (position === 1) return 'leaderboard-row--1';
    if (position === 2) return 'leaderboard-row--2';
    if (position === 3) return 'leaderboard-row--3';
    return 'leaderboard-row--rest';
}

function updateLeaderboardList(rankings) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;

    if (!rankings || rankings.length === 0) {
        listEl.innerHTML =
            '<div class="leaderboard-empty">No players on the leaderboard yet.<br>Play online to earn a rating.</div>';
        listEl.hidden = false;
        return;
    }

    listEl.innerHTML = rankings
        .map((user, index) => {
            const pos = index + 1;
            const rating = user.rating ?? 0;
            const username = user.username ?? '';
            const avatarSrc = getAvatarPathForRating(rating);
            const rankPrefix = '#';
            return `
                <div class="leaderboard-row ${rowRankClass(pos)}" role="row">
                    <span class="leaderboard-rank">${rankPrefix}${pos}</span>
                    <img class="leaderboard-avatar" src="${escapeHtml(avatarSrc)}" alt="" width="44" height="44"
                         onerror="this.src='/images/default-avatar.svg'" loading="lazy" />
                    <span class="leaderboard-name">${escapeHtml(username)}</span>
                    <span class="leaderboard-score">${escapeHtml(String(Math.round(Number(rating))))}</span>
                </div>`;
        })
        .join('');

    listEl.hidden = false;
}

function setActiveNavRanking() {
    const tryMark = () => {
        const links = document.querySelectorAll('.header__nav a[href*="ranking"]');
        if (links.length === 0) return false;
        links.forEach((a) => a.classList.add('active'));
        return true;
    };
    if (tryMark()) return;
    const t0 = performance.now();
    const timer = setInterval(() => {
        if (tryMark() || performance.now() - t0 > 4000) {
            clearInterval(timer);
        }
    }, 40);
}

async function showRankings() {
    const loadingEl = document.getElementById('leaderboard-loading');
    const listEl = document.getElementById('leaderboard-list');

    if (loadingEl) {
        loadingEl.hidden = false;
    }
    if (listEl) {
        listEl.hidden = true;
        listEl.innerHTML = '';
    }

    try {
        const rankings = await fetchRankings();
        if (loadingEl) loadingEl.hidden = true;
        updateLeaderboardList(rankings);
    } catch (error) {
        console.error('Leaderboard error:', error);
        if (loadingEl) loadingEl.hidden = true;
        if (listEl) {
            listEl.innerHTML =
                '<div class="leaderboard-error">Could not load rankings.<br>Please refresh the page.</div>';
            listEl.hidden = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setActiveNavRanking();
    showRankings();
});
