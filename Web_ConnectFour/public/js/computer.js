import * as gameState from "./GameState.js"
import { dropPiece } from "./gameLogic.js";


export async function smartComputerTurn() {
    const availableColumns = [];

    for(let col = 0; col < 7; col++) {
        const cell = document.querySelector(`.cell[data-row="0"][data-col="${col}"]`);
        if (!cell.classList.contains('red') && !cell.classList.contains('yellow')) {
            availableColumns.push(col);
        }
    }

    // Pick the best column using minimax
    let bestCol = availableColumns[0];
    let bestScore = -Infinity;

    for (const col of availableColumns) {
        const newNode = createNewNode(gameState.virtualBoard, col, gameState.currentPlayer); /* new board state */
        if (gameState.mode === 'play-with-smart-computer-level1') {
            const score = minimax(newNode, 1, false, -Infinity, Infinity); // depth-1 eval
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        } 
        else if (gameState.mode === 'play-with-smart-computer-level2') {
            const score = minimax(newNode, 2, false, -Infinity, Infinity); // depth-2 eval
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        }
        else if (gameState.mode === 'play-with-smart-computer-level3') {
            const score = minimax(newNode, 3, false, -Infinity, Infinity); // depth-3 eval
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        }
        
    }

    await dropPiece(bestCol);
}

// Build a new board state after dropping in `col`
export function createNewNode(virtualBoard, col, player) {
    const newNode = virtualBoard.map(row => row.slice()); // copy board

    // Drop a piece into the column (gravity)
    for (let row = newNode.length - 1; row >= 0; row--) {
        if (!newNode[row][col]) { // find lowest empty cell
            newNode[row][col] = player;
            break;
        }
    }

    return newNode;
}

// https://www.youtube.com/watch?v=l-hh51ncgDI — minimax + alpha-beta pruning (reference video)
// Alpha (α): best score the maximizing player can guarantee at this node (lower bound).
// Beta (β): best score the minimizing player can guarantee at this node (upper bound).
export function minimax (node, depth, isMaximizingPlayer, alpha, beta) {
    // Leaf: depth exhausted or terminal position
    if (depth === 0 || isGameOver(node)) {
        return evaluateBoard(node)
    }
    if (isMaximizingPlayer) {
        let maxEval = -Infinity;
        for (let col = 0; col < 7; col++) {
            if (node[0][col] === null) { // column not full (top row empty)
                const newNode = createNewNode(node, col, 'yellow');
                const score = minimax(newNode, depth - 1, false, alpha, beta);
                maxEval = Math.max(maxEval, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break // beta cut             
            }
        }
        return maxEval;
    }
    else {
        let minEval = Infinity;
        for (let col = 0; col < 7; col++) {
            if (node[0][col] === null) {
                const newNode = createNewNode(node, col, 'red');
                const score = minimax(newNode, depth - 1, true, alpha, beta);
                minEval = Math.min(minEval, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break; // alpha cut
            }
        }
        return minEval;
    }
}

// Used only by minimax in this file (kept here, not in gameLogic.js)
export function isGameOver(node) {
    // Terminal check using only the virtual board
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
            const cell = node[row][col];
            if (cell) {
                if (cell === 'red' || cell === 'yellow') {
                    if (checkWinnerOnNode(node, row, col, cell)) {
                        return true;
                    }
                }
            }
        }
    }

    for (let col = 0; col < 7; col++) {
        if (node[0][col] === null) {
            return false; // at least one column playable
        }
    }

    return true; // board full (draw)
}

function checkWinnerOnNode(node, row, col, color) {
    const directions = [
        [0, 1],   // horizontal
        [1, 0],   // vertical
        [1, 1],   // diagonal down-right
        [1, -1],  // diagonal down-left
    ];

    for (const [dr, dc] of directions) {
        let count = 1;

        for (let step = 1; step < 4; step++) {
            const r = row + dr * step;
            const c = col + dc * step;
            if (r < 0 || r >= 6 || c < 0 || c >= 7 || node[r][c] !== color) {
                break;
            }
            count++;
        }

        for (let step = 1; step < 4; step++) {
            const r = row - dr * step;
            const c = col - dc * step;
            if (r < 0 || r >= 6 || c < 0 || c >= 7 || node[r][c] !== color) {
                break;
            }
            count++;
        }

        if (count >= 4) {
            return true;
        }
    }

    return false;
}

//computer.js
export function evaluateBoard(node) {
    let score = 0;

    // Horizontal segments
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 4; col++) {
            let compCount = 0;
            let playerCount = 0;

            for (let i = 0; i < 4; i++) {
                if (node[row][col + i] === 'yellow') compCount++;
                if (node[row][col + i] === 'red') playerCount++;
            }
            score += evaluateLine(compCount, playerCount);
        }
    }

    // Vertical segments
    for (let col = 0; col < 7; col++) {
        for (let row = 0; row < 3; row++) {
            let compCount = 0;
            let playerCount = 0;

            for (let i = 0; i < 4; i++) {
                if (node[row + i][col] === 'yellow') compCount++;
                if (node[row + i][col] === 'red') playerCount++;
            }
            score += evaluateLine(compCount, playerCount);
        }
    }

    // Diagonal (down-right)
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
            let compCount = 0;
            let playerCount = 0;

            for (let i = 0; i < 4; i++) {
                if (node[row + i][col + i] === 'yellow') compCount++;
                if (node[row + i][col + i] === 'red') playerCount++;
            }
            score += evaluateLine(compCount, playerCount);
        }
    }

    // Diagonal (down-left)
    for (let row = 0; row < 3; row++) {
        for (let col = 3; col < 7; col++) {
            let compCount = 0;
            let playerCount = 0;

            for (let i = 0; i < 4; i++) {
                if (node[row + i][col - i] === 'yellow') compCount++;
                if (node[row + i][col - i] === 'red') playerCount++;
            }
            score += evaluateLine(compCount, playerCount);
        }
    }
    return score;
}

function evaluateLine(compCount, playerCount) {
    if (compCount > 0 && playerCount > 0) return 0;
    if (compCount === 4) return 1000; // AI four in a row
    if (compCount === 3) return 77;
    if (compCount === 2) return 27;
    if (playerCount === 4) return -1000;
    if (playerCount === 3) return -77;
    if (playerCount === 2) return -35;
    return compCount - playerCount;
}