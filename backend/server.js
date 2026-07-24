require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const morgan = require('morgan');
const { Pool } = require('pg');

const app = express();

/* ===========================
   📜 LOGGER CONFIGURATION
=========================== */
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
  error: (msg, err) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`, err || ''),
  warn: (msg) => console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`)
};

// HTTP Request Logging Middleware
app.use(morgan('combined'));

// CORS & JSON Body Parser
app.use(cors());
app.use(express.json());

/* ===========================
   📦 POSTGRESQL CONNECTION POOL
=========================== */
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
      database: process.env.POSTGRES_DB || 'taskdb'
    };

const pool = new Pool(poolConfig);

// Initialize Database Tables
async function initTables() {
  const usersSql = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const tasksSql = `
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      task TEXT NOT NULL,
      time VARCHAR(255) NOT NULL,
      reminder BOOLEAN DEFAULT FALSE,
      completed BOOLEAN DEFAULT FALSE,
      user_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(usersSql);
    await pool.query(tasksSql);
    logger.info('✅ PostgreSQL Tables Initialized Successfully');
  } catch (err) {
    logger.error('❌ Failed to initialize PostgreSQL tables', err);
  }
}

// Connect & Verify Database
pool.connect()
  .then(client => {
    logger.info('✅ PostgreSQL Connected Successfully');
    client.release();
    initTables();
  })
  .catch(err => {
    logger.error('❌ PostgreSQL Connection Error', err);
  });

/* ===========================
   🏠 API HEALTH ENDPOINT & BASE ROUTE
=========================== */
app.get('/', (req, res) => {
  res.send('🚀 Task Manager API is Running');
});

// Health Check Endpoint
app.get('/health', async (req, res) => {
  let isDbHealthy = false;
  let dbError = null;

  try {
    await pool.query('SELECT 1');
    isDbHealthy = true;
  } catch (err) {
    dbError = err.message;
    logger.error('Health check query failed', err);
  }

  const statusCode = isDbHealthy ? 200 : 500;

  res.status(statusCode).json({
    status: isDbHealthy ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      type: 'postgresql',
      status: isDbHealthy ? 'connected' : 'error',
      error: dbError
    }
  });
});

/* ===========================
   🔐 SIGNUP
=========================== */
app.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required", error: "All fields are required" });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "User already exists", error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const userRole = role || 'user';

    await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      [name, email, hashed, userRole]
    );

    logger.info(`New user signed up: ${email}`);
    res.json({ message: "Signup successful" });

  } catch (err) {
    logger.error('Signup error', err);
    res.status(500).json({ message: err.message, error: err.message });
  }
});

/* ===========================
   🔑 LOGIN
=========================== */
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required", error: "Email and password are required" });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found", error: "User not found" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Wrong password", error: "Wrong password" });
    }

    logger.info(`User logged in: ${email}`);
    res.json({
      message: "Login successful",
      userId: user.id.toString(),
      role: user.role || 'user'
    });

  } catch (err) {
    logger.error('Login error', err);
    res.status(500).json({ message: err.message, error: err.message });
  }
});

/* ===========================
   👥 GET ALL USERS FOR ADMIN
=========================== */
app.get('/users-by-admin/:userId', async (req, res) => {
  try {
    const adminRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.userId]);
    if (adminRes.rows.length === 0 || adminRes.rows[0].role !== 'admin') {
      return res.status(403).json({ message: "Access denied", error: "Access denied" });
    }

    const usersRes = await pool.query('SELECT id, name, email, role FROM users');
    res.json(usersRes.rows);
  } catch (err) {
    logger.error('Admin users fetch error', err);
    res.status(500).json({ message: err.message, error: err.message });
  }
});

/* ===========================
   ➕ ADD TASK
=========================== */
app.post('/tasks', async (req, res) => {
  try {
    const { task, time, reminder, userId } = req.body;

    if (!task || !time || !userId) {
      return res.status(400).json({ message: "All fields required", error: "All fields required" });
    }

    const result = await pool.query(
      'INSERT INTO tasks (task, time, reminder, completed, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [task, time, !!reminder, false, userId.toString()]
    );

    const t = result.rows[0];
    const responseTask = {
      id: t.id,
      _id: t.id.toString(),
      task: t.task,
      time: t.time,
      reminder: t.reminder,
      completed: t.completed,
      userId: t.user_id,
      createdAt: t.created_at
    };

    logger.info(`Task created for user ${userId}: "${task}"`);
    res.json(responseTask);

  } catch (err) {
    logger.error('Add task error', err);
    res.status(500).json({ message: err.message, error: err.message });
  }
});

/* ===========================
   📥 GET USER TASKS
=========================== */
app.get('/tasks/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId.toString()]
    );

    const tasks = result.rows.map(t => ({
      id: t.id,
      _id: t.id.toString(),
      task: t.task,
      time: t.time,
      reminder: t.reminder,
      completed: t.completed,
      userId: t.user_id,
      createdAt: t.created_at
    }));

    res.json(tasks);

  } catch (err) {
    logger.error('Get tasks error', err);
    res.status(500).json({ message: err.message, error: err.message });
  }
});

/* ===========================
   🔁 UPDATE TASK
=========================== */
app.put('/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const { task, time, reminder, completed } = req.body;

    const existing = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Task not found", error: "Task not found" });
    }

    const current = existing.rows[0];
    const updatedTask = task !== undefined ? task : current.task;
    const updatedTime = time !== undefined ? time : current.time;
    const updatedReminder = reminder !== undefined ? !!reminder : current.reminder;
    const updatedCompleted = completed !== undefined ? !!completed : current.completed;

    const result = await pool.query(
      'UPDATE tasks SET task = $1, time = $2, reminder = $3, completed = $4 WHERE id = $5 RETURNING *',
      [updatedTask, updatedTime, updatedReminder, updatedCompleted, taskId]
    );

    const t = result.rows[0];
    const responseTask = {
      id: t.id,
      _id: t.id.toString(),
      task: t.task,
      time: t.time,
      reminder: t.reminder,
      completed: t.completed,
      userId: t.user_id,
      createdAt: t.created_at
    };

    logger.info(`Task updated: ${taskId}`);
    res.json(responseTask);

  } catch (err) {
    logger.error('Update task error', err);
    res.status(500).json({ message: err.message, error: err.message });
  }
});

/* ===========================
   ❌ DELETE TASK
=========================== */
app.delete('/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    logger.info(`Task deleted: ${taskId}`);
    res.json({ message: "Deleted" });

  } catch (err) {
    logger.error('Delete task error', err);
    res.status(500).json({ message: err.message, error: err.message });
  }
});

/* ===========================
   🚀 START SERVER
=========================== */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});