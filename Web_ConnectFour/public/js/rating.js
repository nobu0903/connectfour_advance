// Elo rating calculation (client-side helper)
export function calculateNewRatings(player1Rating, player2Rating, result) {
    const K = 32; // K-factor
    const expectedScore1 = 1 / (1 + Math.pow(10, (player2Rating - player1Rating) / 400));
    const expectedScore2 = 1 / (1 + Math.pow(10, (player1Rating - player2Rating) / 400));

    let actualScore1, actualScore2;
    
    if (result === 'win') {
        actualScore1 = 1;
        actualScore2 = 0;
    } else if (result === 'loss') {
        actualScore1 = 0;
        actualScore2 = 1;
    } else { // draw
        actualScore1 = 0.5;
        actualScore2 = 0.5;
    }

    const newRating1 = Math.round(player1Rating + K * (actualScore1 - expectedScore1));
    const newRating2 = Math.round(player2Rating + K * (actualScore2 - expectedScore2));

    return {
        player1NewRating: newRating1,
        player2NewRating: newRating2,
        ratingChange1: newRating1 - player1Rating,
        ratingChange2: newRating2 - player2Rating
    };
}