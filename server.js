/**
 * Main server file for the collaboration board application
 * @module server
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const db = require('./database');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});
app.use('/api/', limiter);

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-in-production';

// Store active users per board
const boardUsers = new Map();

/**
 * Middleware to verify JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// API Routes
/**
 * User registration endpoint
 * @route POST /api/register
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User email
 * @param {string} req.body.password - User password
 * @param {string} req.body.name - User name
 */
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await db.createUser(email, hashedPassword, name);
    const token = jwt.sign({ userId: result.userId, email }, JWT_SECRET);
    
    res.json({ token, user: { userId: result.userId, email, name } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * User login endpoint
 * @route POST /api/login
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User email
 * @param {string} req.body.password - User password
 */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const user = await db.getUserByEmail(email);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email }, JWT_SECRET);
    
    res.json({ token, user: { userId: user.id, email, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Create new board endpoint
 * @route POST /api/boards
 */
app.post('/api/boards', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Board name is required' });
    }

    const boardId = await db.createBoard(name, req.user.userId);
    res.json({ boardId, name });
  } catch (error) {
    console.error('Create board error:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

/**
 * Get user's boards endpoint
 * @route GET /api/boards
 */
app.get('/api/boards', authMiddleware, async (req, res) => {
  try {
    const boards = await db.getUserBoards(req.user.userId);
    res.json(boards);
  } catch (error) {
    console.error('Get boards error:', error);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

/**
 * Get board details endpoint
 * @route GET /api/boards/:boardId
 */
app.get('/api/boards/:boardId', authMiddleware, async (req, res) => {
  try {
    const { boardId } = req.params;
    const board = await db.getBoard(boardId);
    
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const elements = await db.getBoardElements(boardId);
    res.json({ ...board, elements });
  } catch (error) {
    console.error('Get board error:', error);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// Socket.IO event handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  /**
   * Handle board join event
   * @param {Object} data - Join data
   * @param {string} data.boardId - Board ID
   * @param {Object} data.user - User information
   */
  socket.on('join-board', async (data) => {
    try {
      const { boardId, user } = data;
      
      if (!boardId || !user) {
        throw new Error('Missing required data');
      }

      socket.join(boardId);
      
      // Store user for this board
      if (!boardUsers.has(boardId)) {
        boardUsers.set(boardId, new Map());
      }
      boardUsers.get(boardId).set(socket.id, {
        userId: user.userId,
        name: user.name,
        color: getRandomColor()
      });

      // Notify others about new user
      socket.to(boardId).emit('user-joined', {
        socketId: socket.id,
        user: {
          userId: user.userId,
          name: user.name,
          color: boardUsers.get(boardId).get(socket.id).color
        }
      });

      // Send current users to new joiner
      const currentUsers = Array.from(boardUsers.get(boardId).entries()).map(([id, userData]) => ({
        socketId: id,
        user: userData
      }));
      socket.emit('current-users', currentUsers);

      // Load board elements
      const elements = await db.getBoardElements(boardId);
      socket.emit('load-elements', elements);
    } catch (error) {
      console.error('Join board error:', error);
      socket.emit('error', { message: 'Failed to join board' });
    }
  });

  /**
   * Handle element creation event
   * @param {Object} data - Element data
   */
  socket.on('create-element', async (data) => {
    try {
      const { boardId, element } = data;
      
      if (!boardId || !element) {
        throw new Error('Missing required data');
      }

      const elementId = uuidv4();
      const elementWithId = { ...element, id: elementId };
      
      await db.createElement(boardId, elementWithId);
      
      // Broadcast element creation to all users on the board
      io.to(boardId).emit('element-created', elementWithId);
    } catch (error) {
      console.error('Create element error:', error);
      socket.emit('error', { message: 'Failed to create element' });
    }
  });

  /**
   * Handle element update event
   * @param {Object} data - Update data
   */
  socket.on('update-element', async (data) => {
    try {
      const { boardId, element } = data;
      
      if (!boardId || !element || !element.id) {
        throw new Error('Missing required data');
      }

      await db.updateElement(element);
      
      // Broadcast element update to all users on the board
      io.to(boardId).emit('element-updated', element);
    } catch (error) {
      console.error('Update element error:', error);
      socket.emit('error', { message: 'Failed to update element' });
    }
  });

  /**
   * Handle element deletion event
   * @param {Object} data - Delete data
   */
  socket.on('delete-element', async (data) => {
    try {
      const { boardId, elementId } = data;
      
      if (!boardId || !elementId) {
        throw new Error('Missing required data');
      }

      await db.deleteElement(elementId);
      
      // Broadcast element deletion to all users on the board
      io.to(boardId).emit('element-deleted', elementId);
    } catch (error) {
      console.error('Delete element error:', error);
      socket.emit('error', { message: 'Failed to delete element' });
    }
  });

  /**
   * Handle cursor move event
   * @param {Object} data - Cursor data
   */
  socket.on('cursor-move', (data) => {
    try {
      const { boardId, position } = data;
      
      if (!boardId || !position) {
        throw new Error('Missing required data');
      }

      // Broadcast cursor position to all other users on the board
      socket.to(boardId).emit('cursor-update', {
        socketId: socket.id,
        position
      });
    } catch (error) {
      console.error('Cursor move error:', error);
    }
  });

  /**
   * Handle disconnect event
   */
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove user from all boards
    for (const [boardId, users] of boardUsers) {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        io.to(boardId).emit('user-left', socket.id);
        
        // Clean up empty boards
        if (users.size === 0) {
          boardUsers.delete(boardId);
        }
      }
    }
  });
});

/**
 * Generate random color for cursor
 * @returns {string} Hex color code
 */
function getRandomColor() {
  const colors = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#34495e', '#e91e63', '#673ab7'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };