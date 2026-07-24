require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const morgan = require('morgan');
const path = require('path');
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

// Enable HTTP request logging using Morgan
app.use(morgan('combined'));

// Enable CORS for all origins and JSON body parser
app.use(cors());
app.use(express.json());

/* ===========================
   📦 DATABASE ABSTRACTION (PostgreSQL with SQLite Fallback)
=========================== */
let dbMode = 'none'; // 'postgresql' or 'sqlite'
let pgPool = null;
let sqliteDb = null;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 }
  : {
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
      database: process.env.POSTGRES_DB || 'taskdb',
      connectionTimeoutMillis: 3000
    };

// Format SQL queries depending on active database engine
function formatSql(sql, mode) {
  if (mode === 'sqlite') {
    // Replace $1, $2, $3 with ? for SQLite
    return sql.replace(/\$\d+/g, '?');
  }
  return sql;
}

// Unified Query Execution Helper
async function queryAll(sql, params = []) {
  if (dbMode === 'postgresql') {
    const res = await pgPool.query(sql, params);
    return res.rows;
  } else if (dbMode === 'sqlite') {
    const formatted = formatSql(sql, 'sqlite');
    return new Promise((resolve, reject) => {
      sqliteDb.all(formatted, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  } else {
    throw new Error('Database not initialized');
  }
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function executeInsert(sql, params = [], tableName = '') {
  if (dbMode === 'postgresql') {
    const returningSql = sql.includes('RETURNING') ? sql : `${sql} RETURNING *`;
    const res = await pgPool.query(returningSql, params);
    return res.rows[0];
  } else if (dbMode === 'sqlite') {
    const formatted = formatSql(sql, 'sqlite');
    return new Promise((resolve, reject) => {
      sqliteDb.run(formatted, params, function (err) {
        if (err) return reject(err);
        const lastId = this.lastID;
        sqliteDb.get(`SELECT * FROM ${tableName} WHERE id = ?`, [lastId], (err2, row) => {
          if (err2) reject(err2);
          else resolve(row);
        });
      });
    });
  } else {
    throw new Error('Database not initialized');
  }
}

async function executeUpdateOrDelete(sql, params = []) {
  if (dbMode === 'postgresql') {
    const res = await pgPool.query(sql, params);
    return res;
  } else if (dbMode === 'sqlite') {
    const formatted = formatSql(sql, 'sqlite');
    return new Promise((resolve, reject) => {
      sqliteDb.run(formatted, params, function (err) {
        if (err) reject(err);
        else resolve({ rowCount: this.changes });
      });
    });
  } else {
    throw new Error('Database not initialized');
  }
}

// Initialize Database Tables
async function initTables() {
  const usersSql = dbMode === 'postgresql' ? `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  ` : `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const tasksSql = dbMode === 'postgresql' ? `
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      task TEXT NOT NULL,
      time VARCHAR(255) NOT NULL,
      reminder BOOLEAN DEFAULT FALSE,
      completed BOOLEAN DEFAULT FALSE,
      user_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  ` : `
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      time TEXT NOT NULL,
      reminder INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  if (dbMode === 'postgresql') {
    await pgPool.query(usersSql);
    await pgPool.query(tasksSql);
  } else {
    await new Promise((res, rej) => sqliteDb.run(usersSql, (err) => err ? rej(err) : res()));
    await new Promise((res, rej) => sqliteDb.run(tasksSql, (err) => err ? rej(err) : res()));
  }
  logger.info(`✅ Database Tables Initialized Successfully (${dbMode.toUpperCase()})`);
}

// Database Initialization Strategy
async function setupDatabase() {
  // Try connecting to PostgreSQL first
  try {
    const testPool = new Pool(poolConfig);
    const client = await testPool.connect();
    client.release();
    pgPool = testPool;
    dbMode = 'postgresql';
    logger.info('✅ PostgreSQL Connected Successfully');
    await initTables();
    return;
  } catch (err) {
    logger.warn(`⚠️ PostgreSQL connection unavailable (${err.message}). Falling back to local SQLite database.`);
  }

  // Fallback to SQLite
  try {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, 'taskmanager.sqlite');
    sqliteDb = new sqlite3.Database(dbPath);
    dbMode = 'sqlite';
    logger.info(`✅ Local SQLite Database Connected (${dbPath})`);
    await initTables();
  } catch (err) {
    logger.error('❌ Failed to initialize fallback SQLite database engine', err);
  }
}

// Run DB setup on server start
setupDatabase();

/* ===========================
   🏠 API HEALTH ENDPOINT & BASE ROUTE
=========================== */
app.get('/', (req, res) => {
  res.send('🚀 Task Manager API is Running');
});

// Explicit Health Check Endpoint
app.get('/health', async (req, res) => {
  let isDbHealthy = false;
  let dbError = null;

  try {
    if (dbMode === 'postgresql') {
      await pgPool.query('SELECT 1');
      isDbHealthy = true;
    } else if (dbMode === 'sqlite') {
      await queryOne('SELECT 1');
      isDbHealthy = true;
    }
  } catch (err) {
    dbError = err.message;
    logger.error('Health check database query failed', err);
  }

  const statusCode = isDbHealthy ? 200 : 500;

  res.status(statusCode).json({
    status: isDbHealthy ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      mode: dbMode,
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

    const existingUser = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser) {
      return res.status(400).json({ message: "User already exists", error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const userRole = role || 'user';

    await executeInsert(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      [name, email, hashed, userRole],
      'users'
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

    const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(400).json({ message: "User not found", error: "User not found" });
    }

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
    const adminUser = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.userId]);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ message: "Access denied", error: "Access denied" });
    }

    const users = await queryAll('SELECT id, name, email, role FROM users');
    res.json(users);
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

    const inserted = await executeInsert(
      'INSERT INTO tasks (task, time, reminder, completed, user_id) VALUES ($1, $2, $3, $4, $5)',
      [task, time, reminder ? 1 : 0, 0, userId.toString()],
      'tasks'
    );

    const responseTask = {
      id: inserted.id,
      _id: inserted.id.toString(),
      task: inserted.task,
      time: inserted.time,
      reminder: Boolean(inserted.reminder),
      completed: Boolean(inserted.completed),
      userId: inserted.user_id,
      createdAt: inserted.created_at
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
    const rows = await queryAll(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId.toString()]
    );

    const tasks = rows.map(t => ({
      id: t.id,
      _id: t.id.toString(),
      task: t.task,
      time: t.time,
      reminder: Boolean(t.reminder),
      completed: Boolean(t.completed),
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

    const current = await queryOne('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!current) {
      return res.status(404).json({ message: "Task not found", error: "Task not found" });
    }

    const updatedTask = task !== undefined ? task : current.task;
    const updatedTime = time !== undefined ? time : current.time;
    const updatedReminder = reminder !== undefined ? (reminder ? 1 : 0) : current.reminder;
    const updatedCompleted = completed !== undefined ? (completed ? 1 : 0) : current.completed;

    await executeUpdateOrDelete(
      'UPDATE tasks SET task = $1, time = $2, reminder = $3, completed = $4 WHERE id = $5',
      [updatedTask, updatedTime, updatedReminder, updatedCompleted, taskId]
    );

    const updated = await queryOne('SELECT * FROM tasks WHERE id = $1', [taskId]);

    const responseTask = {
      id: updated.id,
      _id: updated.id.toString(),
      task: updated.task,
      time: updated.time,
      reminder: Boolean(updated.reminder),
      completed: Boolean(updated.completed),
      userId: updated.user_id,
      createdAt: updated.created_at
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
    await executeUpdateOrDelete('DELETE FROM tasks WHERE id = $1', [taskId]);
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