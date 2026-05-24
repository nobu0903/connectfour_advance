import * as gameState from "./GameState.js";
import { isColumnFull, resetBoard, animatePieceDrop } from "./board.js";
import { smartComputerTurn } from "./computer.js";
import { hidePostLoginActions, showAuthForm } from "./auth.js";
import { updateAvatarCollectionEntryVisibility } from "./avatar-collection-overlay.js";

// Shared WebSocket instance
let socket = null;

let dropOperationTail = Promise.resolve();
let insideDropJob = false;

function enqueueDropOperation(fn) {
    dropOperationTail = dropOperationTail.then(fn, (err) => {
        console.error('drop queue error:', err);
    });
    return dropOperationTail;
}

function setPieceDropInteractionLocked(locked) {
    document.body.classList.toggle('piece-drop-active', locked);
}
let pendingGameResult = null;
let resultAnimationRafIds = [];
let resultAnimationDelayTimerId = null;
let avatarCelebrationTimerId = null;
const RESULT_ANIMATION_DELAY_MS = 1000;
const RESULT_ANIMATION_DURATION_MS = 3400;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getAvatarPath(rating) {
    if (rating >= 2000) {
        return '/images/avatar1.jpg';
    }
    if (rating >= 1800) {
        return '/images/avatar2.jpg';
    }
    if (rating >= 1700) {
        return '/images/avatar3.jpg';
    }
    if (rating >= 1600) {
        return '/images/avatar4.jpg';
    }
    if (rating >= 1550) {
        return '/images/avatar5.jpg';
    }
    if (rating >= 1510) {
        return '/images/avatar6.jpg';
    }
    return '/images/avatar7.jpg';
}

function updateSidebarAvatarCards(data) {
    const leftAvatar = document.getElementById('player1-avatar-img');
    const rightAvatar = document.getElementById('player2-avatar-img');
    const leftLabel = document.getElementById('player1-card-label');
    const rightLabel = document.getElementById('player2-card-label');

    if (!leftAvatar || !rightAvatar || !leftLabel || !rightLabel) {
        return;
    }

    const leftRating = data.isFirstMove ? data.rating : data.opponentRating;
    const rightRating = data.isFirstMove ? data.opponentRating : data.rating;
    const leftName = data.isFirstMove ? data.myUsername : data.opponentUsername;
    const rightName = data.isFirstMove ? data.opponentUsername : data.myUsername;

    leftAvatar.src = getAvatarPath(leftRating);
    rightAvatar.src = getAvatarPath(rightRating);
    leftAvatar.onerror = () => { leftAvatar.src = '/images/default-avatar.svg'; };
    rightAvatar.onerror = () => { rightAvatar.src = '/images/default-avatar.svg'; };
    leftLabel.textContent = leftName || 'Player 1';
    rightLabel.textContent = rightName || 'Player 2';
}

function clearResultAnimations() {
    resultAnimationRafIds.forEach((id) => cancelAnimationFrame(id));
    resultAnimationRafIds = [];
    if (resultAnimationDelayTimerId !== null) {
        clearTimeout(resultAnimationDelayTimerId);
        resultAnimationDelayTimerId = null;
    }
    if (avatarCelebrationTimerId !== null) {
        clearTimeout(avatarCelebrationTimerId);
        avatarCelebrationTimerId = null;
    }
    closeAvatarTierCelebration();
}

/** Lower avatar number = higher tier (avatar1 is top). */
function avatarTierIndexFromPath(path) {
    const m = String(path).match(/avatar(\d+)\./i);
    return m ? parseInt(m[1], 10) : 99;
}

function isAvatarTierUpgrade(oldRating, newRating) {
    const oldP = getAvatarPath(Number(oldRating));
    const newP = getAvatarPath(Number(newRating));
    if (oldP === newP) {
        return false;
    }
    return avatarTierIndexFromPath(newP) < avatarTierIndexFromPath(oldP);
}

function getYouFromResult(result) {
    if (result.player1?.name === 'You') {
        return result.player1;
    }
    if (result.player2?.name === 'You') {
        return result.player2;
    }
    return null;
}

function closeAvatarTierCelebration() {
    const el = document.getElementById('avatar-tier-celebration');
    if (!el) {
        return;
    }
    el.classList.remove('avatar-tier-celebration--open');
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
}

function openAvatarTierCelebration(oldSrc, newSrc) {
    const wrap = document.getElementById('avatar-tier-celebration');
    const imgOld = document.getElementById('avatar-tier-img-old');
    const imgNew = document.getElementById('avatar-tier-img-new');
    if (!wrap || !imgOld || !imgNew) {
        return;
    }
    imgOld.src = oldSrc;
    imgNew.src = newSrc;
    imgOld.onerror = () => {
        imgOld.src = '/images/default-avatar.svg';
    };
    imgNew.onerror = () => {
        imgNew.src = '/images/default-avatar.svg';
    };
    wrap.hidden = false;
    wrap.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        wrap.classList.add('avatar-tier-celebration--open');
    });
}

