/**
 * Main application module for the collaboration board
 * @module app
 */

class CollaborationApp {
    /**
     * Create an CollaborationApp instance
     */
    constructor() {
      this.currentBoard = null;
      this.isInitialized = false;
      this.boardSelect = document.getElementById('boardSelect');
      this.newBoardBtn = document.getElementById('newBoardBtn');
      this.boardModal = document.getElementById('boardModal');
      this.boardForm = document.getElementById('boardForm');
      
      this.initializeEventListeners();
    }
  
    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
      // Board selection
      this.boardSelect.addEventListener('change', (e) => this.loadBoard(e.target.value));
      
      // New board button
      this.newBoardBtn.addEventListener('click', () => this.showBoardModal());
      
      // Board form submission
      this.boardForm.addEventListener('submit', (e) => this.createBoard(e));
    }
  
    /**
     * Initialize the application
     */
    async initialize() {
      if (this.isInitialized) return;
  
      try {
        // Initialize authentication
        await window.authManager.initialize();
        
        if (window.authManager.isAuthenticated()) {
          // Connect to socket server
          window.socketManager.connect();
          
          // Load user's boards
          await this.loadUserBoards();
          
          // Enable controls
          this.enableControls();
        }
        
        this.isInitialized = true;
      } catch (error) {
        console.error('Application initialization error:', error);
        alert('Failed to initialize application');
      }
    }
  
    /**
     * Load user's boards
     */
    async loadUserBoards() {
      try {
        const response = await fetch('/api/boards', {
          headers: {
            Authorization: `Bearer ${window.authManager.getToken()}`
          }
        });
  
        if (response.ok) {
          const boards = await response.json();
          this.populateBoardSelect(boards);
        } else {
          throw new Error('Failed to load boards');
        }
      } catch (error) {
        console.error('Error loading boards:', error);
        alert('Failed to load boards');
      }
    }
  
    /**
     * Populate board select dropdown
     * @param {Array} boards - Array of board objects
     */
    populateBoardSelect(boards) {
      this.boardSelect.innerHTML = '<option value="">Select Board</option>';
      
      boards.forEach(board => {
        const option = document.createElement('option');
        option.value = board.id;
        option.textContent = board.name;
        this.boardSelect.appendChild(option);
      });
    }
  
    /**
     * Load a specific board
     * @param {string} boardId - Board ID
     */
    async loadBoard(boardId) {
      if (!boardId) return;
  
      try {
        const response = await fetch(`/api/boards/${boardId}`, {
          headers: {
            Authorization: `Bearer ${window.authManager.getToken()}`
          }
        });
  
        if (response.ok) {
          const board = await response.json();
          this.currentBoard = board;
          
          // Join board via socket
          window.socketManager.joinBoard(boardId);
          
          // Update canvas with board elements
          window.canvasManager.loadElements(board.elements || []);
        } else {
          throw new Error('Failed to load board');
        }
      } catch (error) {
        console.error('Error loading board:', error);
        alert('Failed to load board');
      }
    }
  
    /**
     * Show board creation modal
     */
    showBoardModal() {
      this.boardModal.style.display = 'flex';
      document.getElementById('boardName').value = '';
      document.getElementById('boardName').focus();
    }
  
    /**
     * Create new board
     * @param {Event} e - Form submit event
     */
    async createBoard(e) {
      e.preventDefault();
      
      const name = document.getElementById('boardName').value;
      if (!name) return;
  
      try {
        const response = await fetch('/api/boards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${window.authManager.getToken()}`
          },
          body: JSON.stringify({ name })
        });
  
        if (response.ok) {
          const board = await response.json();
          
          // Reload boards
          await this.loadUserBoards();
          
          // Select the new board
          this.boardSelect.value = board.boardId;
          this.loadBoard(board.boardId);
          
          // Hide modal
          this.boardModal.style.display = 'none';
        } else {
          throw new Error('Failed to create board');
        }
      } catch (error) {
        console.error('Error creating board:', error);
        alert('Failed to create board');
      }
    }
  
    /**
     * Enable application controls
     */
    enableControls() {
      this.boardSelect.disabled = false;
      this.newBoardBtn.disabled = false;
    }
  
    /**
     * Disable application controls
     */
    disableControls() {
      this.boardSelect.disabled = true;
      this.newBoardBtn.disabled = true;
    }
  
    /**
     * Disconnect from current board
     */
    disconnect() {
      if (this.currentBoard) {
        window.socketManager.disconnect();
        this.currentBoard = null;
        this.boardSelect.value = '';
      }
    }
  
    /**
     * Handle window close event
     */
    handleWindowClose() {
      this.disconnect();
    }
  }
  
  // Create and start the application
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new CollaborationApp();
    window.app.initialize();
  });
  
  // Handle page unload
  window.addEventListener('beforeunload', () => {
    if (window.app) {
      window.app.handleWindowClose();
    }
  });
  
  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Handle keyboard shortcuts
    if (e.key === 'Escape') {
      // Close modals
      const modals = document.querySelectorAll('.modal');
      modals.forEach(modal => {
        if (modal.style.display !== 'none') {
          modal.style.display = 'none';
        }
      });
      
      // Deselect objects
      window.canvasManager?.getCanvas()?.discardActiveObject();
      window.canvasManager?.getCanvas()?.renderAll();
    }
    
    // Save with Ctrl+S
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      // Save functionality is handled automatically
    }
    
    // Delete with Delete key
    if (e.key === 'Delete') {
      const activeObject = window.canvasManager?.getCanvas()?.getActiveObject();
      if (activeObject) {
        window.canvasManager.deleteElement(activeObject);
      }
    }
    
    // Copy with Ctrl+C
    if (e.ctrlKey && e.key === 'c') {
      const activeObject = window.canvasManager?.getCanvas()?.getActiveObject();
      if (activeObject) {
        activeObject.clone((cloned) => {
          window._clipboard = cloned;
        });
      }
    }
    
    // Paste with Ctrl+V
    if (e.ctrlKey && e.key === 'v') {
      if (window._clipboard) {
        window._clipboard.clone((clonedObj) => {
          clonedObj.set({
            left: clonedObj.left + 10,
            top: clonedObj.top + 10,
            evented: true,
            data: {
              ...clonedObj.data,
              id: 'element_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
            }
          });
          
          const canvas = window.canvasManager?.getCanvas();
          if (canvas) {
            canvas.add(clonedObj);
            canvas.setActiveObject(clonedObj);
            canvas.renderAll();
            
            // Emit element creation
            window.canvasManager.emitElementCreate(clonedObj);
          }
        });
      }
    }
    
    // Toggle tools with number keys
    const toolMap = {
      '1': 'select',
      '2': 'sticky',
      '3': 'task',
      '4': 'connector'
    };
    
    if (toolMap[e.key]) {
      window.canvasManager?.setTool(toolMap[e.key]);
    }
  });
  
  // Error handling
  window.addEventListener('error', (event) => {
    console.error('Application error:', event.error);
    // Handle critical errors gracefully
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    // Handle unhandled promise rejections
  });