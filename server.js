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
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sharedsession = require('express-socket.io-session');
const fs = require('fs');
const path = require('path');
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
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "https://cdnjs.cloudflare.com"],
            "connect-src": ["'self'", "wss:", "ws:"],
        },
    },
}));
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

// Create session middleware
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: './' // Store the SQLite database in the current directory
    }),
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
});

// Use session middleware in Express
app.use(sessionMiddleware);

// Share session with Socket.IO
io.use(sharedsession(sessionMiddleware, {
    autoSave: true
}));

/**
 * Middleware to verify JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.session.token;

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // Store token in session if not already stored
        if (!req.session.token) {
            req.session.token = token;
        }

        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Logs directory
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// POST /api/logs endpoint
app.post('/api/logs', (req, res) => {
    const { message, level } = req.body;
    if (!message || !level) {
        return res.status(400).json({ error: 'Message and level are required.' });
    }

    const logEntry = `${new Date().toISOString()} [${level.toUpperCase()}]: ${message}\n`;
    const logFile = path.join(logsDir, 'application.log');

    fs.appendFile(logFile, logEntry, (err) => {
        if (err) {
            console.error('Failed to write log:', err);
            return res.status(500).json({ error: 'Failed to write log.' });
        }
        res.status(201).json({ message: 'Log entry created.' });
    });
});

// API Routes

/**
 * Invite user to board endpoint
 * @route POST /api/boards/:boardId/invite
 */
app.post('/api/boards/:boardId/invite', authMiddleware, async (req, res) => {
    try {
        const { boardId } = req.params;
        const { email, role = 'editor' } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if user has permission to invite others
        const board = await db.getBoard(boardId);
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }

        const inviter = await db.getBoardMember(boardId, req.user.userId);
        if (!inviter || (inviter.role !== 'owner' && inviter.role !== 'admin')) {
            return res.status(403).json({ error: 'Only owners and admins can invite users' });
        }

        // Check if user exists
        const invitee = await db.getUserByEmail(email);
        if (!invitee) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user is already a member
        const existingMember = await db.getBoardMember(boardId, invitee.id);
        if (existingMember) {
            return res.status(400).json({ error: 'User is already a member of this board' });
        }

        // Add user to board
        await db.addBoardMember(boardId, invitee.id, role);

        res.json({ 
            message: 'User invited successfully',
            userId: invitee.id,
            email: invitee.email,
            role: role
        });
    } catch (error) {
        console.error('Invite user error:', error);
        res.status(500).json({ error: 'Failed to invite user' });
    }
});

/**
 * Delete board endpoint
 * @route DELETE /api/boards/:boardId
 */
app.delete('/api/boards/:boardId', authMiddleware, async (req, res) => {
    try {
        const { boardId } = req.params;

        // Check if user has permission to delete the board
        const member = await db.getBoardMember(boardId, req.user.userId);
        if (!member || member.role !== 'owner') {
            return res.status(403).json({ error: 'Only the board owner can delete it' });
        }

        await db.deleteBoard(boardId);
        res.json({ message: 'Board deleted successfully' });
    } catch (error) {
        console.error('Delete board error:', error);
        res.status(500).json({ error: 'Failed to delete board' });
    }
});

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

        // Check if user has access to the board
        const hasAccess = await db.checkBoardAccess(boardId, req.user.userId);
        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this board' });
        }

        const elements = await db.getBoardElements(boardId);
        res.json({ ...board, elements });
    } catch (error) {
        console.error('Get board error:', error);
        res.status(500).json({ error: 'Failed to fetch board' });
    }
});

// Socket.IO event handling
console.log('[SERVER] Socket.IO server initialized');

