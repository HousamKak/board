/**
 * Socket.IO client for real-time collaboration
 * @module socketClient
 */

class SocketManager {
  /**
   * Create a SocketManager instance
   */
  constructor() {
    console.log('[SOCKET] SocketManager initialized');
    this.socket = null;
    this.boardId = null;
    this.connected = false;
    this.cursorLayer = document.querySelector('.cursor-layer');
    this.userCursors = new Map();
    this.messageHandlers = new Map();
    this.lastTextUpdate = new Map(); // Prevent duplicate updates
    this.connectionAttempts = 0; // Track connection attempts
  }

  /**
   * Connect with authentication
   */
  connect() {
    console.log('[SOCKET] Attempting to connect to server...');
    console.log('[SOCKET] Connection attempt #' + (++this.connectionAttempts));

    if (this.socket) {
      this.socket.disconnect();
    }

    // Ensure token is available
    let token = window.authManager.getToken();
    if (!token) {
      // Attempt to retrieve token from localStorage
      token = localStorage.getItem('authToken');
      if (token) {
        console.log('Token retrieved from localStorage.');
        window.authManager.setToken(token); // Update authManager with the token
      }
    }

    if (!token) {
      console.error('No authentication token found. Please log in.');
      alert('Authentication required. Please log in.');
      return;
    }

    // Connect with token for authentication
    this.socket = io({
      auth: { token }
    });

    this.initializeSocketEvents();
  }

  /**
   * Initialize socket event listeners
   */
  initializeSocketEvents() {
    console.log('[SOCKET] Initializing socket event listeners');

    this.socket.on('connect', () => {
      console.log('=== [SOCKET] Connected to server ===');
      console.log('Socket ID:', this.socket.id);
      console.log('Transport:', this.socket.io.engine.transport.name);
      this.connected = true;
      this.onConnectHandler();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('=== [SOCKET] Disconnected from server ===');
      console.log('Reason:', reason);
      this.connected = false;
      this.clearUserCursors();
    });

    this.socket.on('user-joined', (data) => {
      console.log('User joined:', data);
      this.createUserCursor(data.socketId, data.user);
    });

    this.socket.on('user-left', (socketId) => {
      console.log('User left:', socketId);
      this.removeUserCursor(socketId);
    });

    this.socket.on('current-users', (users) => {
      console.log('Current users:', users);
      users.forEach(userData => {
        if (userData.socketId !== this.socket.id) {
          this.createUserCursor(userData.socketId, userData.user);
        }
      });
    });

    this.socket.on('cursor-update', (data) => {
      this.updateUserCursor(data.socketId, data.position);
    });

    this.socket.on('element-created', (element) => {
      this.triggerEvent('element-created', element);
    });

    this.socket.on('element-updated', (element) => {
      this.triggerEvent('element-updated', element);
    });

    this.socket.on('element-deleted', (elementId) => {
      this.triggerEvent('element-deleted', elementId);
    });

    this.socket.on('load-elements', (elements) => {
      this.triggerEvent('load-elements', elements);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.triggerEvent('error', error);
      
      // Handle permission errors
      if (error.message?.includes('You do not have access to this board')) {
        alert('You do not have access to this board. Redirecting to board selection.');
        // Disconnect from the board and reload boards
        if (window.app) {
          window.app.currentBoard = null;
          window.app.loadUserBoards();
        }
      }
    });

    // Text updates from other users
    this.socket.on('text-update', (data) => {
      const { elementId, text, userId } = data;

      // Skip if this is our own update (avoid echo)
      const lastUpdate = this.lastTextUpdate.get(elementId);
      if (lastUpdate && lastUpdate.text === text && 
          lastUpdate.userId === window.authManager.getCurrentUser()?.userId) {
        return;
      }

      this.lastTextUpdate.set(elementId, { text, userId });
      this.triggerEvent('text-update', data);
    });

    // Mouse position updates from other users
    this.socket.on('user-mouse-move', (data) => {
      const { socketId, position, userId } = data;
      this.updateUserCursor(socketId, position);
    });
  }

  /**
   * Join a specific board
   * @param {string} boardId - Board ID to join
   */
  joinBoard(boardId) {
    if (!this.socket || !boardId) return;

    this.boardId = boardId;
    const user = window.authManager.getCurrentUser();

    if (user) {
      this.socket.emit('join-board', {
        boardId: boardId,
        user: user
      });
    }
  }

