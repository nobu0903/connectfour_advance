//main.js
const board = document.getElementById("board");
const dropButton = document.getElementById("dropButton");
let currentPlayer = 'red'; // active player color
let mode = 'play-with-friend';
let winner = null; // winner state

//board.js
// Build board (7 x 6)
function createBoard() {
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");//add cell class for CSS
            cell.dataset.row = row;//sets data-row
            cell.dataset.col = col;//sets data-col
            board.appendChild(cell);//append cells to board
        }
    }
}

//main.js Do export from board.js
createBoard();

//gameLogic.js
// dropPiece
function dropPiece(col) {
    if (winner) return; // abort if game over

    for (let row = 5; row >= 0; row--) { // search bottom to top
        const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        if (isColumnFull(col)) {
            alert('Error: This column is already full. \nPlease choose another one');
            return; // abort if column full
        }
        if (!cell.classList.contains('red') && !cell.classList.contains('yellow')) { // find empty cell
            cell.classList.add(currentPlayer); // apply current player color
            virtualBoard[row][col] = currentPlayer; // sync virtualBoard
            const lastPlayer = currentPlayer; // remember last mover
            
            // winner check
            if (checkWinner(row, col, lastPlayer)) { // winner check uses lastPlayer
                winner = lastPlayer; // set winner
                console.log(`${lastPlayer} win!!`); // log winner color
            }
            break;
        }
    }
    
    // switch turns
    currentPlayer = currentPlayer === 'red' ? 'yellow' : 'red';
    updateTurn(currentPlayer);
    
    // skip turn update if winner
    if (winner) {
        return; // stop when winner decided
    }
     else if (currentPlayer === 'yellow' && (mode === 'play-with-smart-computer-level1' || mode === 'play-with-smart-computer-level2' || mode === 'play-with-smart-computer-level3')) {
        smartComputerTurn(); // computer turn
    }
}

//board.js
function resetBoard() {
    const board = document.getElementById('board');
    board.innerHTML = ''; // clear board DOM
    createBoard();//call createBoard to rebuild
    // reset virtualBoard
    virtualBoard = Array.from({ length: 6 }, () => Array(7).fill(null));
    currentPlayer = 'red';
    winner = null;
    updateTurn(currentPlayer);
}

//board.js
function isColumnFull(col) {
    const cell = document.querySelector(`.cell[data-row="0"][data-col="${col}"]`);
    return cell && (cell.classList.contains('red') || cell.classList.contains('yellow'));
}

//computer.js
function smartComputerTurn() {
    const availableColumns = [];

    for(let col = 0; col < 7; col++) {
        const cell = document.querySelector(`.cell[data-row="0"][data-col="${col}"]`);
        if (!cell.classList.contains('red') && !cell.classList.contains('yellow')) {
            availableColumns.push(col);
        }
    }

    // minimax picks column
    let bestCol = availableColumns[0];
    let bestScore = -Infinity;

    for (const col of availableColumns) {
        const newNode = createNewNode(virtualBoard, col, currentPlayer);/* new game state */
        if (mode === 'play-with-smart-computer-level1') {
            const score = minimax(newNode, 1, false, -Infinity, Infinity); // depth eval
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        } 
        else if (mode === 'play-with-smart-computer-level2') {
            const score = minimax(newNode, 2, false, -Infinity, Infinity); // depth eval
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        }
        else if (mode === 'play-with-smart-computer-level3') {
            const score = minimax(newNode, 3, false, -Infinity, Infinity); // depth eval
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        }
        
    }

    dropPiece(bestCol);
}

//main.js
//virtualBoard reset for minimax
let virtualBoard = Array.from({ length: 6 }, () => Array(7).fill(null));


//.computer.js
// createNewNode
function createNewNode(virtualBoard, col, player) {
    const newNode = virtualBoard.map(row => row.slice()); // copy board

    // drop into column
    for (let row = newNode.length - 1; row >= 0; row--) {
        if (!newNode[row][col]) { // found empty cell
            newNode[row][col] = player; // place piece
            break; // done placing
        }
    }

    return newNode; // return new board
}