function scheduleAvatarTierCelebration(result) {
    if (avatarCelebrationTimerId !== null) {
        clearTimeout(avatarCelebrationTimerId);
        avatarCelebrationTimerId = null;
    }
    const you = getYouFromResult(result);
    if (!you || !isAvatarTierUpgrade(you.oldRating, you.newRating)) {
        return;
    }
    const oldSrc = getAvatarPath(you.oldRating);
    const newSrc = getAvatarPath(you.newRating);
    avatarCelebrationTimerId = setTimeout(() => {
        avatarCelebrationTimerId = null;
        openAvatarTierCelebration(oldSrc, newSrc);
    }, RESULT_ANIMATION_DURATION_MS);
}

function toNumberOrNull(value) {
    // Number(null) === 0 in JS; ranks must distinguish "missing" from zero.
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getRankPair(data, side) {
    const selfOld = ['oldRank', 'previousRank', 'myOldRank', 'rankBefore'];
    const selfNew = ['newRank', 'currentRank', 'myNewRank', 'rankAfter'];
    const opponentOld = ['opponentOldRank', 'enemyOldRank', 'opponentRankBefore'];
    const opponentNew = ['opponentNewRank', 'enemyNewRank', 'opponentRankAfter'];
    const oldKeys = side === 'self' ? selfOld : opponentOld;
    const newKeys = side === 'self' ? selfNew : opponentNew;

    const oldRank = oldKeys.map((key) => toNumberOrNull(data[key])).find((v) => v !== null) ?? null;
    const newRank = newKeys.map((key) => toNumberOrNull(data[key])).find((v) => v !== null) ?? null;
    return { oldRank, newRank };
}

function formatRatingText(currentRating, delta) {
    return `Rating: ${currentRating} (${delta >= 0 ? '+' : ''}${delta})`;
}

function escapeHtmlNumericId(n) {
    const s = String(Math.round(Number(n)));
    return /^\d+$/.test(s) ? s : '';
}

/* Filled SVG arrows (green / red) — clearer than thin Unicode or border triangles. */
const RANK_ARROW_UP_SVG =
    '<svg class="rank-line__arrow rank-line__arrow--up" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path d="M12 3.5 L20.5 17.5 H3.5 Z" />' +
    '</svg>';

const RANK_ARROW_DOWN_SVG =
    '<svg class="rank-line__arrow rank-line__arrow--down" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path d="M12 20.5 L3.5 6.5 H20.5 Z" />' +
    '</svg>';

/** Small crown (not emoji); uses currentColor for gold styling on .rank-line__pos--top */
const RANK_CROWN_SVG =
    '<svg class="rank-line__crown-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
    '<path d="M5 17V7.2l3.2 2.1L12 4l3.8 5.3L19 7.2V17H5zm-1 2h16v2H4v-2z" />' +
    '</svg>';

function rankPositionHtml(pos) {
    const hash = `#${pos}`;
    if (pos === '1') {
        return (
            `<span class="rank-line__pos rank-line__pos--top">${RANK_CROWN_SVG}` +
            `<span class="rank-line__hash">${hash}</span></span>`
        );
    }
    return `<span class="rank-line__pos"><span class="rank-line__hash">${hash}</span></span>`;
}

/** Rank #1 is best: lower # = better. */
function renderRankDeltaLine(element, currentRank, baselineOldRank) {
    if (!element) {
        return;
    }
    if (currentRank === null) {
        element.textContent = 'Rank: -';
        return;
    }
    const pos = escapeHtmlNumericId(currentRank);
    if (!pos) {
        element.textContent = 'Rank: -';
        return;
    }
    if (baselineOldRank === null || baselineOldRank === undefined) {
        element.innerHTML =
            `<span class="rank-line"><span class="rank-line__label">Rank:</span> ${rankPositionHtml(pos)}</span>`;
        return;
    }
    const d = Math.round(Number(currentRank)) - Math.round(Number(baselineOldRank));
    if (d === 0) {
        element.innerHTML =
            `<span class="rank-line"><span class="rank-line__label">Rank:</span> ${rankPositionHtml(pos)}</span>`;
        return;
    }
    const absd = escapeHtmlNumericId(Math.abs(d));
    if (!absd) {
        element.textContent = 'Rank: -';
        return;
    }
    const arrow = d < 0 ? RANK_ARROW_UP_SVG : RANK_ARROW_DOWN_SVG;
    const mod = d < 0 ? 'rank-line__delta--up' : 'rank-line__delta--down';
    element.innerHTML =
        `<span class="rank-line"><span class="rank-line__label">Rank:</span> ${rankPositionHtml(pos)} ` +
        `<span class="rank-line__delta ${mod}">` +
        `${arrow}` +
        `<span class="rank-line__delta-num">${absd}</span></span></span>`;
}

function setRankClass(element, oldRank, newRank) {
    element.classList.remove('rank-up', 'rank-down', 'rank-unchanged');
    if (oldRank === null || newRank === null || oldRank === newRank) {
        element.classList.add('rank-unchanged');
        return;
    }
    // Smaller rank number means better position.
    element.classList.add(newRank < oldRank ? 'rank-up' : 'rank-down');
}

function animateNumber(from, to, durationMs, onUpdate, onDone) {
    const start = performance.now();
    const run = (now) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - ((1 - t) * (1 - t) * (1 - t));
        const current = Math.round(from + (to - from) * eased);
        onUpdate(current);
        if (t < 1) {
            const rafId = requestAnimationFrame(run);
            resultAnimationRafIds.push(rafId);
            return;
        }
        onDone?.();
    };
    const rafId = requestAnimationFrame(run);
    resultAnimationRafIds.push(rafId);
}

