const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 20 * 1024 * 1024 // 支持大图片和音频传输
});

const tokenIcons = ["🐶", "🐱", "🐻", "🐰", "🐼", "🐨", "🦁", "🦊", "🐯", "🐵"];
const tokenColors = ["#e74c3c", "#9b59b6", "#3498db", "#1abc9c", "#f1c40f", "#e67e22", "#34495e", "#ff6b81", "#70a1ff", "#7bed9f"];

let gameState = {
    players: [],
    currentPlayerIndex: 0
};

// 后端持久化保存教师录入的题库
let customCellQuestions = {};

io.on('connection', (socket) => {
    console.log(`用户连接: ${socket.id}`);

    // 新连接时同步当前题库
    socket.emit('sync_questions', customCellQuestions);

    // 教师端登录验证
    socket.on('teacher_login', (data) => {
        if (data.password === "1020#") {
            socket.emit('teacher_login_success');
        } else {
            socket.emit('teacher_login_fail', "密码错误 (Password Incorrect)");
        }
    });

    // 教师端保存题库并同步全网
    socket.on('save_teacher_question', (data) => {
        customCellQuestions[data.cellIdx] = data.questionData;
        console.log(`教师已更新第 ${data.cellIdx} 号格子的题目`);
        io.emit('sync_questions', customCellQuestions);
        io.emit('log_message', `🧑‍🏫 教师更新了第 ${data.cellIdx} 号格子的题库内容！`);
    });

    // 学生加入游戏
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
        socket.emit('sync_questions', customCellQuestions);

        io.emit('log_message', `🎉 ${newPlayer.name} (${newPlayer.icon}) 加入了游戏！`);
        io.emit('update_game_state', gameState);
    });

    // 投掷骰子及移动
    socket.on('roll_dice', () => {
        let currPlayer = gameState.players[gameState.currentPlayerIndex];
        if(!currPlayer || currPlayer.id !== socket.id) return;

        let steps = Math.floor(Math.random() * 6) + 1;
        io.emit('play_dice_animation', { playerName: currPlayer.name, steps: steps });

        setTimeout(() => {
            let oldPos = currPlayer.position;
            currPlayer.position = (currPlayer.position + steps) % 18;

            if(currPlayer.position < oldPos) {
                currPlayer.gold += 500;
                io.emit('log_message', `🎉 ${currPlayer.name} 绕过起点一圈，奖励 500 金币！`);
            }

            let landPos = currPlayer.position;
            if (landPos === 2) { 
                let bonus = Math.floor(Math.random() * 3 + 1) * 100;
                currPlayer.gold += bonus;
                io.emit('log_message', `🎁 ${currPlayer.name} 触发奖励格 (Reward)，获得随机积分 +${bonus}！`);
            } else if (landPos === 4) { 
                io.emit('log_message', `🛑 ${currPlayer.name} 触发暂停格 (Stop)，暂停一回合！`);
            } else if (landPos === 7 || landPos === 16) { 
                currPlayer.position = (currPlayer.position - 1 + 18) % 18;
                io.emit('log_message', `⚡ ${currPlayer.name} 触发惩罚格 (Punish)，后退 1 步至第 ${currPlayer.position} 格！`);
            } else if (landPos === 13) { 
                io.emit('log_message', `🎲 ${currPlayer.name} 触发机会格 (Chance)，获得再扔一次的机会！`);
            }

            io.emit('log_message', `🎲 ${currPlayer.name} 移动到了第 ${currPlayer.position} 格。`);
            io.emit('update_game_state', gameState);

            // 触发格子任务并【实时同步题目到公屏和教师端】
            let qData = customCellQuestions[landPos] || null;
            io.emit('trigger_quiz_task', { 
                playerId: currPlayer.id, 
                playerName: currPlayer.name,
                position: landPos,
                questionData: qData 
            });

        }, 2200);
    });

    // 学生提交作业图片 -> 实时推送给教师端批改
    socket.on('upload_homework_image', (data) => {
        io.emit('log_message', `📤 ${data.playerName} 已提交实操图片作业，请教师端批改。`);
        io.emit('teacher_review_homework', data); // 教师端专属接收
    });

    // 教师端批改结果反馈
    socket.on('teacher_grade_decision', (data) => {
        let currPlayer = gameState.players[gameState.currentPlayerIndex];
        if (!currPlayer) return;

        if (data.passed) {
            io.emit('log_message', `✅ 教师批改通过！${currPlayer.name} 成功过关。`);
        } else {
            io.emit('log_message', `❌ 教师批改不通过！${currPlayer.name} 留在原地。`);
        }

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
