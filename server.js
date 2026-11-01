const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 10 * 1024 * 1024 // 支持大图片传输
});

const tokenIcons = ["🐶", "🐱", "🐻", "🐰", "🐼", "🐨", "🦁", "🦊", "🐯", "🐵"];
const tokenColors = ["#e74c3c", "#9b59b6", "#3498db", "#1abc9c", "#f1c40f", "#e67e22", "#34495e", "#ff6b81", "#70a1ff", "#7bed9f"];

let gameState = {
    players: [],
    currentPlayerIndex: 0
};

io.on('connection', (socket) => {
    console.log(`用户连接: ${socket.id}`);

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
            io.emit('update_game_state', gameState);

            // 触发图片实操闯关（若该格被老师设定为了图片任务，或默认抽查）
            // 演示逻辑：触发当前玩家的图片上传任务，限时 5 分钟
            io.emit('trigger_image_quiz', { playerId: currPlayer.id, position: currPlayer.position });

        }, 2200);
    });

    // 接收学生上传的作业图片
    socket.on('upload_homework_image', (data) => {
        io.emit('log_message', `📤 ${data.playerName} 已提交实操图片，等待老师批改...`);
        // 转发给老师端弹窗显示
        io.emit('teacher_review_homework', data);
    });

    // 老师端批改结果反馈
    socket.on('teacher_grade_decision', (data) => {
        let currPlayer = gameState.players[gameState.currentPlayerIndex];
        if (!currPlayer) return;

        if (data.passed) {
            io.emit('log_message', `✅ 老师批改通过！${currPlayer.name} 成功过关。`);
        } else {
            io.emit('log_message', `❌ 老师批改不通过！${currPlayer.name} 留在原地，准备轮到下一位。`);
            // 不通过则退回原地
            // 此处可根据需求调整退回逻辑
        }

        // 切换到下一位玩家
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
        io.emit('update_game_state', gameState);
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
server.listen(PORT, () => {
    console.log(`实时联机服务器已在端口 ${PORT} 启动`);
});
