const mongoose = require('mongoose');

// ===== User Schema =====
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    subjects: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now }
});

// ===== Session Schema =====
const sessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    duration: { type: Number, required: true }, // seconds
    startTime: { type: Date },
    endTime: { type: Date },
    manual: { type: Boolean, default: false },
    bulk: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Indexes for efficient queries
sessionSchema.index({ userId: 1, date: -1 });
sessionSchema.index({ userId: 1, subject: 1 });

const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);

// ===== Connect to MongoDB =====
async function connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set in environment variables!');
        process.exit(1);
    }
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB Atlas');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
}

module.exports = { User, Session, connectDB };