function animateResultValues(result) {
    const resultPlayer1Rating = document.getElementById("result-player1-rating-change");
    const resultPlayer2Rating = document.getElementById("result-player2-rating-change");
    const resultPlayer1Rank = document.getElementById("result-player1-rank-change");
    const resultPlayer2Rank = document.getElementById("result-player2-rank-change");
    if (!resultPlayer1Rating || !resultPlayer2Rating || !resultPlayer1Rank || !resultPlayer2Rank) {
        return;
    }

    clearResultAnimations();

    const duration = RESULT_ANIMATION_DURATION_MS;
    const p1RatingDelta = result.player1.newRating - result.player1.oldRating;
    const p2RatingDelta = result.player2.newRating - result.player2.oldRating;
    resultPlayer1Rating.className = p1RatingDelta > 0 ? 'rating-increase' : 'rating-decrease';
    resultPlayer2Rating.className = p2RatingDelta > 0 ? 'rating-increase' : 'rating-decrease';

    animateNumber(result.player1.oldRating, result.player1.newRating, duration, (current) => {
        resultPlayer1Rating.textContent = formatRatingText(current, current - result.player1.oldRating);
    }, () => {
        resultPlayer1Rating.textContent = formatRatingText(result.player1.newRating, p1RatingDelta);
    });

    animateNumber(result.player2.oldRating, result.player2.newRating, duration, (current) => {
        resultPlayer2Rating.textContent = formatRatingText(current, current - result.player2.oldRating);
    }, () => {
        resultPlayer2Rating.textContent = formatRatingText(result.player2.newRating, p2RatingDelta);
    });

    setRankClass(resultPlayer1Rank, result.player1.oldRank, result.player1.newRank);
    setRankClass(resultPlayer2Rank, result.player2.oldRank, result.player2.newRank);

    if (result.player1.oldRank !== null && result.player1.newRank !== null) {
        animateNumber(result.player1.oldRank, result.player1.newRank, duration, (current) => {
            renderRankDeltaLine(resultPlayer1Rank, current, result.player1.oldRank);
        }, () => {
            renderRankDeltaLine(resultPlayer1Rank, result.player1.newRank, result.player1.oldRank);
        });
    } else {
        resultPlayer1Rank.textContent = 'Rank: -';
    }

    if (result.player2.oldRank !== null && result.player2.newRank !== null) {
        animateNumber(result.player2.oldRank, result.player2.newRank, duration, (current) => {
            renderRankDeltaLine(resultPlayer2Rank, current, result.player2.oldRank);
        }, () => {
            renderRankDeltaLine(resultPlayer2Rank, result.player2.newRank, result.player2.oldRank);
        });
    } else {
        resultPlayer2Rank.textContent = 'Rank: -';
    }
}

