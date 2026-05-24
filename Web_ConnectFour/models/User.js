import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    password: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        default: 1500,  // starting Elo
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Index for leaderboard queries
userSchema.index({ rating: -1 });

// Optional query timing (dev insight)
userSchema.pre('find', function() {
    this._startTime = Date.now();
});

userSchema.post('find', function() {
    if (this._startTime) {
        console.log(`Query duration: ${Date.now() - this._startTime}ms`);
    }
});

// Hash password before save
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Verify password helper
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User; 