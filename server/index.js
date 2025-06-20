const express = require("express");
const socketio = require("socket.io");
const http = require("http");
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, 'client')));
app.use('/textures', express.static(path.join(__dirname, 'textures')));
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, "../client")));

// Game state
const players = {};
const gameRooms = {};
const waitingPlayers = [];

// Generate unique game room ID
function generateGameId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Find or create a game room for matchmaking
function findOrCreateGameRoom(playerId, playerName) {
  // Check if there's a waiting player
  if (waitingPlayers.length > 0) {
    const waitingPlayerId = waitingPlayers.shift();
    const waitingPlayer = players[waitingPlayerId];

    if (waitingPlayer && players[playerId]) {
      // Create new game room with both players
      const gameId = generateGameId();
      gameRooms[gameId] = {
        id: gameId,
        players: [waitingPlayerId, playerId],
        playerData: {
          [waitingPlayerId]: {
            name: waitingPlayer.name,
            progress: { planetsScanned: 0, completedPlanets: [] },
            ready: true,
          },
          [playerId]: {
            name: playerName,
            progress: { planetsScanned: 0, completedPlanets: [] },
            ready: true,
          },
        },
        status: "playing",
        startTime: Date.now(),
        winner: null,
      };

      return gameId;
    }
  }

  // No waiting player, add current player to waiting list
  waitingPlayers.push(playerId);
  return null;
}

io.on("connection", (socket) => {
  console.log("New player connected:", socket.id);

  // Create a new player
  players[socket.id] = {
    id: socket.id,
    name: "",
    position: { x: 0, y: 10, z: 50 },
    rotation: { x: 0, y: 0, z: 0 },
    gameId: null,
  };

  // Handle player joining game
  socket.on("joinGame", (data) => {
    const { playerName } = data;

    if (players[socket.id]) {
      players[socket.id].name = playerName;

      // Try to find or create a game room
      const gameId = findOrCreateGameRoom(socket.id, playerName);

      if (gameId) {
        // Game found/created, both players join the room
        const gameRoom = gameRooms[gameId];
        players[socket.id].gameId = gameId;

        // Join socket rooms
        gameRoom.players.forEach((playerId) => {
          const playerSocket = io.sockets.sockets.get(playerId);
          if (playerSocket) {
            playerSocket.join(gameId);
            players[playerId].gameId = gameId;
          }
        });

        // Notify both players that game is starting
        io.to(gameId).emit("gameStart", {
          gameId: gameId,
          players: gameRoom.playerData,
          startTime: gameRoom.startTime,
        });

        console.log(`Game ${gameId} started with players:`, gameRoom.players);
      } else {
        // Player is waiting for opponent
        socket.emit("gameJoined", {
          gameId: "waiting",
          playerId: socket.id,
          status: "waiting",
        });
      }
    }
  });

  // Handle player movement
  socket.on("playerMovement", (movementData) => {
    if (players[socket.id]) {
      players[socket.id].position = movementData.position;
      players[socket.id].rotation = movementData.rotation;

      const gameId = players[socket.id].gameId;
      if (gameId && gameRooms[gameId]) {
        // Broadcast movement to other players in the same game
        socket.to(gameId).emit("playerMoved", {
          id: socket.id,
          position: movementData.position,
          rotation: movementData.rotation,
        });
      }
    }
  });

  // Handle progress updates
  socket.on("progressUpdate", (data) => {
    const { gameId, playerId, progress } = data;

    if (gameRooms[gameId] && gameRooms[gameId].playerData[playerId]) {
      gameRooms[gameId].playerData[playerId].progress = progress;

      socket.to(gameId).emit("opponentProgress", {
        playerId: playerId,
        progress: progress,
      });

      console.log(
        `Player ${playerId} progress: ${progress.planetsScanned}/3 planets`
      );
    }
  });

  // Handle game completion
  socket.on("gameComplete", (data) => {
    const { gameId, playerId, completionTime } = data;

    if (gameRooms[gameId] && !gameRooms[gameId].winner) {
      // Set winner
      gameRooms[gameId].winner = playerId;
      gameRooms[gameId].status = "finished";

      const gameRoom = gameRooms[gameId];
      const winnerData = gameRoom.playerData[playerId];
      const opponentId = gameRoom.players.find((id) => id !== playerId);
      const opponentData = gameRoom.playerData[opponentId];

      // Notify all players in the game
      io.to(gameId).emit("gameEnd", {
        winner: playerId,
        winnerName: winnerData.name,
        loserName: opponentData.name,
        winnerPlanets: winnerData.progress.completedPlanets,
        loserPlanets: opponentData.progress.completedPlanets,
        gameId: gameId,
      });

      console.log(`Game ${gameId} completed. Winner: ${winnerData.name}`);

      // Clean up game room after 30 seconds
      setTimeout(() => {
        if (gameRooms[gameId]) {
          delete gameRooms[gameId];
          console.log(`Game room ${gameId} cleaned up`);
        }
      }, 30000);
    }
  });

  // Handle player disconnect
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    // Remove from waiting list if present
    const waitingIndex = waitingPlayers.indexOf(socket.id);
    if (waitingIndex > -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    // Handle game room cleanup
    if (players[socket.id] && players[socket.id].gameId) {
      const gameId = players[socket.id].gameId;
      if (gameRooms[gameId]) {
        // Notify other players in the game
        socket.to(gameId).emit("opponentDisconnected", {
          playerId: socket.id,
          playerName: players[socket.id].name,
        });

        // Remove the game room
        delete gameRooms[gameId];
        console.log(`Game room ${gameId} removed due to player disconnect`);
      }
    }

    // Remove player
    delete players[socket.id];

    // Emit to all players
    io.emit("playerDisconnected", socket.id);
  });

  // Handle game restart request
  socket.on("restartGame", () => {
    if (players[socket.id]) {
      // Reset player state
      players[socket.id].gameId = null;

      // Add back to waiting list or find new game
      socket.emit("gameRestarted");
    }
  });

  // Add this with your other socket event handlers
  socket.on("leaveGame", (data) => {
    const { gameId } = data;

    if (gameRooms[gameId]) {
      // Remove player from game room
      const index = gameRooms[gameId].players.indexOf(socket.id);
      if (index !== -1) {
        gameRooms[gameId].players.splice(index, 1);

        // Notify remaining player if any
        if (gameRooms[gameId].players.length > 0) {
          const remainingPlayerId = gameRooms[gameId].players[0];
          io.to(remainingPlayerId).emit("opponentLeft");
        }

        // Clean up empty game rooms
        if (gameRooms[gameId].players.length === 0) {
          delete gameRooms[gameId];
        }
      }
    }

    // Remove from waiting list if present
    const waitingIndex = waitingPlayers.indexOf(socket.id);
    if (waitingIndex > -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    // Update player state
    if (players[socket.id]) {
      players[socket.id].gameId = null;
    }

    socket.emit("gameRestarted");
  });

  // Add new event for opponent leaving
  socket.on("opponentLeft", () => {
    // Show message that opponent left
    document.getElementById("startScreen").innerHTML = `
    <h1>OPPONENT LEFT</h1>
    <p>Your opponent has left the game.</p>
    <button onclick="restartGame()">PLAY AGAIN</button>
  `;
    document.getElementById("startScreen").style.display = "flex";
  });
});

// Periodic cleanup of abandoned games
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