//computer.js
//https://www.youtube.com/watch?v=l-hh51ncgDI minimax / alpha-beta (video)
// Alpha-beta pruning (see also computer.js in the modular app)
function minimax (node, depth, isMaximizingPlayer, alpha, beta) {
    //leaf: evaluate board
    if (depth === 0 || isGameOver(node)) {
        return evaluateBoard(node)
    }
    // Maximizing branch
    if (isMaximizingPlayer) {
        let maxEval = -Infinity;
        for (let col = 0; col < 7; col++) {
            if (node[0][col] === null) { // column has room if top empty
                const newNode = createNewNode(node, col, 'yellow'); // using node
                const eval = minimax(newNode, depth - 1, false, alpha, beta); // pass newNode
                maxEval = Math.max(maxEval, eval);
                alpha = Math.max(alpha, eval);//update alpha
                if (beta <= alpha) break //beta cut             
            }
        }
        return maxEval;
    }
    else {
        let minEval = Infinity; // init minEval
        for (let col = 0; col < 7; col++) {
            if (node[0][col] === null) {
                const newNode = createNewNode(node, col, 'red');
                const eval = minimax(newNode, depth - 1, true, alpha, beta);
                minEval = Math.min(minEval, eval);
                beta = Math.min(beta, eval);//update beta
                if (beta <= alpha) break; // alpha cut
            }
        }
        return minEval;
    }
}

//main.js
// initial minimax call
const bestScore = minimax(virtualBoard, 3, true, -Infinity, Infinity); // depth 3 sample

//helpers moved to computer.js in modular version
function isGameOver(node) {
    // inspect board
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
            const cell = node[row][col];
            if (cell) { // non-null cell
                if (cell === 'red' || cell === 'yellow') {
                    // check winner
                    if (checkWinner(row, col, cell)) {
                        return true; // winner found
                    }
                }
            }
        }
    }

    // board full check
    for (let col = 0; col < 7; col++) {
        if (!isColumnFull(col)) {
            return false; // playable column exists
        }
    }

    return true; // board full
}

//computer.js
function evaluateBoard(node) {
    let score = 0;

    // horizontal scan
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

    // vertical scan
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

    // diagonal down-right
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

    // diagonal down-left
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

    console.log(score); // debug log
    return score; // return score
}

//computer.js
// evaluateLine helper
function evaluateLine(compCount, playerCount) {
    if (compCount > 0 && playerCount > 0) return 0;
    if (compCount === 4) return 1000; // winning pattern
    if (compCount === 3) return 77;  // higher weight
    if (compCount === 2) return 27;   // higher weight
    if (playerCount === 4) return -1000;
    if (playerCount === 3) return -77;
    if (playerCount === 2) return -35;
    return compCount - playerCount; // single pieces matter
}


//main.js
// attach listeners
//must stay in sync with PVC flow





//main.js
// column button clicks
const columnButtons = document.querySelectorAll('.column-button');
columnButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (winner) return; // no-op if winner
        const col = button.dataset.col; // read column from button
        dropPiece(col); // drop piece
    });
});

//gameLogic.js
function checkWinner(row, col, lastPlayer) {
    // bounds check
    if (row < 0 || row > 5 || col < 0 || col > 6) {
        return false; // out of bounds
    }

    const currentColor = lastPlayer; // last mover color

    // horizontal scan
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
            // have winner
                // highlight winning cells
                for (let i = 0; i < 4; i++) {
                    const winningCell = document.querySelector(`.cell[data-row="${row}"][data-col="${c+i}"]`);
                    if (winningCell) {
                        winningCell.classList.add('win'); // apply win animation
                    }
                }
            
            return true; // four horizontal
        }
    }

    // vertical scan
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
            // have winner
            
                // highlight winning cells
                for (let i = 0; i < 4; i++) {
                    const winningCell = document.querySelector(`.cell[data-row="${r + i}"][data-col="${col}"]`);
                    if (winningCell) {
                        winningCell.classList.add('win'); // apply win animation
                    }
                }
                
            
            return true; // four vertical
        }
    }

    // diagonal down-right
    for (let d = -3; d <= 0; d++) {
        const cell1 = document.querySelector(`.cell[data-row="${row - d}"][data-col="${col - d}"]`);//diagonal indexing
        const cell2 = document.querySelector(`.cell[data-row="${row - d - 1}"][data-col="${col - d - 1}"]`);
        const cell3 = document.querySelector(`.cell[data-row="${row - d - 2}"][data-col="${col - d - 2}"]`);
        const cell4 = document.querySelector(`.cell[data-row="${row - d - 3}"][data-col="${col - d - 3}"]`);
        console.log("diag DR check")

        if (cell1 && cell2 && cell3 && cell4 && 
            cell1.classList.contains(currentColor) &&
            cell2.classList.contains(currentColor) &&
            cell3.classList.contains(currentColor) &&
            cell4.classList.contains(currentColor)) {
            // have winner
            
                // highlight winning cells
                for (let i = 0; i < 4; i++) {
                    const winningCell = document.querySelector(`.cell[data-row="${row - d - i}"][data-col="${col - d - i}"]`);
                    if (winningCell) {
                        winningCell.classList.add('win'); // apply win animation
                    }
                }
                
            
            return true; // four diag DR
        }
    }

    // diagonal down-left
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
            // have winner
            
                // highlight winning cells
                for (let i = 0; i < 4; i++) {
                    const winningCell = document.querySelector(`.cell[data-row="${row + d + i}"][data-col="${col - d - i}"]`);
                    if (winningCell) {
                        winningCell.classList.add('win'); // apply win animation
                    }
            }
            return true; // four diag DL
        }
    }

    
    return false; // no four
}

