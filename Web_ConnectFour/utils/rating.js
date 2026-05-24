// Elo rating calculation
// result:
// - 'win'  : player1 wins
// - 'loss' : player1 loses
// - 'draw' : draw
// Booleans accepted for backwards compatibility (true = win, false = loss)
export function calculateNewRatings(player1Rating, player2Rating, result, isComputerMatch = false) {
    // K tuned so ~±50 per game at equal ratings (feel-based)
    let K = 100;
    
    if (isComputerMatch) {
        // Larger swings vs computer
        K = 140;
    } else {
        // Human vs human: scale K by rating gap
        const ratingDiff = Math.abs(player1Rating - player2Rating);
        if (ratingDiff < 200) {
            K = 100;
        } else if (ratingDiff < 400) {
            K = 130;
        } else {
            K = 160;
        }
    }

    // Expected score
    const expectedScore1 = 1 / (1 + Math.pow(10, (player2Rating - player1Rating) / 400));
    const expectedScore2 = 1 - expectedScore1;

    // Actual score
    const normalizedResult = typeof result === 'boolean'
        ? (result ? 'win' : 'loss')
        : result;

    let actualScore1;
    if (normalizedResult === 'win') {
        actualScore1 = 1;
    } else if (normalizedResult === 'draw') {
        actualScore1 = 0.5;
    } else {
        actualScore1 = 0;
    }
    const actualScore2 = 1 - actualScore1;

    // Updated ratings
    const player1NewRating = Math.round(player1Rating + K * (actualScore1 - expectedScore1));
    const player2NewRating = Math.round(player2Rating + K * (actualScore2 - expectedScore2));

    return {
        player1NewRating,
        player2NewRating
    };
} 