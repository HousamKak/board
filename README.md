# Collaboration Board

A real-time collaboration whiteboard application built with Node.js, Express, Socket.IO, and Fabric.js.

## Features

- **Real-time Collaboration**: Multiple users can collaborate simultaneously on the same board
- **Multi-cursor Support**: See other users' cursors with colored name badges
- **Canvas Elements**:
  - Sticky notes with editable text and color customization
  - Task cards with title, description, assignee, due date, and status
  - Connectors to link elements together
- **Infinite Canvas**: Zoomable and pannable workspace
- **User Authentication**: Email/password registration and login
- **Board Management**: Create and switch between multiple boards
- **Persistent Storage**: SQLite database for reliable data storage

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript, Fabric.js
- **Backend**: Node.js, Express
- **Real-time**: Socket.IO
- **Database**: SQLite
- **Security**: JWT, bcrypt, Helmet

## Prerequisites

- Node.js (v14.0.0 or higher)
- npm or yarn
- Docker (optional, for containerized deployment)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/collaboration-board.git
   cd collaboration-board
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` file with your configuration:
   ```env
   PORT=3000
   JWT_SECRET=your-secure-secret-key
   NODE_ENV=development
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open your browser and navigate to `http://localhost:3000`

## Docker Deployment

### Using Docker Compose (Recommended)

1. Build and start the containers:
   ```bash
   docker-compose up -d --build
   ```

2. Access the application at `http://localhost:3000`

3. Stop the containers:
   ```bash
   docker-compose down
   ```

### Manual Docker Build

1. Build the Docker image:
   ```bash
   docker build -t collaboration-board .
   ```

2. Run the container:
   ```bash
   docker run -d -p 3000:3000 \
     -e NODE_ENV=production \
     -e JWT_SECRET=your-secure-secret-key \
     --name collaboration-board \
     collaboration-board
   ```

## Production Deployment

### Option 1: Traditional Server

1. Set up a Linux server (Ubuntu/Debian recommended)

2. Install Node.js and npm:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. Install PM2 process manager:
   ```bash
   sudo npm install -g pm2
   ```

4. Clone and configure the application:
   ```bash
   git clone https://github.com/yourusername/collaboration-board.git
   cd collaboration-board
   npm install --production
   cp .env.example .env
   # Edit .env with production settings
   ```

5. Start with PM2:
   ```bash
   pm2 start server.js --name collaboration-board
   pm2 startup
   pm2 save
   ```

6. Set up Nginx as reverse proxy:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

7. Set up SSL with Let's Encrypt:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

### Option 2: Cloud Platforms

#### Heroku

1. Install Heroku CLI
2. Login to Heroku: `heroku login`
3. Create app: `heroku create your-app-name`
4. Set environment variables:
   ```bash
   heroku config:set JWT_SECRET=your-secret
   heroku config:set NODE_ENV=production
   ```
5. Deploy:
   ```bash
   git push heroku main
   ```

#### DigitalOcean App Platform

1. Connect your GitHub repository
2. Configure environment variables
3. Deploy with one click

#### AWS Elastic Beanstalk

1. Install AWS CLI and EB CLI
2. Initialize: `eb init`
3. Configure environment variables
4. Deploy: `eb deploy`

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /api/register | Register new user | No |
| POST | /api/login | Login user | No |
| GET | /api/boards | Get user's boards | Yes |
| POST | /api/boards | Create new board | Yes |
| GET | /api/boards/:id | Get board details | Yes |

## Socket.IO Events

### Client to Server

- `join-board`: Join a specific board
- `cursor-move`: Send cursor position updates
- `create-element`: Create new element
- `update-element`: Update existing element
- `delete-element`: Delete element

### Server to Client

- `user-joined`: User joined the board
- `user-left`: User left the board
- `current-users`: List of current users
- `cursor-update`: Cursor position update
- `element-created`: New element created
- `element-updated`: Element updated
- `element-deleted`: Element deleted
- `load-elements`: Load all board elements

## Keyboard Shortcuts

- `1`: Select tool
- `2`: Sticky note tool
- `3`: Task card tool
- `4`: Connector tool
- `Delete`: Delete selected element
- `Ctrl+C`: Copy selected element
- `Ctrl+V`: Paste element
- `Ctrl+S`: Save (auto-save is enabled)
- `Esc`: Close modals/deselect

## Development

### Running Tests

```bash
npm test
```

### Code Style

```bash
npm run lint
```

### Building for Production

```bash
npm run build
```

## Security Considerations

- JWT tokens with secure secret
- Password hashing with bcrypt
- Rate limiting on API endpoints
- CORS configuration
- Input validation
- SQL injection prevention

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For support, email support@example.com or create an issue in the repository.

## Acknowledgments

- Fabric.js for canvas manipulation
- Socket.IO for real-time communication
- All contributors and users