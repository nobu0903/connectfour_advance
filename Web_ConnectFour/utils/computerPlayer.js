import { WebSocket } from 'ws';

class ComputerPlayer {
    constructor(rating = 1200) {
        this.userId = 'computer';
        this.username = 'Computer';
        this.rating = rating;
        this.isComputer = true;
    }

    calculateMove(board) {
        // Default to empty board if undefined
        const currentBoard = board || [...Array(6)].map(() => Array(7).fill(null));
        
        // List legal moves
        const validMoves = [];
        for (let col = 0; col < 7; col++) {
            if (currentBoard[0][col] === null) {
                validMoves.push(col);
            }
        }
        
        if (validMoves.length === 0) {
            return 0;
        }
        
        // Pick a random legal move
        const randomIndex = Math.floor(Math.random() * validMoves.length);
        return validMoves[randomIndex];
    }

    // Emulate a WebSocket-style interface
    send(message) {
        try {
            const data = JSON.parse(message);
            if (data.type === 'gameStart') {
                setTimeout(() => {
                    if (data.isFirstMove) {
                        const initialMove = this.calculateMove();
                        this._onMove({ 
                            type: 'move', 
                            move: { col: initialMove },
                            roomId: data.roomId 
                        });
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('Computer player message error:', error);
        }
    }

    // Move callback
    set onMove(callback) {
        this._onMove = callback;
    }
}

export default ComputerPlayer; 