  /**
   * Emit cursor movement
   * @param {Object} position - Cursor position
   */
  emitCursorMove(position) {
    if (!this.socket || !this.boardId) return;

    this.socket.emit('cursor-move', {
      boardId: this.boardId,
      position: position
    });
  }

  /**
   * Emit text change event
   * @param {string} boardId - Board ID
   * @param {string} elementId - Element ID
   * @param {string} text - New text content
   */
  emitTextChange(boardId, elementId, text) {
    if (!this.socket || !this.boardId) return;

    // Store our own update to prevent echo
    const userId = window.authManager.getCurrentUser()?.userId;
    this.lastTextUpdate.set(elementId, { text, userId });

    this.socket.emit('text-change', {
      boardId,
      elementId,
      text
    });
  }

  /**
   * Emit mouse movement
   * @param {Object} position - Mouse position
   */
  emitMouseMove(position) {
    if (!this.socket || !this.boardId) return;

    this.socket.emit('mouse-move', {
      boardId: this.boardId,
      position: position
    });
  }

  /**
   * Create an element on the board
   * @param {Object} element - Element data
   */
  createElement(element) {
    if (!this.socket || !this.boardId) return;

    this.socket.emit('create-element', {
      boardId: this.boardId,
      element: element
    });
  }

  /**
   * Update an element on the board
   * @param {Object} element - Element data
   */
  updateElement(element) {
    if (!this.socket || !this.boardId) return;

    this.socket.emit('update-element', {
      boardId: this.boardId,
      element: element
    });
  }

  /**
   * Delete an element from the board
   * @param {string} elementId - Element ID
   */
  deleteElement(elementId) {
    if (!this.socket || !this.boardId) return;

    this.socket.emit('delete-element', {
      boardId: this.boardId,
      elementId: elementId
    });
  }

  /**
   * Create a user cursor element
   * @param {string} socketId - Socket ID
   * @param {Object} user - User data
   */
  createUserCursor(socketId, user) {
    if (this.userCursors.has(socketId)) {
      this.removeUserCursor(socketId);
    }

    const cursorElement = document.createElement('div');
    cursorElement.className = 'user-cursor';
    cursorElement.innerHTML = `
      <svg viewBox="0 0 24 24" style="fill: ${user.color};">
        <path d="M3 3l7 7v7l3-3V10l7-7z"/>
      </svg>
      <div class="user-name" style="background-color: ${user.color};">${user.name}</div>
    `;

    this.cursorLayer.appendChild(cursorElement);
    this.userCursors.set(socketId, cursorElement);
  }

  /**
   * Update user cursor position
   * @param {string} socketId - Socket ID
   * @param {Object} position - Cursor position
   */
  updateUserCursor(socketId, position) {
    const cursorElement = this.userCursors.get(socketId);
    if (cursorElement) {
      cursorElement.style.left = `${position.x}px`;
      cursorElement.style.top = `${position.y}px`;
    }
  }

  /**
   * Remove user cursor
   * @param {string} socketId - Socket ID
   */
  removeUserCursor(socketId) {
    const cursorElement = this.userCursors.get(socketId);
    if (cursorElement) {
      cursorElement.remove();
      this.userCursors.delete(socketId);
    }
  }

  /**
   * Clear all user cursors
   */
  clearUserCursors() {
    this.userCursors.forEach(cursorElement => cursorElement.remove());
    this.userCursors.clear();
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.clearUserCursors();
    }
  }

  /**
   * Register a message handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  on(event, handler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, new Set());
    }
    this.messageHandlers.get(event).add(handler);
  }

  /**
   * Unregister a message handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  off(event, handler) {
    if (this.messageHandlers.has(event)) {
      this.messageHandlers.get(event).delete(handler);
    }
  }

  /**
   * Trigger an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  triggerEvent(event, data) {
    if (this.messageHandlers.has(event)) {
      this.messageHandlers.get(event).forEach(handler => handler(data));
    }
  }

  /**
   * Connection handler
   */
  onConnectHandler() {
    if (this.boardId) {
      this.joinBoard(this.boardId);
    }
  }

  /**
   * Check if connected to server
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected;
  }
}

// Create global socket manager instance
window.socketManager = new SocketManager();