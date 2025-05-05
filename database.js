/**
 * Database module for the collaboration board application
 * @module database
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

/**
 * Initialize database connection
 * @returns {sqlite3.Database} Database instance
 */
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    throw err;
  }
  console.log('Connected to SQLite database');
  initializeDatabase();
});

/**
 * Initialize database tables
 */
function initializeDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Boards table
    db.run(`CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )`);

    // Board members table
    db.run(`CREATE TABLE IF NOT EXISTS board_members (
      board_id TEXT,
      user_id TEXT,
      role TEXT DEFAULT 'editor',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (board_id, user_id),
      FOREIGN KEY (board_id) REFERENCES boards(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Elements table
    db.run(`CREATE TABLE IF NOT EXISTS elements (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content JSON,
      position JSON,
      style JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (board_id) REFERENCES boards(id)
    )`);

    // Connectors table
    db.run(`CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      from_element_id TEXT NOT NULL,
      to_element_id TEXT NOT NULL,
      style JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (board_id) REFERENCES boards(id),
      FOREIGN KEY (from_element_id) REFERENCES elements(id),
      FOREIGN KEY (to_element_id) REFERENCES elements(id)
    )`);
  });
}

/**
 * Create a new user
 * @param {string} email - User email
 * @param {string} password - Hashed password
 * @param {string} name - User name
 * @returns {Promise<Object>} Created user information
 */
function createUser(email, password, name) {
  return new Promise((resolve, reject) => {
    const userId = require('uuid').v4();
    
    db.run(
      'INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)',
      [userId, email, password, name],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ userId, email, name });
        }
      }
    );
  });
}

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null if not found
 */
function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE email = ?',
      [email],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

/**
 * Create a new board
 * @param {string} name - Board name
 * @param {string} userId - Owner user ID
 * @returns {Promise<string>} Board ID
 */
function createBoard(name, userId) {
  return new Promise((resolve, reject) => {
    const boardId = require('uuid').v4();
    
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      db.run(
        'INSERT INTO boards (id, name, owner_id) VALUES (?, ?, ?)',
        [boardId, name, userId],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          db.run(
            'INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)',
            [boardId, userId, 'owner'],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
              } else {
                db.run('COMMIT');
                resolve(boardId);
              }
            }
          );
        }
      );
    });
  });
}

/**
 * Get boards for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of board objects
 */
function getUserBoards(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT b.*, bm.role 
       FROM boards b 
       JOIN board_members bm ON b.id = bm.board_id 
       WHERE bm.user_id = ?
       ORDER BY b.created_at DESC`,
      [userId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

/**
 * Get a specific board
 * @param {string} boardId - Board ID
 * @returns {Promise<Object|null>} Board object or null if not found
 */
function getBoard(boardId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM boards WHERE id = ?',
      [boardId],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

/**
 * Get all elements for a board
 * @param {string} boardId - Board ID
 * @returns {Promise<Array>} Array of element objects
 */
function getBoardElements(boardId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM elements WHERE board_id = ?',
      [boardId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Parse JSON fields
          const elements = rows.map(row => ({
            ...row,
            content: JSON.parse(row.content || '{}'),
            position: JSON.parse(row.position || '{}'),
            style: JSON.parse(row.style || '{}')
          }));
          resolve(elements);
        }
      }
    );
  });
}

/**
 * Create an element
 * @param {string} boardId - Board ID
 * @param {Object} element - Element data
 * @returns {Promise<void>}
 */
function createElement(boardId, element) {
  return new Promise((resolve, reject) => {
    const { id, type, content, position, style } = element;
    
    db.run(
      `INSERT INTO elements 
       (id, board_id, type, content, position, style) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        boardId,
        type,
        JSON.stringify(content || {}),
        JSON.stringify(position || {}),
        JSON.stringify(style || {})
      ],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Update an element
 * @param {Object} element - Element data to update
 * @returns {Promise<void>}
 */
function updateElement(element) {
  return new Promise((resolve, reject) => {
    const { id, content, position, style } = element;
    
    db.run(
      `UPDATE elements 
       SET content = ?, position = ?, style = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        JSON.stringify(content || {}),
        JSON.stringify(position || {}),
        JSON.stringify(style || {}),
        id
      ],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Delete an element
 * @param {string} elementId - Element ID
 * @returns {Promise<void>}
 */
function deleteElement(elementId) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM elements WHERE id = ?',
      [elementId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Check if user has access to board
 * @param {string} boardId - Board ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Access status
 */
function checkBoardAccess(boardId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?',
      [boardId, userId],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      }
    );
  });
}

/**
 * Get board member details
 * @param {string} boardId - Board ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Member object or null
 */
function getBoardMember(boardId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM board_members WHERE board_id = ? AND user_id = ?',
      [boardId, userId],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

/**
 * Add board member
 * @param {string} boardId - Board ID
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @returns {Promise<void>}
 */
function addBoardMember(boardId, userId, role) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)',
      [boardId, userId, role],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Delete board and all related data
 * @param {string} boardId - Board ID
 * @returns {Promise<void>}
 */
function deleteBoard(boardId) {
  return new Promise((resolve, reject) => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Delete in order of dependencies
      const queries = [
        'DELETE FROM connectors WHERE board_id = ?',
        'DELETE FROM elements WHERE board_id = ?',
        'DELETE FROM board_members WHERE board_id = ?',
        'DELETE FROM boards WHERE id = ?'
      ];
      
      let completed = 0;
      
      queries.forEach(query => {
        db.run(query, [boardId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          completed++;
          if (completed === queries.length) {
            db.run('COMMIT', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }
        });
      });
    });
  });
}

module.exports = {
  createUser,
  getUserByEmail,
  createBoard,
  getUserBoards,
  getBoard,
  getBoardElements,
  createElement,
  updateElement,
  deleteElement,
  checkBoardAccess,
  getBoardMember,
  addBoardMember,
  deleteBoard
};