function renderQueuedGameResult(result) {
    const gameResult = document.getElementById("game-result");
    const resultTitle = document.querySelector('.game-result h3');
    const resultIcon = document.getElementById('result-icon');
    const resultPlayer1Avatar = document.getElementById("result-player1-avatar");
    const resultPlayer2Avatar = document.getElementById("result-player2-avatar");
    const resultPlayer1Name = document.getElementById("result-player1-name");
    const resultPlayer1Rating = document.getElementById("result-player1-rating-change");
    const resultPlayer1Rank = document.getElementById("result-player1-rank-change");
    const resultPlayer2Name = document.getElementById("result-player2-name");
    const resultPlayer2Rating = document.getElementById("result-player2-rating-change");
    const resultPlayer2Rank = document.getElementById("result-player2-rank-change");

    if (!gameResult || !resultTitle || !resultPlayer1Name || !resultPlayer1Rating || !resultPlayer2Name || !resultPlayer2Rating || !resultPlayer1Rank || !resultPlayer2Rank || !resultPlayer1Avatar || !resultPlayer2Avatar) {
        return;
    }

    resultTitle.textContent = result.title;
    if (resultIcon) {
        resultIcon.textContent = result.icon;
    }
    resultPlayer1Avatar.src = result.player1.celebrationAvatarSrc;
    resultPlayer2Avatar.src = result.player2.celebrationAvatarSrc;
    resultPlayer1Avatar.onerror = () => {
        resultPlayer1Avatar.onerror = () => { resultPlayer1Avatar.src = '/images/default-avatar.svg'; };
        resultPlayer1Avatar.src = result.player1.avatarSrc;
    };
    resultPlayer2Avatar.onerror = () => {
        resultPlayer2Avatar.onerror = () => { resultPlayer2Avatar.src = '/images/default-avatar.svg'; };
        resultPlayer2Avatar.src = result.player2.avatarSrc;
    };
    resultPlayer1Name.textContent = result.player1.name;
    resultPlayer2Name.textContent = result.player2.name;
    resultPlayer1Rating.textContent = formatRatingText(result.player1.oldRating, 0);
    resultPlayer2Rating.textContent = formatRatingText(result.player2.oldRating, 0);
    if (result.player1.oldRank === null) {
        resultPlayer1Rank.textContent = 'Rank: -';
    } else {
        renderRankDeltaLine(resultPlayer1Rank, result.player1.oldRank, result.player1.oldRank);
    }
    if (result.player2.oldRank === null) {
        resultPlayer2Rank.textContent = 'Rank: -';
    } else {
        renderRankDeltaLine(resultPlayer2Rank, result.player2.oldRank, result.player2.oldRank);
    }
    document.body.classList.add('result-open');
    resultAnimationDelayTimerId = setTimeout(() => {
        resultAnimationDelayTimerId = null;
        animateResultValues(result);
        scheduleAvatarTierCelebration(result);
    }, RESULT_ANIMATION_DELAY_MS);
}

function buildPlayerResult(name, oldRating, newRating, oldRank, newRank) {
    const safeOldRating = toNumberOrNull(oldRating) ?? 0;
    const safeNewRating = toNumberOrNull(newRating) ?? safeOldRating;
    const avatarSrc = getAvatarPath(safeNewRating);
    return {
        name,
        avatarSrc,
        // Dedicated PNGs were never added under public/images/ui/; reuse tier avatars (no 404).
        celebrationAvatarSrc: avatarSrc,
        oldRating: safeOldRating,
        newRating: safeNewRating,
        oldRank,
        newRank,
    };
}

function queueResultFromGameEnd(data) {
    const isDraw = Boolean(data.isDraw);
    let title = 'Draw';
    let icon = '🤝';
    if (!isDraw) {
        const isWinnerFirstPlayer = (data.winner === 'red' && data.isFirstMove) || (data.winner === 'yellow' && !data.isFirstMove);
        title = isWinnerFirstPlayer ? 'You win!' : 'You lose!';
        icon = isWinnerFirstPlayer ? '🏆' : '💀';
    }

    const selfRank = getRankPair(data, 'self');
    const opponentRank = getRankPair(data, 'opponent');

    if (data.isFirstMove) {
        pendingGameResult = {
            title,
            icon,
            player1: buildPlayerResult("You", data.oldRating, data.newRating, selfRank.oldRank, selfRank.newRank),
            player2: buildPlayerResult("Opponent", data.opponentOldRating, data.opponentNewRating, opponentRank.oldRank, opponentRank.newRank),
        };
        return;
    }

    pendingGameResult = {
        title,
        icon,
        player1: buildPlayerResult("Opponent", data.opponentOldRating, data.opponentNewRating, opponentRank.oldRank, opponentRank.newRank),
        player2: buildPlayerResult("You", data.oldRating, data.newRating, selfRank.oldRank, selfRank.newRank),
    };
}

function queueResultFromGameResult(data) {
    let title = 'Draw';
    let icon = '🤝';
    if (data.result === 'win') {
        title = 'You win!';
        icon = '🏆';
    } else if (data.result === 'loss') {
        title = 'You lose!';
        icon = '💀';
    }

    const selfRank = getRankPair(data, 'self');
    const opponentRank = getRankPair(data, 'opponent');

    if (data.isFirstPlayer) {
        pendingGameResult = {
            title,
            icon,
            player1: buildPlayerResult("You", data.oldRating, data.newRating, selfRank.oldRank, selfRank.newRank),
            player2: buildPlayerResult("Opponent", data.opponentOldRating, data.opponentNewRating, opponentRank.oldRank, opponentRank.newRank),
        };
        return;
    }

    pendingGameResult = {
        title,
        icon,
        player1: buildPlayerResult("Opponent", data.opponentOldRating, data.opponentNewRating, opponentRank.oldRank, opponentRank.newRank),
        player2: buildPlayerResult("You", data.oldRating, data.newRating, selfRank.oldRank, selfRank.newRank),
    };
}

