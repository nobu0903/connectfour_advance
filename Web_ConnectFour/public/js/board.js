import * as gameState from './GameState.js';
import { updateTurn } from "./gameLogic.js";

const BOARD_COORDINATES = Object.freeze({
    // Hole centers as normalized coordinates (%) on the board image
    // Keeps pieces aligned when size/aspect changes
    colCenters: [11.81, 24.51, 37.21, 49.8, 62.5, 75.2, 87.9],
    rowCenters: [14.8, 29.6, 44.7, 60.65, 75.5, 90.4],
});

const BOARD_IMAGE_RATIO = 705 / 575;
let resizeSyncBound = false;

function mapImagePercentToFramePercent(frameRect, imageBounds, imageXPercent, imageYPercent) {
    const xInFrame = imageBounds.left + imageBounds.width * (imageXPercent / 100);
    const yInFrame = imageBounds.top + imageBounds.height * (imageYPercent / 100);
    return {
        x: (xInFrame / frameRect.width) * 100,
        y: (yInFrame / frameRect.height) * 100,
    };
}

function getImageBoundsInFrame(frameRect) {
    const frameRatio = frameRect.width / frameRect.height;
    if (frameRatio > BOARD_IMAGE_RATIO) {
        const imageHeight = frameRect.height;
        const imageWidth = imageHeight * BOARD_IMAGE_RATIO;
        return {
            left: (frameRect.width - imageWidth) / 2,
            top: 0,
            width: imageWidth,
            height: imageHeight,
        };
    }

    const imageWidth = frameRect.width;
    const imageHeight = imageWidth / BOARD_IMAGE_RATIO;
    return {
        left: 0,
        top: (frameRect.height - imageHeight) / 2,
        width: imageWidth,
        height: imageHeight,
    };
}

function getMappedCenters(frameRect) {
    const imageBounds = getImageBoundsInFrame(frameRect);
    return {
        colCenters: BOARD_COORDINATES.colCenters.map((x) => mapImagePercentToFramePercent(frameRect, imageBounds, x, 0).x),
        rowCenters: BOARD_COORDINATES.rowCenters.map((y) => mapImagePercentToFramePercent(frameRect, imageBounds, 0, y).y),
    };
}

function syncColumnButtonsWithBoard(mappedColCenters) {
    const buttons = document.querySelectorAll('.column-button');
    const centers = mappedColCenters;
    if (buttons.length !== centers.length) {
        return;
    }

    const widths = centers.map((_, index) => {
        if (index === 0) {
            return (centers[1] - centers[0]) * 0.8;
        }
        if (index === centers.length - 1) {
            return (centers[index] - centers[index - 1]) * 0.8;
        }
        return ((centers[index + 1] - centers[index - 1]) / 2) * 0.8;
    });

    buttons.forEach((button, index) => {
        button.style.setProperty('--btn-x', `${centers[index]}%`);
        button.style.setProperty('--btn-w', `${widths[index]}%`);
    });
}

function applyBoardCoordinates() {
    const board = document.getElementById('board');
    if (!board) {
        return;
    }

    const frameRect = board.getBoundingClientRect();
    if (!frameRect.width || !frameRect.height) {
        return;
    }

    const mapped = getMappedCenters(frameRect);
    const cells = board.querySelectorAll('.cell');
    cells.forEach((cell) => {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        if (!Number.isInteger(row) || !Number.isInteger(col)) {
            return;
        }
        cell.style.setProperty('--cell-x', `${mapped.colCenters[col]}%`);
        cell.style.setProperty('--cell-y', `${mapped.rowCenters[row]}%`);
    });

    syncColumnButtonsWithBoard(mapped.colCenters);
}

// Build the board grid (7 cols × 6 rows)
export function createBoard() {
    const board = document.getElementById('board');
    if (!board) {
        return;
    }

    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            cell.dataset.row = row;
            cell.dataset.col = col;
            board.appendChild(cell);
        }
    }

    applyBoardCoordinates();
    if (!resizeSyncBound) {
        window.addEventListener('resize', applyBoardCoordinates);
        resizeSyncBound = true;
    }
}

export function resetBoard() {
    document.body.classList.remove('piece-drop-active');
    const board = document.getElementById('board');
    board.innerHTML = '';
    createBoard();
    // Reset virtual board too
    gameState.resetVirtualBoard()
    gameState.resetCurrentPlayer();
    gameState.resetWinnerToNull()
    updateTurn(gameState.currentPlayer);
}

//board.js
export function isColumnFull(col) {
    const cell = document.querySelector(`.cell[data-row="0"][data-col="${col}"]`);
    return cell && (cell.classList.contains('red') || cell.classList.contains('yellow'));
}

const DROP_DURATION_MS = 520;
const BOUNCE_DURATION_MS = 160;
const BOUNCE_AMPLITUDE_PX = 11;

/**
 * Animate drop from top of column to target cell (gravity-like easing + bounce).
 */
export function animatePieceDrop(cell, col) {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            const topCell = document.querySelector(`.cell[data-row="0"][data-col="${col}"]`);
            if (!cell || !topCell) {
                resolve();
                return;
            }

            const topRect = topCell.getBoundingClientRect();
            const targetRect = cell.getBoundingClientRect();
            const fallPx = (targetRect.top + targetRect.height / 2) - (topRect.top + topRect.height / 2);

            if (fallPx <= 4) {
                cell.style.setProperty('--drop-ty', '0px');
                resolve();
                return;
            }

            const start = performance.now();

            function frame(now) {
                const elapsed = now - start;

                if (elapsed < DROP_DURATION_MS) {
                    const t = elapsed / DROP_DURATION_MS;
                    const eased = t * t * t;
                    const ty = -fallPx * (1 - eased);
                    cell.style.setProperty('--drop-ty', `${ty}px`);
                    requestAnimationFrame(frame);
                    return;
                }

                if (elapsed < DROP_DURATION_MS + BOUNCE_DURATION_MS) {
                    const tb = (elapsed - DROP_DURATION_MS) / BOUNCE_DURATION_MS;
                    const bounce = -BOUNCE_AMPLITUDE_PX * Math.sin(Math.PI * tb) * (1 - tb);
                    cell.style.setProperty('--drop-ty', `${bounce}px`);
                    requestAnimationFrame(frame);
                    return;
                }

                cell.style.removeProperty('--drop-ty');
                resolve();
            }

            cell.style.setProperty('--drop-ty', `${-fallPx}px`);
            requestAnimationFrame(frame);
        });
    });
}