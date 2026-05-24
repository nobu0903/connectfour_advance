import { createBoard } from "./board.js"
import { minimax } from "./computer.js"
import { showModeSelection } from "./gameLogic.js";
import { setupAvatarCollectionOverlay, updateAvatarCollectionEntryVisibility } from "./avatar-collection-overlay.js";

createBoard();

// Show mode selection when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const board = document.getElementById("board");
    showModeSelection();

    setupAvatarCollectionOverlay();
    updateAvatarCollectionEntryVisibility();

    // Start ping keep-alive
    startPingService();
    
});

// Ping keep-alive implementation
function startPingService() {
    const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes
    const PING_URL = '/ping';

    async function sendPing() {
        try {
            const response = await fetch(PING_URL);
            const data = await response.json();
            console.log('Ping sent successfully:', data);
        } catch (error) {
            console.error('Ping error:', error);
        }
    }

    // Send first ping immediately
    sendPing();

    // Send ping on an interval
    setInterval(sendPing, PING_INTERVAL);
}




