const bcrypt = require('bcrypt');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

/* ===========================
   📦 DB CONNECTION
=========================== */
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/taskdb';

mongoose.connect(MONGO_URL)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

/* ===========================
   📦 SCHEMAS
=========================== */

// USER
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String
});
const User = mongoose.model('User', userSchema);

// TASK
const taskSchema = new mongoose.Schema({
    task: String,
    time: String,
    reminder: Boolean,
    completed: { type: Boolean, default: false },
    userId: String
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);

/* ===========================
   🏠 HEALTH
=========================== */
app.get('/', (req, res) => {
    res.send('Backend running 🚀');
});

/* ===========================
   🔐 SIGNUP
=========================== */
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ message: "User exists" });

        const hashed = await bcrypt.hash(password, 10);

        const user = new User({ name, email, password: hashed });
        await user.save();

        res.json({ message: "Signup successful" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================
   🔑 LOGIN
=========================== */
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "User not found" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: "Wrong password" });

        // ✅ IMPORTANT: send userId
        res.json({
            message: "Login successful",
            userId: user._id
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================
   ➕ ADD TASK
=========================== */
app.post('/tasks', async (req, res) => {
    try {
        const { task, time, reminder, userId } = req.body;

        if (!task || !time || !userId) {
            return res.status(400).json({ error: "All fields required" });
        }

        const newTask = new Task({
            task,
            time,
            reminder,
            userId
        });

        await newTask.save();
        res.json(newTask);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================
   📥 GET USER TASKS (FIXED)
=========================== */
app.get('/tasks/:userId', async (req, res) => {
    try {
        const tasks = await Task.find({ userId: req.params.userId })
            .sort({ createdAt: -1 });

        res.json(tasks);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================
   🔁 UPDATE TASK
=========================== */
app.put('/tasks/:id', async (req, res) => {
    try {
        const updated = await Task.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updated);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================
   ❌ DELETE TASK
=========================== */
app.delete('/tasks/:id', async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================
   🚀 SERVER
=========================== */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} 🚀`);
});