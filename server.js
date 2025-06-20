const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'client')));
app.use('/textures', express.static(path.join(__dirname, 'textures')));

// Game state
const players = {};
const gameRooms = {};
const waitingPlayers = [];

// Generate unique game room ID
function generateGameId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Matchmaking
function findOrCreateGameRoom(playerId, playerName) {
  if (waitingPlayers.length > 0) {
    const waitingPlayerId = waitingPlayers.shift();
    const waitingPlayer = players[waitingPlayerId];

    if (waitingPlayer && players[playerId]) {
      const gameId = generateGameId();
      gameRooms[gameId] = {
        id: gameId,
        players: [waitingPlayerId, playerId],
        playerData: {
          [waitingPlayerId]: {
            name: waitingPlayer.name,
            progress: { planetsScanned: 0, completedPlanets: [] },
            ready: true
          },
          [playerId]: {
            name: playerName,
            progress: { planetsScanned: 0, completedPlanets: [] },
            ready: true
          }
        },
        status: 'playing',
        startTime: Date.now(),
        winner: null
      };
      return gameId;
    }
  }

  waitingPlayers.push(playerId);
  return null;
}

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Initialize player
  players[socket.id] = {
    id: socket.id,
    name: '',
    position: { x: 0, y: 10, z: 50 },
    rotation: { x: 0, y: 0, z: 0 },
    gameId: null
  };

  // Handle player joining game
  socket.on('joinGame', (data) => {
    const { playerName } = data;
    players[socket.id].name = playerName;

    const gameId = findOrCreateGameRoom(socket.id, playerName);
    if (gameId) {
      const gameRoom = gameRooms[gameId];
      players[socket.id].gameId = gameId;

      gameRoom.players.forEach(playerId => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
          playerSocket.join(gameId);
          players[playerId].gameId = gameId;
        }
      });

      io.to(gameId).emit('gameStart', {
        gameId: gameId,
        players: gameRoom.playerData,
        startTime: gameRoom.startTime
      });
    } else {
      socket.emit('gameJoined', {
        gameId: 'waiting',
        playerId: socket.id,
        status: 'waiting'
      });
    }
  });

  // Handle player movement
  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].position = movementData.position;
      players[socket.id].rotation = movementData.rotation;

      const gameId = players[socket.id].gameId;
      if (gameId && gameRooms[gameId]) {
        socket.to(gameId).emit('playerMoved', {
          id: socket.id,
          position: movementData.position,
          rotation: movementData.rotation
        });
      }
    }
  });

  // Handle progress updates
  socket.on('progressUpdate', (data) => {
    const { gameId, playerId, progress } = data;
    if (gameRooms[gameId] && gameRooms[gameId].playerData[playerId]) {
      gameRooms[gameId].playerData[playerId].progress = progress;
      socket.to(gameId).emit('opponentProgress', {
        playerId: playerId,
        progress: progress
      });
    }
  });

  // Handle game completion
  socket.on('gameComplete', (data) => {
    const { gameId, playerId } = data;
    if (gameRooms[gameId] && !gameRooms[gameId].winner) {
      gameRooms[gameId].winner = playerId;
      gameRooms[gameId].status = 'finished';

      const gameRoom = gameRooms[gameId];
      const winnerData = gameRoom.playerData[playerId];
      const opponentId = gameRoom.players.find(id => id !== playerId);
      const opponentData = gameRoom.playerData[opponentId];

      io.to(gameId).emit('gameEnd', {
        winner: playerId,
        winnerName: winnerData.name,
        loserName: opponentData.name,
        winnerPlanets: winnerData.progress.completedPlanets,
        loserPlanets: opponentData.progress.completedPlanets,
        gameId: gameId
      });

      // Clean up after 30 seconds
      setTimeout(() => {
        if (gameRooms[gameId]) {
          delete gameRooms[gameId];
        }
      }, 30000);
    }
  });

  // Handle player leaving game
  socket.on('leaveGame', (data) => {
    const { gameId } = data;
    if (gameRooms[gameId]) {
      const index = gameRooms[gameId].players.indexOf(socket.id);
      if (index !== -1) {
        gameRooms[gameId].players.splice(index, 1);
        
        if (gameRooms[gameId].players.length > 0) {
          io.to(gameRooms[gameId].players[0]).emit('opponentLeft');
        }
        
        if (gameRooms[gameId].players.length === 0) {
          delete gameRooms[gameId];
        }
      }
    }
    
    const waitingIndex = waitingPlayers.indexOf(socket.id);
    if (waitingIndex > -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    if (players[socket.id]) {
      players[socket.id].gameId = null;
    }
    
    socket.emit('gameRestarted');
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const waitingIndex = waitingPlayers.indexOf(socket.id);
    if (waitingIndex > -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    if (players[socket.id] && players[socket.id].gameId) {
      const gameId = players[socket.id].gameId;
      if (gameRooms[gameId]) {
        socket.to(gameId).emit('opponentDisconnected', {
          playerId: socket.id,
          playerName: players[socket.id].name
        });
        
        if (gameRooms[gameId].players.length <= 1) {
          delete gameRooms[gameId];
        }
      }
    }
    
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Clean up abandoned games
setInterval(() => {
  const now = Date.now();
  const GAME_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  for (const [gameId, gameRoom] of Object.entries(gameRooms)) {
    if (now - gameRoom.startTime > GAME_TIMEOUT) {
      console.log(`Cleaning up abandoned game: ${gameId}`);
      delete gameRooms[gameId];
    }
  }
}, 60000); // Check every minute
