// Import elements and functions from other modules
import { createBoard, resetBoard } from "./board.js"
import { minimax } from "./computer.js"

// Note: board export would live here if needed
export const dropButton = null; // intentionally null here

export let currentPlayer = 'red'; // active player color
export let mode = null;
export let winner = null;
export let currentRoomId = null;
export let isMyTurn = true;

export function setCurrentRoomId(roomId) {
    currentRoomId = roomId;
}

export function resetCurrentPlayer() {
    currentPlayer = 'red';
}

export function switchPlayer() {
    currentPlayer = currentPlayer === 'red' ? 'yellow' : 'red';
}

export function resetModePlayInOnline () {
    mode = "play-in-online";
}

/** Call when leaving online flow (e.g. back to mode menu) so UI hooks reset. */
export function clearGameMode () {
    mode = null;
}
export function resetModePlayWithFrirend () {
    mode = "play-with-friend";
}
export function resetModePlayWithLevel1 () {
    mode = "play-with-smart-computer-level1";
}
export function resetModePlayWithLevel2  () {
    mode = "play-with-smart-computer-level2";
}
export function resetModePlayWithLevel3  () {
    mode = "play-with-smart-computer-level3";
}

export function resetWinnerToRed() {
    winner = 'red';
}
export function resetWinnerToNull() {
    winner = null;
}
export function setWinner(player) {
    winner = player;
}
export let virtualBoard = Array.from({ length: 6 }, () => Array(7).fill(null));

// Reset virtualBoard to empty; used as minimax input
export function resetVirtualBoard() {
    virtualBoard = Array.from({ length: 6 }, () => Array(7).fill(null));
}

// Initial minimax sample call on empty virtual board (depth 3, maximizing player)
export const bestScore = minimax(virtualBoard, 3, true, -Infinity, Infinity);

export let gameMode = null; // 'pvp' or 'pvc'

export function initializeGameElements() {
    const board = document.getElementById("board");
    const dropButton = document.getElementById("dropButton");
    // Other element setup can go here
}

export function resetCurrentRoomId() {
    currentRoomId = null;
}

export function setMyTurn(value) {
    isMyTurn = value;
}

export function resetMyTurn() {
    isMyTurn = true;
}




