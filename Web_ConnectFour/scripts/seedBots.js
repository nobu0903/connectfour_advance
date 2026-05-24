/**
 * Seed ~100 English-named bot users for leaderboard display.
 *
 *   cd Web_ConnectFour && node scripts/seedBots.js
 *
 * Requires MONGODB_URI in `.env`.
 * Skips usernames that already exist.
 *
 * Optional env vars:
 *   SEED_BOT_COUNT   default 100 (max 500)
 *   SEED_RATING_MIN  default 1280
 *   SEED_RATING_MAX  default 2180
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const BOT_COUNT = Math.min(parseInt(process.env.SEED_BOT_COUNT || '100', 10), 500);
const RATING_MIN = parseInt(process.env.SEED_RATING_MIN || '1280', 10);
const RATING_MAX = parseInt(process.env.SEED_RATING_MAX || '2180', 10);
const SHARED_PASSWORD = process.env.SEED_BOT_PASSWORD || 'BotPlayer_SeedOnly_9x';

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Spread ratings evenly (bin centers + jitter), then shuffle */
function scatterRatings(count, min, max) {
    const span = max - min;
    const base = [];
    for (let i = 0; i < count; i++) {
        const binCenter = min + ((i + 0.5) / count) * span;
        const jitterMax = (span / count) * 1.8;
        const jitter = (Math.random() - 0.5) * jitterMax;
        let r = Math.round(binCenter + jitter);
        r = Math.max(min, Math.min(max, r));
        base.push(r);
    }
    return shuffle(base);
}

const FIRST_NAMES = [
    'James', 'Emma', 'Oliver', 'Sophia', 'William', 'Mia', 'Henry', 'Charlotte',
    'Alexander', 'Amelia', 'Daniel', 'Harper', 'Matthew', 'Evelyn', 'Joseph', 'Abigail',
    'David', 'Elizabeth', 'Andrew', 'Sofia', 'Ryan', 'Ella', 'Nathan', 'Grace',
    'Samuel', 'Victoria', 'Christian', 'Scarlett', 'Jonathan', 'Aria', 'Jack', 'Chloe',
    'Aaron', 'Penelope', 'Connor', 'Layla', 'Caleb', 'Riley', 'Isaac', 'Zoey',
    'Luke', 'Nora', 'Tyler', 'Lily', 'Brandon', 'Hannah', 'Jordan', 'Lillian',
    'Robert', 'Addison', 'Charles', 'Eleanor', 'Thomas', 'Natalie', 'Christopher', 'Stella',
];

const LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson',
    'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker',
    'Hall', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams',
    'Nelson', 'Carter', 'Mitchell', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker',
    'Evans', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Rogers', 'Cook',
];

function pickName(index) {
    const fn = FIRST_NAMES[index % FIRST_NAMES.length];
    const ln = LAST_NAMES[(Math.floor(index / FIRST_NAMES.length) + index * 13) % LAST_NAMES.length];
    return { fn, ln };
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is missing from `.env`.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const ratings = scatterRatings(BOT_COUNT, RATING_MIN, RATING_MAX);
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < BOT_COUNT; i++) {
        const { fn, ln } = pickName(i);
        const username = `${fn}_${ln}_${String(i).padStart(3, '0')}`;

        const exists = await User.exists({ username });
        if (exists) {
            skipped++;
            continue;
        }

        await User.create({
            username,
            password: SHARED_PASSWORD,
            rating: ratings[i],
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 90)),
        });
        inserted++;
    }

    console.log(`Done: inserted ${inserted}, skipped (duplicate) ${skipped}, target ${BOT_COUNT}`);
    console.log(`Rating range: ${RATING_MIN}–${RATING_MAX} (even bins + jitter, shuffled)`);
    await mongoose.connection.close();
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
