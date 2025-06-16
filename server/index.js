const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));

// Game state
const players = {};

io.on('connection', (socket) => {
    console.log('New player connected:', socket.id);
    
    // Create a new player and add it to our players object
    players[socket.id] = {
        id: socket.id,
        position: { x: 0, y: 10, z: 50 },
        rotation: { x: 0, y: 0, z: 0 }
    };
    
    // Send the players object to the new player
    socket.emit('currentPlayers', players);
    
    // Update all other players of the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);
    
    // When a player moves, update the player data
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].position = movementData.position;
            players[socket.id].rotation = movementData.rotation;
            
            // Tell all other players this player moved
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: movementData.position,
                rotation: movementData.rotation
            });
        }
    });
    
    // When a player disconnects, remove them from our players object
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        
        // Emit a message to all players to remove this player
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});