/** Open or replace the WebSocket connection */
export function initializeWebSocket(token = null) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? `${window.location.hostname}:3000` : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}`;
    
    if (socket) {
        console.log('Closing existing WebSocket connection');
        socket.close();
    }
    
    console.log('Creating WebSocket connection:', wsUrl);
    if (token) {
        // Send token via Sec-WebSocket-Protocol (not query string)
        socket = new WebSocket(wsUrl, ['auth', token]);
    } else {
        socket = new WebSocket(wsUrl);
    }
    
    socket.onopen = () => {
        console.log('WebSocket connected, readyState:', socket.readyState);
    };
    
    socket.onclose = () => {
        console.log('WebSocket disconnected');
        const gameResult = document.getElementById("game-result");
        if (gameResult) {
            gameResult.style.display = "none";
        }
        clearResultAnimations();
        document.body.classList.remove('result-open');
        pendingGameResult = null;
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    socket.onmessage = (event) => {
        console.log("Received message:", event.data);
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === "matchError") {
                alert(data.message || 'Matchmaking failed.');
            } else if (data.type === "gameStart") {
                console.log("gameStart received:", data);
                
                showMatchScreen(data);
                
                resetBoard();
                gameState.resetCurrentPlayer();
                gameState.resetModePlayInOnline();
                
                gameState.setCurrentRoomId(data.roomId);
                console.log("Room ID:", data.roomId);
                
                gameState.setMyTurn(data.isFirstMove);
                console.log("Your turn first:", data.isFirstMove);

                const ratingDisplay = document.getElementById("rating-display");
                const player1Name = document.getElementById("player1-name");
                const player1Rating = document.getElementById("player1-rating");
                const player2Name = document.getElementById("player2-name");
                const player2Rating = document.getElementById("player2-rating");

                const myRating = data.rating;
                const opponentRating = data.opponentRating;
                const myUsername = data.myUsername;
                const opponentUsername = data.opponentUsername;

                updateSidebarAvatarCards(data);
                clearResultAnimations();
                document.body.classList.remove('result-open');
                pendingGameResult = null;
                const gameResult = document.getElementById("game-result");
                if (gameResult) {
                    gameResult.style.display = "none";
                }

                console.log("Ratings:", { myRating, opponentRating });
                console.log("Users:", { myUsername, opponentUsername });

                if (data.isFirstMove) {
                    player1Name.textContent = `You (${myUsername})`;
                    player1Rating.textContent = `Rating: ${myRating}`;
                    player2Name.textContent = `Opponent (${opponentUsername})`;
                    player2Rating.textContent = `Rating: ${opponentRating}`;
                } else {
                    player1Name.textContent = `Opponent (${opponentUsername})`;
                    player1Rating.textContent = `Rating: ${opponentRating}`;
                    player2Name.textContent = `You (${myUsername})`;
                    player2Rating.textContent = `Rating: ${myRating}`;
                }
                ratingDisplay.style.display = "flex";
                
                const gameStatus = document.getElementById("gameStatus");
                gameStatus.textContent = `Game start! ${data.isFirstMove ? '(First move)' : '(Second move)'}`;
                gameStatus.style.display = "block";
                
                document.getElementById("turnIndicator").style.display = "block";
                updateTurn(gameState.currentPlayer);
            } else if (data.type === "move") {
                console.log("move received, roomId:", data.roomId, "currentRoomId:", gameState.currentRoomId);
                if (data.roomId === gameState.currentRoomId) {
                    console.log("Opponent move:", data.move);
                    const column = parseInt(data.move.col);
                    void dropPiece(column, true);
                } else {
                    console.log("Ignoring move for a different room");
                }
            } else if (data.type === "gameEnd") {
                console.log("gameEnd received:", data);
                queueResultFromGameEnd(data);
            } else if (data.type === "gameResult") {
                console.log("gameResult received:", data);
                queueResultFromGameResult(data);
            }
        } catch (error) {
            console.error("Message handler error:", error);
        }
    };
    
    return socket;
}

/** Drop a piece; after animation, check win, send WS, switch turn */
export function dropPiece(col, isOpponentMove = false) {
    if (gameState.winner) {
        return Promise.resolve();
    }

    if (gameState.mode === "play-in-online") {
        if (!isOpponentMove && !gameState.isMyTurn) {
            console.log("Not your turn");
            return Promise.resolve();
        }
    }

    if (isColumnFull(col)) {
        console.log("Column full:", col);
        alert('Error: This column is already full. \nPlease choose another one');
        return Promise.resolve();
    }

    let landingRow = -1;
    for (let row = 5; row >= 0; row--) {
        const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        if (!cell) {
            console.log("Cell not found:", row, col);
            continue;
        }

        if (!cell.classList.contains('red') && !cell.classList.contains('yellow')) {
            landingRow = row;
            break;
        }
    }

    if (landingRow === -1) {
        return Promise.resolve();
    }

    console.log("dropPiece start, col:", col);
    console.log("Current player:", gameState.currentPlayer);

    if (insideDropJob) {
        return performDropPiece(col, isOpponentMove, landingRow);
    }

    return enqueueDropOperation(async () => {
        setPieceDropInteractionLocked(true);
        insideDropJob = true;
        try {
            await performDropPiece(col, isOpponentMove, landingRow);
        } finally {
            insideDropJob = false;
            setPieceDropInteractionLocked(false);
        }
    });
}

async function performDropPiece(col, isOpponentMove, landingRow) {
    const cell = document.querySelector(`.cell[data-row="${landingRow}"][data-col="${col}"]`);
    if (!cell) {
        return;
    }

    const movingPlayer = gameState.currentPlayer;
    gameState.virtualBoard[landingRow][col] = movingPlayer;
    cell.classList.add(movingPlayer, 'piece-falling');

    await animatePieceDrop(cell, col);

    cell.classList.remove('piece-falling');
    cell.style.removeProperty('--drop-ty');

    const lastPlayer = movingPlayer;

    if (checkWinner(landingRow, col, lastPlayer)) {
        gameState.setWinner(gameState.currentPlayer);
        console.log(`${lastPlayer} win!!`);

        if (!isOpponentMove && gameState.mode === "play-in-online" && socket && socket.readyState === WebSocket.OPEN) {
            const message = {
                type: "gameEnd",
                roomId: gameState.currentRoomId,
                winner: lastPlayer,
                result: 'win'
            };
            console.log("Sending gameEnd:", message);
            socket.send(JSON.stringify(message));
        }
    }

    let isBoardFull = true;
    for (let c = 0; c < 7; c++) {
        if (!isColumnFull(c)) {
            isBoardFull = false;
            break;
        }
    }

    if (!gameState.winner && isBoardFull) {
        if (gameState.mode === "play-in-online" && !isOpponentMove && socket && socket.readyState === WebSocket.OPEN) {
            const message = {
                type: "gameEnd",
                roomId: gameState.currentRoomId,
                isDraw: true,
                result: 'draw'
            };
            console.log("Sending draw gameEnd:", message);
            socket.send(JSON.stringify(message));
        }

        gameState.setWinner('draw');
        const turnIndicator = document.getElementById("turnIndicator");
        turnIndicator.textContent = "Draw";
        turnIndicator.style.color = "white";
        return;
    }

    if (!isOpponentMove) {
        gameState.switchPlayer();
        gameState.setMyTurn(false);
        updateTurn(gameState.currentPlayer);

        if (socket && socket.readyState === WebSocket.OPEN) {
            const message = {
                type: "move",
                move: { col },
                roomId: gameState.currentRoomId
            };
            console.log("Sending move:", message);
            socket.send(JSON.stringify(message));
        }
    } else {
        gameState.switchPlayer();
        gameState.setMyTurn(true);
        updateTurn(gameState.currentPlayer);
    }

    if (gameState.winner) {
        return;
    }

    if (gameState.currentPlayer === 'yellow' && (gameState.mode === 'play-with-smart-computer-level1' || gameState.mode === 'play-with-smart-computer-level2' || gameState.mode === 'play-with-smart-computer-level3')) {
        await smartComputerTurn();
    }
}

export function checkWinner(row, col, lastPlayer) {
    if (row < 0 || row > 5 || col < 0 || col > 6) {
        return false;
    }

    const currentColor = lastPlayer;

    // Horizontal
    for (let c = Math.max(0, col - 3); c <= Math.min(5, col + 3); c++) {
        const cell1 = document.querySelector(`.cell[data-row="${row}"][data-col="${c}"]`);
        const cell2 = document.querySelector(`.cell[data-row="${row}"][data-col="${c + 1}"]`);
        const cell3 = document.querySelector(`.cell[data-row="${row}"][data-col="${c + 2}"]`);
        const cell4 = document.querySelector(`.cell[data-row="${row}"][data-col="${c + 3}"]`);

        if (cell1 && cell2 && cell3 && cell4 && 
            cell1.classList.contains(currentColor) &&
            cell2.classList.contains(currentColor) &&
            cell3.classList.contains(currentColor) &&
            cell4.classList.contains(currentColor)) {
            for (let i = 0; i < 4; i++) {
                    const winningCell = document.querySelector(`.cell[data-row="${row}"][data-col="${c+i}"]`);
                    if (winningCell) {
                        winningCell.classList.add('win');
                    }
                }
            
            return true;
        }
    }

    // Vertical
    for (let r = Math.max(0, row - 3); r <= Math.min(5, row + 3); r++) {
        const cell1 = document.querySelector(`.cell[data-row="${r}"][data-col="${col}"]`);
        const cell2 = document.querySelector(`.cell[data-row="${r + 1}"][data-col="${col}"]`);
        const cell3 = document.querySelector(`.cell[data-row="${r + 2}"][data-col="${col}"]`);
        const cell4 = document.querySelector(`.cell[data-row="${r + 3}"][data-col="${col}"]`);

        if (cell1 && cell2 && cell3 && cell4 && 
            cell1.classList.contains(currentColor) &&
            cell2.classList.contains(currentColor) &&
            cell3.classList.contains(currentColor) &&
            cell4.classList.contains(currentColor)) {
            for (let i = 0; i < 4; i++) {
                    const winningCell = document.querySelector(`.cell[data-row="${r + i}"][data-col="${col}"]`);
                    if (winningCell) {
                        winningCell.classList.add('win');
                    }
                }
            return true;
        }
    }

    // Diagonal (down-right)
    for (let d = -3; d <= 0; d++) {
        const cell1 = document.querySelector(`.cell[data-row="${row - d}"][data-col="${col - d}"]`);
        const cell2 = document.querySelector(`.cell[data-row="${row - d - 1}"][data-col="${col - d - 1}"]`);
        const cell3 = document.querySelector(`.cell[data-row="${row - d - 2}"][data-col="${col - d - 2}"]`);
        const cell4 = document.querySelector(`.cell[data-row="${row - d - 3}"][data-col="${col - d - 3}"]`);

        if (cell1 && cell2 && cell3 && cell4 && 
            cell1.classList.contains(currentColor) &&
            cell2.classList.contains(currentColor) &&
            cell3.classList.contains(currentColor) &&
            cell4.classList.contains(currentColor)) {
            for (let i = 0; i < 4; i++) {
                    const winningCell = document.querySelector(`.cell[data-row="${row - d - i}"][data-col="${col - d - i}"]`);
                    if (winningCell) {
                        winningCell.classList.add('win');
                    }
                }
            return true;
        }
    }

    // Diagonal (down-left)
    for (let d = -3; d <= 0; d++) {
        const cell1 = document.querySelector(`.cell[data-row="${row + d}"][data-col="${col - d}"]`);
        const cell2 = document.querySelector(`.cell[data-row="${row + d + 1}"][data-col="${col - d - 1}"]`);
        const cell3 = document.querySelector(`.cell[data-row="${row + d + 2}"][data-col="${col - d - 2}"]`);
        const cell4 = document.querySelector(`.cell[data-row="${row + d + 3}"][data-col="${col - d - 3}"]`);

        if (cell1 && cell2 && cell3 && cell4 && 
            cell1.classList.contains(currentColor) &&
            cell2.classList.contains(currentColor) &&
            cell3.classList.contains(currentColor) &&
            cell4.classList.contains(currentColor)) {
            for (let i = 0; i < 4; i++) {
                    const winningCell = document.querySelector(`.cell[data-row="${row + d + i}"][data-col="${col - d - i}"]`);
                    if (winningCell) {
                        winningCell.classList.add('win');
                    }
            }
            return true;
        }
    }

    return false;
}

/** Show mode selection UI */
export function showModeSelection() {
    const modeSelection = document.getElementById('mode-selection');
    const pvcLevels = document.getElementById('pvc-levels');
    modeSelection.style.display = 'flex';
    if (pvcLevels) {
        pvcLevels.style.display = 'none';
    }

    document.getElementById('online-mode').onclick = () => {
        modeSelection.style.display = 'none';
        showAuthForm();
    };

    document.getElementById('pvp-mode').onclick = () => {
        resetBoard();
        gameState.resetCurrentPlayer();
        gameState.resetModePlayWithFrirend();
        modeSelection.style.display = 'none';
        updateAvatarCollectionEntryVisibility();
    };

    // player vs computer mode
    document.getElementById('pvc-mode').onclick = () => {
        if (pvcLevels) {
            pvcLevels.style.display = 'block';
        }
    };
    
    document.getElementById('pvc-mode-level1').onclick = () => {
        resetBoard();
        gameState.resetCurrentPlayer();
        gameState.resetModePlayWithLevel1();
        modeSelection.style.display = 'none';
        updateAvatarCollectionEntryVisibility();
    };
    
    document.getElementById('pvc-mode-level2').onclick = () => {
        resetBoard();
        gameState.resetCurrentPlayer();
        gameState.resetModePlayWithLevel2(); 
        modeSelection.style.display = 'none';
        updateAvatarCollectionEntryVisibility();
    };
    
    document.getElementById('pvc-mode-level3').onclick = () => {
        resetBoard();
        gameState.resetCurrentPlayer();
        gameState.resetModePlayWithLevel3(); 
        modeSelection.style.display = 'none';
        updateAvatarCollectionEntryVisibility();
    };
}

export function updateTurn(player) {
    let turnIndicator = document.getElementById("turnIndicator");
    
    if (gameState.mode === "play-in-online") {
        if (gameState.isMyTurn) {
            turnIndicator.textContent = "Your turn";
            turnIndicator.style.color = gameState.currentPlayer;
        } else {
            turnIndicator.textContent = "Opponent turn";
            turnIndicator.style.color = gameState.currentPlayer;
        }
    } else {
        if (player === "red") {
            turnIndicator.textContent = "red Turn";
            turnIndicator.style.color = "red";
        } else if (player === "yellow") {
            turnIndicator.textContent = "yellow Turn";
            turnIndicator.style.color = "yellow";
        }
    }
    
    if (gameState.winner) {
        if (gameState.winner === 'draw') {
            turnIndicator.textContent = 'Draw';
        } else {
            turnIndicator.textContent = `${gameState.winner} wins!`;
        }
        turnIndicator.style.color = "white";
    }
}

function createRoom() {
    socket.send(JSON.stringify({ type: "createRoom" }));
}

function joinRoom(roomId) {
    socket.send(JSON.stringify({ type: "joinRoom", roomId }));
}

function sendMove(move) {
    socket.send(JSON.stringify({ type: "move", move }));
}

/** Wire column drop buttons */
export function initializeColumnButtons() {
    const columnButtons = document.querySelectorAll('.column-button');
    columnButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (gameState.winner) return;
            const col = button.dataset.col;
            void dropPiece(col);
        });
    });
}

initializeColumnButtons();

(function initAvatarTierCelebrationUi() {
    const closeBtn = document.getElementById('avatar-tier-celebration-close');
    const overlay = document.getElementById('avatar-tier-celebration');
    closeBtn?.addEventListener('click', () => closeAvatarTierCelebration());
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeAvatarTierCelebration();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') {
            return;
        }
        const wrap = document.getElementById('avatar-tier-celebration');
        if (wrap && !wrap.hidden) {
            closeAvatarTierCelebration();
        }
    });
})();

// Next button — dismiss result / return to menu
document.getElementById('next-button').addEventListener('click', () => {
    const gameResult = document.getElementById('game-result');
    if (pendingGameResult && gameResult && gameResult.style.display !== "block") {
        renderQueuedGameResult(pendingGameResult);
        gameResult.style.display = "block";
        pendingGameResult = null;
        return;
    }

    if (gameResult) {
        gameResult.style.display = "none";
    }
    clearResultAnimations();
    document.body.classList.remove('result-open');
    
    const ratingDisplay = document.getElementById('rating-display');
    if (ratingDisplay) {
        ratingDisplay.style.display = "none";
    }
    
    const gameStatus = document.getElementById('gameStatus');
    if (gameStatus) {
        gameStatus.style.display = "none";
    }
    
    gameState.clearGameMode();
    hidePostLoginActions();
    updateAvatarCollectionEntryVisibility();

    showModeSelection();
});
    
export function showMatchScreen(data) {
    const existingOverlay = document.querySelector('.match-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    updateSidebarAvatarCards(data);
    const leftName = escapeHtml(data.isFirstMove ? data.myUsername : data.opponentUsername);
    const rightName = escapeHtml(data.isFirstMove ? data.opponentUsername : data.myUsername);

    const overlay = document.createElement('div');
    overlay.className = 'match-overlay';
    overlay.innerHTML = `
        <div class="match-content">
            <div class="player-info">
                <div class="player-avatar">
                    <img src="${getAvatarPath(data.isFirstMove ? data.rating : data.opponentRating)}" 
                         alt="Player 1 Avatar">
                </div>
                <div class="player-details">
                    <div class="player-name">${leftName}</div>
                    <div class="player-rating">Rating: ${data.isFirstMove ? data.rating : data.opponentRating}</div>
                </div>
            </div>
            <div class="vs-text">VS</div>
            <div class="player-info">
                <div class="player-avatar">
                    <img src="${getAvatarPath(data.isFirstMove ? data.opponentRating : data.rating)}" 
                         alt="Player 2 Avatar">
                </div>
                <div class="player-details">
                    <div class="player-name">${rightName}</div>
                    <div class="player-rating">Rating: ${data.isFirstMove ? data.opponentRating : data.rating}</div>
                </div>
            </div>
            <div class="match-status">Matched!</div>
        </div>
    `;

    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.remove();
        resetBoard();
        gameState.resetCurrentPlayer();
        gameState.resetModePlayInOnline();
        gameState.setCurrentRoomId(data.roomId);
        gameState.setMyTurn(data.isFirstMove);
        updateTurn(gameState.currentPlayer);

        const ratingDisplay = document.getElementById("rating-display");
        const player1Name = document.getElementById("player1-name");
        const player1Rating = document.getElementById("player1-rating");
        const player2Name = document.getElementById("player2-name");
        const player2Rating = document.getElementById("player2-rating");

        if (data.isFirstMove) {
            player1Name.textContent = `You (${data.myUsername})`;
            player1Rating.textContent = `Rating: ${data.rating}`;
            player2Name.textContent = `Opponent (${data.opponentUsername})`;
            player2Rating.textContent = `Rating: ${data.opponentRating}`;
        } else {
            player1Name.textContent = `Opponent (${data.opponentUsername})`;
            player1Rating.textContent = `Rating: ${data.opponentRating}`;
            player2Name.textContent = `You (${data.myUsername})`;
            player2Rating.textContent = `Rating: ${data.rating}`;
        }
        ratingDisplay.style.display = "flex";
        
        const gameStatus = document.getElementById("gameStatus");
        gameStatus.textContent = `Game start! ${data.isFirstMove ? '(First move)' : '(Second move)'}`;
        gameStatus.style.display = "block";
        
        document.getElementById("turnIndicator").style.display = "block";
    }, 3000);
}
