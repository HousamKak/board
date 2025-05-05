/**
 * Authentication module for the collaboration board application
 * @module auth
 */

class AuthManager {
    /**
     * Create an AuthManager instance
     */
    constructor() {
      this.token = localStorage.getItem('token');
      this.user = null;
      this.authModal = document.getElementById('authModal');
      this.loginForm = document.getElementById('loginForm');
      this.registerForm = document.getElementById('registerForm');
      this.userInfo = document.querySelector('.user-info');
      this.userName = document.getElementById('userName');
      this.logoutBtn = document.getElementById('logoutBtn');
      
      this.initializeEventListeners();
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
          localStorage.setItem('token', this.token);
          this.showUserInfo();
          this.hideAuthModal();
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
      this.hideUserInfo();
      this.showAuthModal();
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
  
  // Create global auth manager instance
  window.authManager = new AuthManager();