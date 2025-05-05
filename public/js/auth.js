/**
 * Authentication module for the collaboration board application
 * @module auth
 */

class AuthManager {
  /**
   * Create an AuthManager instance
   */
  constructor() {
    this.token = null;
    this.user = null;
    this.authModal = document.getElementById('authModal');
    this.loginForm = document.getElementById('loginForm');
    this.registerForm = document.getElementById('registerForm');
    this.userInfo = document.querySelector('.user-info');
    this.userName = document.getElementById('userName');
    this.logoutBtn = document.getElementById('logoutBtn');
    
    this.initializeEventListeners();
    this.initializeToken(); // Initialize token from storage or session
    this.lockApplication(); // Lock the app initially
  }

  /**
   * Initialize event listeners for authentication
   */
  initializeEventListeners() {
    // Auth tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchAuthTab(e.target.dataset.tab));
    });

    // Form submissions
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.registerForm.addEventListener('submit', (e) => this.handleRegister(e));
    
    // Logout
    this.logoutBtn.addEventListener('click', () => this.logout());
    
    // Prevent closing auth modal without authentication
    window.addEventListener('click', (e) => {
      if (e.target === this.authModal && !this.isAuthenticated()) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    });
    
    this.authModal.addEventListener('click', (e) => {
      if (e.target === this.authModal && !this.isAuthenticated()) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    });
  }

  /**
   * Initialize token from storage or session
   */
  initializeToken() {
    this.token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!this.token) {
      this.checkServerSession();
    }
  }

  /**
   * Check if server has a valid session
   */
  async checkServerSession() {
    try {
      const response = await fetch('/api/session', {
        credentials: 'include' // Important for sending session cookie
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          this.token = data.token;
          this.user = data.user;
          this.persistToken();
          this.showUserInfo();
          this.unlockApplication();
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
    }
  }

  /**
   * Persist token in both local and session storage
   * @param {boolean} remember - Whether to remember login
   */
  persistToken(remember = true) {
    if (this.token) {
      if (remember) {
        localStorage.setItem('token', this.token);
      } else {
        sessionStorage.setItem('token', this.token);
      }
    }
  }

  /**
   * Lock the application until authenticated
   */
  lockApplication() {
    // Prevent any interaction with the main app
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.classList.add('locked');
    }
    
    const appOverlay = document.createElement('div');
    appOverlay.className = 'app-overlay';
    appOverlay.id = 'appOverlay';
    document.body.appendChild(appOverlay);
    
    // Ensure only auth modal is visible
    document.querySelectorAll('.modal').forEach(modal => {
      if (modal.id !== 'authModal') {
        modal.style.display = 'none';
      }
    });
    
    // Make sure auth modal is on top
    this.authModal.style.zIndex = '1000';
  }

  /**
   * Unlock the application after authentication
   */
  unlockApplication() {
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.classList.remove('locked');
    }
    
    const appOverlay = document.getElementById('appOverlay');
    if (appOverlay) {
      appOverlay.remove();
    }
  }

  /**
   * Switch between login and register forms
   * @param {string} tab - Tab name ('login' or 'register')
   */
  switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    if (tab === 'login') {
      this.loginForm.style.display = 'block';
      this.registerForm.style.display = 'none';
    } else {
      this.loginForm.style.display = 'none';
      this.registerForm.style.display = 'block';
    }
  }

  /**
   * Handle login form submission
   * @param {Event} e - Form submit event
   */
  async handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('rememberMe')?.checked ?? true;

    if (!email || !password) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        this.token = data.token;
        this.user = data.user;
        this.persistToken(remember);
        this.showUserInfo();
        this.hideAuthModal();
        this.unlockApplication();
        window.app.initialize(); // Initialize the main app
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert(error.message);
    }
  }

  /**
   * Handle register form submission
   * @param {Event} e - Form submit event
   */
  async handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    if (!name || !email || !password) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('token', this.token);
        this.showUserInfo();
        this.hideAuthModal();
        this.unlockApplication();
        window.app.initialize(); // Initialize the main app
      } else {
        throw new Error(data.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert(error.message);
    }
  }

  /**
   * Logout the user
   */
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    this.hideUserInfo();
    this.showAuthModal();
    this.lockApplication();
    window.app.disconnect(); // Disconnect from the board
  }

  /**
   * Show user information in the navbar
   */
  showUserInfo() {
    this.userName.textContent = this.user.name;
    this.userInfo.style.display = 'flex';
  }

  /**
   * Hide user information from the navbar
   */
  hideUserInfo() {
    this.userInfo.style.display = 'none';
  }

  /**
   * Show the authentication modal
   */
  showAuthModal() {
    this.authModal.style.display = 'flex';
  }

  /**
   * Hide the authentication modal
   */
  hideAuthModal() {
    this.authModal.style.display = 'none';
    
    // Hide board selection modal on logout
    const boardSelectionModal = document.getElementById('boardSelectionModal');
    if (boardSelectionModal) {
      boardSelectionModal.style.display = 'none';
    }
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} Authentication status
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Get current user information
   * @returns {Object|null} User object or null if not authenticated
   */
  getCurrentUser() {
    return this.user;
  }

  /**
   * Get authentication token
   * @returns {string|null} Token or null if not authenticated
   */
  getToken() {
    return this.token;
  }

  /**
   * Initialize authentication state
   */
  async initialize() {
    if (this.token) {
      try {
        // Validate token by fetching user boards
        const response = await fetch('/api/boards', {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        if (response.ok) {
          // Token is valid, fetch user info
          this.user = await this.fetchUserInfo();
          this.showUserInfo();
          this.unlockApplication();
        } else {
          // Token is invalid, logout
          this.logout();
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        this.logout();
      }
    } else {
      this.showAuthModal();
    }
  }

  /**
   * Fetch user information
   * @returns {Promise<Object>} User object
   */
  async fetchUserInfo() {
    // In a real application, you would have an endpoint to fetch user info
    // For now, we'll extract it from the token or use stored data
    const token = this.token;
    if (!token) return null;

    try {
      // Decode JWT to get user info (Note: In production, don't rely on client-side token decoding)
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        userId: payload.userId,
        email: payload.email,
        name: this.user?.name || payload.email.split('@')[0]
      };
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }
}

// Wrap AuthManager initialization in DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) {
        console.error('Login form not found in the DOM.');
        return;
    }

    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('authToken', data.token);
                window.location.href = 'index.html'; // Redirect to main app
            } else {
                const errorData = await response.json();
                errorMessage.textContent = errorData.message || 'Login failed. Please try again.';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorMessage.textContent = 'An error occurred. Please try again later.';
        }
    });

    // Check if already authenticated
    const token = localStorage.getItem('authToken');
    if (token) {
        window.location.href = 'index.html'; // Redirect if already logged in
    }
});

// Moved inline script to external file
const token = localStorage.getItem('authToken');
if (!token) {
    window.location.href = 'auth.html';
}