io.on('connection', (socket) => {
    console.log('=== [SERVER] New client connected ===');
    console.log('Socket ID:', socket.id);
    console.log('Handshake:', socket.handshake.headers);
    console.log('Query params:', socket.handshake.query);
    console.log('=====================');

    const token = socket.handshake.auth?.token || socket.handshake.session?.token;
    if (!token) {
        socket.emit('error', { message: 'Authentication required' });
        socket.disconnect();
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.handshake.user = decoded; // Attach user info to the handshake
    } catch (error) {
        socket.emit('error', { message: 'Invalid authentication token' });
        socket.disconnect();
        return;
    }

    /**
     * Handle board join event
     * @param {Object} data - Join data
     * @param {string} data.boardId - Board ID
     * @param {Object} data.user - User information
     */
    socket.on('join-board', async (data) => {
        console.log('[SERVER] Join board request:', data);
        try {
            const { boardId, user } = data;
            console.log(`[SERVER] Checking access for user ${user.userId} to board ${boardId}`);
            if (!boardId || !user) {
                console.error('[SERVER] Missing required data:', { boardId, user });
                throw new Error('Missing required data');
            }

            const hasAccess = await db.checkBoardAccess(boardId, user.userId);
            console.log(`[SERVER] Access check result: ${hasAccess}`);
            if (!hasAccess) {
                console.error(`[SERVER] Access denied for user ${user.userId} to board ${boardId}`);
                socket.emit('error', { message: 'You do not have access to this board' });
                return;
            }

            socket.join(boardId);
            console.log(`[SERVER] User ${user.userId} joined board ${boardId}`);

            if (!boardUsers.has(boardId)) {
                boardUsers.set(boardId, new Map());
            }
            const userColor = getRandomColor();
            boardUsers.get(boardId).set(socket.id, {
                userId: user.userId,
                name: user.name,
                color: userColor
            });
            console.log('[SERVER] Board users:', boardUsers.get(boardId));

            socket.to(boardId).emit('user-joined', {
                socketId: socket.id,
                user: {
                    userId: user.userId,
                    name: user.name,
                    color: userColor
                }
            });
            console.log(`[SERVER] Notified others about new user in board ${boardId}`);

            const currentUsers = Array.from(boardUsers.get(boardId).entries()).map(([id, userData]) => ({
                socketId: id,
                user: userData
            }));
            socket.emit('current-users', currentUsers);
            console.log(`[SERVER] Sent current users to new joiner:`, currentUsers);

            const elements = await db.getBoardElements(boardId);
            socket.emit('load-elements', elements);
            console.log(`[SERVER] Sent ${elements.length} elements to user`);
        } catch (error) {
            console.error('[SERVER] Join board error:', error);
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
     * Handle text change event
     * @param {Object} data - Text change data
     */
    socket.on('text-change', (data) => {
        try {
            const { boardId, elementId, text } = data;

            if (!boardId || !elementId || text === undefined) {
                throw new Error('Missing required data');
            }

            socket.to(boardId).emit('text-update', {
                elementId,
                text,
                userId: socket.handshake.session.userId
            });
        } catch (error) {
            console.error('Text change error:', error);
            socket.emit('error', { message: 'Failed to process text change' });
        }
    });

    /**
     * Handle mouse move event
     * @param {Object} data - Mouse move data
     */
    socket.on('mouse-move', (data) => {
        try {
            const { boardId, position } = data;

            if (!boardId || !position) {
                throw new Error('Missing required data');
            }

            socket.to(boardId).emit('user-mouse-move', {
                socketId: socket.id,
                position,
                userId: socket.handshake.session.userId
            });
        } catch (error) {
            console.error('Mouse move error:', error);
        }
    });

    /**
     * Handle disconnect event
     */
    socket.on('disconnect', () => {
        console.log('=== [SERVER] Client disconnected ===');
        console.log('Socket ID:', socket.id);
        console.log('================================');

        for (const [boardId, users] of boardUsers) {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                io.to(boardId).emit('user-left', socket.id);
                console.log(`[SERVER] User left board ${boardId}`);

                if (users.size === 0) {
                    boardUsers.delete(boardId);
                    console.log(`[SERVER] Removed empty board ${boardId}`);
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