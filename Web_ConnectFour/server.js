import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import cors from 'cors';
import User from './models/User.js';
import { calculateNewRatings } from './utils/rating.js';
import rateLimit from 'express-rate-limit';
import ComputerPlayer from './utils/computerPlayer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ 
    server,
    perMessageDeflate: {
        zlibDeflateOptions: {
            level: 6,  // zlib level 1–9; 6 balances speed vs size
            memLevel: 8
        },
        clientTracking: true,
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        threshold: 1024 // compress messages >= 1KB
    },
    maxPayload: 50 * 1024 // max WebSocket payload 50KB
});

// Trust proxy (for rate limit / IP behind reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: [
                "'self'",
                "ws://localhost:3000",
                "wss://localhost:3000",
                "ws://web-connectfour.onrender.com",
                "wss://web-connectfour.onrender.com"
            ],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
        },
    },
}));
app.use(cors({
    origin: ['http://localhost:3000', 'https://web-connectfour.onrender.com'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests. Please wait and try again.'
        });
    }
});
app.use('/api/', limiter);

console.log('Connecting to MongoDB...');
const startTime = Date.now();

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true,
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
})
    .then(() => {
        const connectionTime = Date.now() - startTime;
        console.log(`MongoDB connected (${connectionTime}ms)`);
        console.log('Connection URL:', maskMongoUri(process.env.MONGODB_URI));
        
        return User.collection.getIndexes();
    })
    .then(indexes => {
        console.log('Current indexes:', indexes);
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        console.error('Connection URL:', maskMongoUri(process.env.MONGODB_URI));
    });

mongoose.connection.on('connected', () => {
    console.log('Mongoose: connected');
});

mongoose.connection.on('error', (err) => {
    console.error('Mongoose: connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose: disconnected');
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    process.exit(0);
});

app.use(express.json());

const authCache = new Map();
const AUTH_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

async function authenticateConnection(token) {
    try {
        const cachedAuth = authCache.get(token);
        if (cachedAuth && (Date.now() - cachedAuth.timestamp) < AUTH_CACHE_DURATION) {
            return cachedAuth.user;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (user) {
            authCache.set(token, {
                user: user,
                timestamp: Date.now()
            });
        }

        return user;
    } catch (error) {
        return null;
    }
}

// Profile API must register before static files so /api/me is not swallowed
app.get('/api/me', async (req, res) => {
    try {
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7);
        }
        if (!token) {
            token = req.query.token;
        }
        if (!token) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        const user = await authenticateConnection(token);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        return res.json({
            success: true,
            username: user.username,
            rating: user.rating,
        });
    } catch (error) {
        console.error('GET /api/me error:', error);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
});

let waitingPlayer = null;
let rooms = {}; // { roomId: { players: [player1, player2], userIds: [userId1, userId2] } }

let rankingsCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 60 * 1000; // rankings cache TTL 1 minute

function maskMongoUri(uri) {
    if (!uri) {
        return '(MONGODB_URI is not set)';
    }
    return uri.replace(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/, 'mongodb$1://***:***@');
}

const ROWS = 6;
const COLS = 7;

function createEmptyBoard() {
    return [...Array(ROWS)].map(() => Array(COLS).fill(null));
}

function getPlayerColorByIndex(index) {
    return index === 0 ? 'red' : 'yellow';
}

function getRoomPlayerIndex(room, player) {
    return room.players.findIndex((p) => p === player);
}

function isSameUserPair(userId1, userId2) {
    if (!userId1 || !userId2) {
        return false;
    }
    return String(userId1) === String(userId2);
}

function dropPieceToBoard(board, col, color) {
    if (!Number.isInteger(col) || col < 0 || col >= COLS) {
        return -1;
    }

    for (let row = ROWS - 1; row >= 0; row--) {
        if (board[row][col] === null) {
            board[row][col] = color;
            return row;
        }
    }
    return -1;
}

function isBoardFull(board) {
    for (let col = 0; col < COLS; col++) {
        if (board[0][col] === null) {
            return false;
        }
    }
    return true;
}

function checkWinnerOnBoard(board, row, col, color) {
    const directions = [
        [0, 1],   // horizontal
        [1, 0],   // vertical
        [1, 1],   // diagonal \
        [1, -1],  // diagonal /
    ];

    for (const [dr, dc] of directions) {
        let count = 1;

        for (let step = 1; step < 4; step++) {
            const r = row + dr * step;
            const c = col + dc * step;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== color) {
                break;
            }
            count++;
        }

        for (let step = 1; step < 4; step++) {
            const r = row - dr * step;
            const c = col - dc * step;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== color) {
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

/** 1-based global rank (all users). Ties: higher rating first; same rating uses username ascending for stability. */
async function leaderboardRank(rating, username) {
    const user = String(username ?? '');
    const count = await User.countDocuments({
        $or: [
            { rating: { $gt: rating } },
            { rating: rating, username: { $lt: user } },
        ],
    });
    return count + 1;
}

async function finalizeRoomResult(roomId, result) {
    const room = rooms[roomId];
    if (!room || room.isProcessed) {
        return;
    }

    room.isProcessed = true;
    room.pendingResult = result;

    if (room.userIds.includes('computer')) {
        const humanPlayerId = room.userIds.find(id => id !== 'computer');
        const humanPlayer = await User.findById(humanPlayerId);

        if (humanPlayer) {
            const computerRating = 1200;
            const oldRating = humanPlayer.rating;
            const humanOldRank = await leaderboardRank(oldRating, humanPlayer.username);
            const humanOutcome = result.isDraw
                ? 'draw'
                : (result.winner === 'red' ? 'win' : 'loss');

            const ratings = calculateNewRatings(oldRating, computerRating, humanOutcome, true);
            const ratingMultiplier = 1.5;
            const ratingChange = (ratings.player1NewRating - oldRating) * ratingMultiplier;

            let finalRatingChange = ratingChange;
            if (humanOutcome === 'win') {
                finalRatingChange = Math.max(ratingChange, 15);
            } else if (humanOutcome === 'loss') {
                finalRatingChange = Math.min(ratingChange, -25);
            }

            humanPlayer.rating = Math.round(oldRating + finalRatingChange);
            await humanPlayer.save();
            clearRankingsCache();

            const humanNewRank = await leaderboardRank(humanPlayer.rating, humanPlayer.username);

            const humanSocket = room.players.find((player) => !player.isComputer);
            if (humanSocket && humanSocket.readyState === 1) {
                humanSocket.rating = humanPlayer.rating;
                humanSocket.send(JSON.stringify({
                    type: 'gameResult',
                    result: humanOutcome,
                    isFirstPlayer: true,
                    oldRating: oldRating,
                    newRating: humanPlayer.rating,
                    opponentOldRating: computerRating,
                    opponentNewRating: computerRating,
                    oldRank: humanOldRank,
                    newRank: humanNewRank,
                    opponentOldRank: null,
                    opponentNewRank: null,
                    myUsername: humanPlayer.username,
                    opponentUsername: 'Computer'
                }));
            }
        }
    } else {
        if (isSameUserPair(room.userIds[0], room.userIds[1])) {
            const sharedUser = await User.findById(room.userIds[0]);
            if (sharedUser) {
                const sharedRank = await leaderboardRank(sharedUser.rating, sharedUser.username);
                room.players.forEach((player, index) => {
                    if (player.isComputer || player.readyState !== 1) {
                        return;
                    }
                    player.rating = sharedUser.rating;
                    player.send(JSON.stringify({
                        type: 'gameResult',
                        result: 'draw',
                        isFirstPlayer: index === 0,
                        oldRating: sharedUser.rating,
                        newRating: sharedUser.rating,
                        opponentOldRating: sharedUser.rating,
                        opponentNewRating: sharedUser.rating,
                        oldRank: sharedRank,
                        newRank: sharedRank,
                        opponentOldRank: sharedRank,
                        opponentNewRank: sharedRank,
                        myUsername: sharedUser.username,
                        opponentUsername: sharedUser.username
                    }));
                });
            }
            console.warn(`Same-user match detected; skipping rating update: room=${roomId}, user=${room.userIds[0]}`);
            delete rooms[roomId];
            return;
        }

        const player1 = await User.findById(room.userIds[0]);
        const player2 = await User.findById(room.userIds[1]);
        if (player1 && player2) {
            const player1Outcome = result.isDraw
                ? 'draw'
                : (result.winner === 'red' ? 'win' : 'loss');

            const oldRating1 = player1.rating;
            const oldRating2 = player2.rating;
            const oldRank1 = await leaderboardRank(oldRating1, player1.username);
            const oldRank2 = await leaderboardRank(oldRating2, player2.username);
            const ratings = calculateNewRatings(oldRating1, oldRating2, player1Outcome);

            player1.rating = ratings.player1NewRating;
            player2.rating = ratings.player2NewRating;
            await player1.save();
            await player2.save();
            clearRankingsCache();

            const newRank1 = await leaderboardRank(player1.rating, player1.username);
            const newRank2 = await leaderboardRank(player2.rating, player2.username);

            if (room.players[0] && !room.players[0].isComputer) {
                room.players[0].rating = player1.rating;
            }
            if (room.players[1] && !room.players[1].isComputer) {
                room.players[1].rating = player2.rating;
            }

            room.players.forEach((player, index) => {
                if (player.isComputer || player.readyState !== 1) {
                    return;
                }

                const isFirstPlayer = index === 0;
                const oldRating = isFirstPlayer ? oldRating1 : oldRating2;
                const newRating = isFirstPlayer ? ratings.player1NewRating : ratings.player2NewRating;
                const opponentOldRating = isFirstPlayer ? oldRating2 : oldRating1;
                const opponentNewRating = isFirstPlayer ? ratings.player2NewRating : ratings.player1NewRating;
                const oldRank = isFirstPlayer ? oldRank1 : oldRank2;
                const newRank = isFirstPlayer ? newRank1 : newRank2;
                const opponentOldRank = isFirstPlayer ? oldRank2 : oldRank1;
                const opponentNewRank = isFirstPlayer ? newRank2 : newRank1;

                let playerResult;
                if (result.isDraw) {
                    playerResult = 'draw';
                } else {
                    const isWinner = (result.winner === 'red' && index === 0) ||
                        (result.winner === 'yellow' && index === 1);
                    playerResult = isWinner ? 'win' : 'loss';
                }

                player.send(JSON.stringify({
                    type: 'gameResult',
                    result: playerResult,
                    isFirstPlayer: isFirstPlayer,
                    oldRating: oldRating,
                    newRating: newRating,
                    opponentOldRating: opponentOldRating,
                    opponentNewRating: opponentNewRating,
                    oldRank,
                    newRank,
                    opponentOldRank,
                    opponentNewRank,
                    myUsername: isFirstPlayer ? player1.username : player2.username,
                    opponentUsername: isFirstPlayer ? player2.username : player1.username
                }));
            });
        }
    }

    delete rooms[roomId];
}

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'That username is already taken' });
        }

        const user = new User({ username, password });
        await user.save();

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Login attempt:', { username });
        
        if (!username || !password) {
            console.log('Missing username or password');
            return res.status(400).json({ error: 'Enter both username and password' });
        }

        if (mongoose.connection.readyState !== 1) {
            console.error('MongoDB not connected');
            return res.status(500).json({ error: 'Database connection error' });
        }
        
        const user = await User.findOne({ username }).catch(err => {
            console.error('User lookup error:', err);
            return null;
        });

        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        let isValidPassword;
        try {
            isValidPassword = await user.comparePassword(password);
            console.log('Password check:', isValidPassword);
        } catch (err) {
            console.error('Password verification error:', err);
            return res.status(500).json({ error: 'Error verifying password' });
        }
        
        if (!isValidPassword) {
            console.log('Password mismatch:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        console.log('Login success:', username);
        res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/api/rankings', async (req, res) => {
    try {
        const queryStartTime = Date.now();
        console.log('Rankings request received');

        if (mongoose.connection.readyState !== 1) {
            console.error('MongoDB not connected');
            return res.status(503).json({ 
                error: 'Database connection error',
                message: 'Service temporarily unavailable. Please try again shortly.'
            });
        }

        const now = Date.now();
        if (rankingsCache && (now - lastCacheTime) < CACHE_DURATION) {
            const responseTime = Date.now() - queryStartTime;
            console.log(`Rankings cache hit (${responseTime}ms)`);
            return res.json({
                success: true,
                data: rankingsCache,
                fromCache: true
            });
        }

        console.log('Loading rankings from database...');
        const rankings = await User.find()
            .select('username rating -_id')
            .sort({ rating: -1, username: 1 })
            .limit(100)
            .lean()
            .exec();

        if (!rankings || rankings.length === 0) {
            console.log('Rankings empty');
            return res.json({
                success: true,
                data: [],
                message: 'No rankings yet'
            });
        }

        rankingsCache = rankings;
        lastCacheTime = now;

        const queryEndTime = Date.now() - queryStartTime;
        console.log(`Rankings query done (${queryEndTime}ms)`);
        console.log(`Rows: ${rankings.length}`);

        res.json({
            success: true,
            data: rankings,
            fromCache: false,
            count: rankings.length
        });

    } catch (error) {
        console.error('Rankings error:', error);
        res.status(500).json({ 
            error: 'Failed to load rankings',
            message: 'Server error. Please try again shortly.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/api/user-count', async (req, res) => {
    try {
        const count = await User.countDocuments();
        res.json({ count });
    } catch (error) {
        console.error('User count error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/html/index.html'));
});

app.get('/index.html', (req, res) => {
    res.redirect(301, '/');
});

app.use(express.static(path.join(__dirname, '/public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true,
    setHeaders: (res, pathForFile) => {
        if (pathForFile.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

setInterval(() => {
    const now = Date.now();
    for (const [token, data] of authCache.entries()) {
        if (now - data.timestamp > AUTH_CACHE_DURATION) {
            authCache.delete(token);
        }
    }
}, 60 * 60 * 1000); // prune auth cache hourly

let lastPingTime = new Map();
wss.on('connection', async (ws, req) => {
    const connectionStartTime = Date.now();
    console.log(`New connection: ${connectionStartTime}`);

    const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            const start = Date.now();
            lastPingTime.set(ws, start);
            ws.ping();
        }
    }, 30000); // ping every 30s

    ws.on('pong', () => {
        const latency = Date.now() - lastPingTime.get(ws);
        if (latency > 1000) {
            console.log(`High latency: ${latency}ms`);
        }
    });

    ws.on('close', () => {
        clearInterval(pingInterval);
        lastPingTime.delete(ws);
        if (waitingPlayer === ws) {
            console.log("Waiting player disconnected; clearing queue");
            waitingPlayer = null;
        }

        for (const roomId in rooms) {
            const room = rooms[roomId];
            const wasInRoom = room.players.includes(ws);
            room.players = room.players.filter(player => player !== ws);
            if (room.players.length === 0) {
                delete rooms[roomId];
            }
        }
    });

    // Prefer token via Sec-WebSocket-Protocol; fall back to ?token= for legacy clients
    const protocolHeader = req.headers['sec-websocket-protocol'];
    let token = null;
    if (protocolHeader) {
        const protocols = protocolHeader
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        if (protocols.length >= 2 && protocols[0] === 'auth') {
            token = protocols[1];
        }
    }
    if (!token) {
        token = new URL(req.url, 'http://localhost').searchParams.get('token');
    }
    const user = await authenticateConnection(token);
    
    if (!user) {
        console.log("Authentication failed");
        ws.close();
        return;
    }
    
    ws.userId = user._id;
    ws.rating = user.rating;
    ws.username = user.username;

    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "findMatch") {
                if (waitingPlayer === null) {
                    waitingPlayer = ws;
                    
                    const startTime = Date.now();
                    const totalWaitTime = 30000; // 30s until bot match
                    
                    const countdownInterval = setInterval(() => {
                        if (waitingPlayer === ws) {
                            const elapsedTime = Date.now() - startTime;
                            const remainingTime = Math.max(0, Math.ceil((totalWaitTime - elapsedTime) / 1000));
                            
                            ws.send(JSON.stringify({
                                type: 'matchingCountdown',
                                remainingSeconds: remainingTime
                            }));
                        } else {
                            clearInterval(countdownInterval);
                        }
                    }, 1000);
                    
                    // After 30s, match vs computer if still waiting
                    setTimeout(() => {
                        clearInterval(countdownInterval);
                        
                        if (waitingPlayer === ws) {
                            const computerPlayer = new ComputerPlayer();
                            
                            const roomId = Math.random().toString(36).substr(2, 6);
                            rooms[roomId] = {
                                players: [ws, computerPlayer],
                                userIds: [ws.userId, 'computer'],
                                isProcessed: false,
                                board: createEmptyBoard(),
                                currentTurn: 'red',
                                pendingResult: null
                            };
                            
                            waitingPlayer = null;
                            
                            ws.send(JSON.stringify({
                                type: "gameStart",
                                roomId,
                                playerNumber: 1,
                                isFirstMove: true,
                                rating: ws.rating,
                                opponentRating: computerPlayer.rating,
                                myUsername: ws.username,
                                opponentUsername: computerPlayer.username,
                                isComputerOpponent: true
                            }));
                            
                        }
                    }, 30000);
                } else if (waitingPlayer !== ws) {
                    if (isSameUserPair(waitingPlayer.userId, ws.userId)) {
                        ws.send(JSON.stringify({
                            type: 'matchError',
                            message: 'You cannot play online against yourself. Use another account.'
                        }));
                        return;
                    }

                    const player1 = waitingPlayer;
                    const player2 = ws;
                    
                    waitingPlayer = null;

                    const roomId = Math.random().toString(36).substr(2, 6);
                    rooms[roomId] = {
                        players: [player1, player2],
                        userIds: [player1.userId, player2.userId],
                        isProcessed: false,
                        board: createEmptyBoard(),
                        currentTurn: 'red',
                        pendingResult: null
                    };

                    const [firstPlayer, secondPlayer] = [player1, player2];

                    try {
                        firstPlayer.send(JSON.stringify({ 
                            type: "gameStart", 
                            roomId, 
                            playerNumber: 1,
                            isFirstMove: true,
                            rating: firstPlayer.rating,
                            opponentRating: secondPlayer.rating,
                            myUsername: firstPlayer.username,
                            opponentUsername: secondPlayer.username
                        }));

                        secondPlayer.send(JSON.stringify({ 
                            type: "gameStart", 
                            roomId, 
                            playerNumber: 2,
                            isFirstMove: false,
                            rating: secondPlayer.rating,
                            opponentRating: firstPlayer.rating,
                            myUsername: secondPlayer.username,
                            opponentUsername: firstPlayer.username
                        }));
                    } catch (error) {
                        delete rooms[roomId];
                        waitingPlayer = null;
                    }
                }
            }

            if (data.type === 'gameEnd') {
                const room = rooms[data.roomId];
                if (!room || room.isProcessed) {
                    return;
                }

                const senderIndex = getRoomPlayerIndex(room, ws);
                if (senderIndex === -1) {
                    console.warn(`Rejected invalid gameEnd: user=${ws.userId}, room=${data.roomId}`);
                    return;
                }

                if (!room.pendingResult) {
                    console.warn(`Rejected gameEnd before server finalized result: room=${data.roomId}`);
                    return;
                }

                await finalizeRoomResult(data.roomId, room.pendingResult);
                return;
            }

            if (data.type === 'move') {
                const roomId = data.roomId;
                const room = rooms[roomId];
                if (!room || room.isProcessed) {
                    return;
                }

                const senderIndex = getRoomPlayerIndex(room, ws);
                if (senderIndex === -1) {
                    console.warn(`Rejected invalid move: user=${ws.userId}, room=${roomId}`);
                    return;
                }

                const senderColor = getPlayerColorByIndex(senderIndex);
                if (room.currentTurn !== senderColor) {
                    console.warn(`Rejected move (wrong turn): user=${ws.userId}, room=${roomId}, turn=${room.currentTurn}, sender=${senderColor}`);
                    return;
                }

                const col = Number.parseInt(data?.move?.col, 10);
                const row = dropPieceToBoard(room.board, col, senderColor);
                if (row === -1) {
                    console.warn(`Rejected invalid column: user=${ws.userId}, room=${roomId}, col=${data?.move?.col}`);
                    return;
                }

                room.players.forEach((client) => {
                    if (client !== ws && !client.isComputer && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'move',
                            move: { col },
                            roomId: roomId
                        }));
                    }
                });

                let outcome = null;
                if (checkWinnerOnBoard(room.board, row, col, senderColor)) {
                    outcome = { winner: senderColor, isDraw: false };
                } else if (isBoardFull(room.board)) {
                    outcome = { winner: null, isDraw: true };
                }

                if (outcome) {
                    room.pendingResult = outcome;
                    await finalizeRoomResult(roomId, outcome);
                    return;
                }

                room.currentTurn = senderColor === 'red' ? 'yellow' : 'red';

                const computerPlayer = room.players[1];
                if (computerPlayer && computerPlayer.isComputer && room.currentTurn === 'yellow') {
                    setTimeout(async () => {
                        const activeRoom = rooms[roomId];
                        if (!activeRoom || activeRoom.isProcessed) {
                            return;
                        }

                        const computerCol = computerPlayer.calculateMove(activeRoom.board);
                        const computerRow = dropPieceToBoard(activeRoom.board, computerCol, 'yellow');
                        if (computerRow === -1) {
                            return;
                        }

                        activeRoom.players.forEach((client) => {
                            if (!client.isComputer && client.readyState === 1) {
                                client.send(JSON.stringify({
                                    type: 'move',
                                    move: { col: computerCol },
                                    roomId: roomId
                                }));
                            }
                        });

                        let computerOutcome = null;
                        if (checkWinnerOnBoard(activeRoom.board, computerRow, computerCol, 'yellow')) {
                            computerOutcome = { winner: 'yellow', isDraw: false };
                        } else if (isBoardFull(activeRoom.board)) {
                            computerOutcome = { winner: null, isDraw: true };
                        }

                        if (computerOutcome) {
                            activeRoom.pendingResult = computerOutcome;
                            await finalizeRoomResult(roomId, computerOutcome);
                            return;
                        }

                        activeRoom.currentTurn = 'red';
                    }, 1000);
                }
            }
        } catch (error) {
            console.error("Message handler error:", error.message);
        }
    });
});

function clearRankingsCache() {
    rankingsCache = null;
    lastCacheTime = 0;
}

app.get('/ping', (req, res) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now()
    };
    try {
        res.status(200).json(healthcheck);
    } catch (error) {
        healthcheck.message = error;
        res.status(503).json(healthcheck);
    }
});

const serverStartTime = Date.now();

const MONITOR_INTERVAL = 14 * 60 * 1000; // log stats every 14 minutes

setInterval(() => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    console.log('=== Server status ===');
    console.log(`Uptime: ${Math.floor(uptime / 60)} min`);
    console.log(`Heap: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`);
    console.log('==================');
}, MONITOR_INTERVAL);

console.log('=== Server startup ===');
console.log(`Started at: ${new Date(serverStartTime).toISOString()}`);
console.log('========================');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('REST: GET /api/me is mounted before express.static');
});