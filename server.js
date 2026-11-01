const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const tokenIcons = ["🐶", "🐱", "🐻", "🐰", "🐼", "🐨", "🦁", "🦊", "🐯", "🐵"];
const tokenColors = ["#e74c3c", "#9b59b6", "#3498db", "#1abc9c", "#f1c40f", "#e67e22", "#34495e", "#ff6b81", "#70a1ff", "#7bed9f"];

let gameState = {
    players: [],
    currentPlayerIndex: 0
};

io.on('connection', (socket) => {
    socket.on('join_game', (data) => {
        if(gameState.players.length >= 10) return;
        let newPlayer = {
            id: socket.id,
            name: data.name,
            icon: tokenIcons[gameState.players.length],
            color: tokenColors[gameState.players.length],
            position: 0,
            gold: 1000
        };
        gameState.players.push(newPlayer);
        socket.emit('init_player', newPlayer);
        io.emit('log_message', `🎉 ${newPlayer.name} (${newPlayer.icon}) 加入了游戏！`);
        io.emit('update_game_state', gameState);
    });

    socket.on('roll_dice', () => {
        let currPlayer = gameState.players[gameState.currentPlayerIndex];
        if(!currPlayer || currPlayer.id !== socket.id) return;

        let steps = Math.floor(Math.random() * 6) + 1;
        io.emit('play_dice_animation', { playerName: currPlayer.name, steps: steps });

        setTimeout(() => {
            let oldPos = currPlayer.position;
            currPlayer.position = (currPlayer.position + steps) % 24;
            if(currPlayer.position < oldPos) {
                currPlayer.gold += 500;
                io.emit('log_message', `🎉 ${currPlayer.name} 绕过起点一圈，奖励 500 金币！`);
            }
            io.emit('log_message', `🎲 ${currPlayer.name} 掷出 ${steps} 点，移动到了第 ${currPlayer.position} 格。`);
            gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
            io.emit('update_game_state', gameState);
        }, 2200);
    });

    socket.on('disconnect', () => {
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        if(gameState.players.length > 0) {
            gameState.currentPlayerIndex = gameState.currentPlayerIndex % gameState.players.length;
        }
        io.emit('update_game_state', gameState);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
