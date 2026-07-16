require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

/* ===========================
   📦 DB CONNECTION
=========================== */
const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
  console.error("❌ MONGO_URL is not defined in the .env file");
  process.exit(1);
}

mongoose.connect(MONGO_URL)
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Failed");
    console.error(err);
  });

/* ===========================
   📦 SCHEMAS
=========================== */

// USER Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }
});
const User = mongoose.model('User', userSchema);

// TASK Schema
const taskSchema = new mongoose.Schema({
    task: { type: String, required: true },
    time: { type: String, required: true },
    reminder: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    userId: { type: String, required: true }
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);

/* ===========================
   🏠 HEALTH ROUTE
=========================== */
app.get('/', (req, res) => {
    res.send('🚀 Task Manager API is Running');
});

/* ===========================
   🔐 SIGNUP
=========================== */
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashed = await bcrypt.hash(password, 10);

        const user = new User({ 
            name, 
            email, 
            password: hashed,
            role: role || 'user' 
        });
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

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).json({ message: "Wrong password" });
        }

        res.json({
            message: "Login successful",
            userId: user._id,
            role: user.role || 'user'
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================
   👥 GET ALL USERS FOR ADMIN
=========================== */
app.get('/users-by-admin/:userId', async (req, res) => {
    try {
        const adminUser = await User.findById(req.params.userId);
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({ error: "Access denied" });
        }
        const users = await User.find({}, 'name email role');
        res.json(users);
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
            reminder: !!reminder,
            userId
        });

        await newTask.save();
        res.json(newTask);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================
   📥 GET USER TASKS
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
   🚀 START SERVER
=========================== */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});