//main.js
// game mode state
let gameMode = null; // 'pvp' or 'pvc'

//main.js
// mode menu on load
document.addEventListener('DOMContentLoaded', () => {
    showModeSelection();
    document.getElementById('next-button').addEventListener('click', () => {
        resetBoard(); // reset board
        showModeSelection();
        const nextButton = document.getElementById('next-button');
        nextButton.style.display = 'block'; // show message
    });
});

//main.js
// show mode menu
function showModeSelection() {
    const modeSelection = document.getElementById('mode-selection');
    modeSelection.style.display = 'flex';

    // player vs player mode 
    document.getElementById('pvp-mode').addEventListener('click', () => {
        resetBoard(); // reset board
        currentPlayer = 'red'; // set player red
        mode = 'play-with-friend';
        modeSelection.style.display = 'none';
    });

    // player vs computer mode
    document.getElementById('pvc-mode').addEventListener('click', () => {
        document.getElementById('pvc-levels').style.display = 'block'; // show levels
    });
    
    // PVC level buttons
    document.getElementById('pvc-mode-level1').addEventListener('click', () => {
        resetBoard(); // reset board
        currentPlayer = 'red'; // set player red
        mode = 'play-with-smart-computer-level1'; // set mode
        modeSelection.style.display = 'none';
    });
    
    document.getElementById('pvc-mode-level2').addEventListener('click', () => {
        resetBoard(); // reset board
        currentPlayer = 'red'; // set player red
        mode = 'play-with-smart-computer-level2'; // set mode
        modeSelection.style.display = 'none';
    });
    
    document.getElementById('pvc-mode-level3').addEventListener('click', () => {
        resetBoard(); // reset board
        currentPlayer = 'red'; // set player red
        mode = 'play-with-smart-computer-level3'; // set mode
        modeSelection.style.display = 'none';
    });
    
}

//TODO remove
// start handlers
function startGame() {
    if (gameMode === 'pvp') {
        // init PvP
        initializePvPMode();
    } else if (gameMode === 'pvc') {
        // init PVC
        initializePvCMode();
    }
}

//TODO remove
// PvP stub
function initializePvPMode() {
    // PvP code here
    console.log('Starting PvP mode');
}

//TODO remove
// PVC stub
function initializePvCMode() {
    // PVC code here
    console.log('Starting PvC mode');
}
document.getElementById('next-button').addEventListener('click', () => {
    const nextButton = document.getElementById('next-button');
    resetBoard(); // reset board
    showModeSelection();
    nextButton.style.display = 'block'; // show message
});

function updateTurn(player) {
    let turnIndicator = document.getElementById("turnIndicator");
    

    if (player === "red") {
        turnIndicator.textContent = "red Turn";
        turnIndicator.style.color = "red";
    } else if (player === "yellow") {
        turnIndicator.textContent = "yellow Turn";
        turnIndicator.style.color = "yellow";
    } 
    
    if (winner) {
        turnIndicator.textContent = `${winner} wins!`;
        turnIndicator.style.color = "white";
    }
}

