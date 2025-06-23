const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Настройка CORS для http://defchar.ru
app.use(cors({
  origin: ['http://defchar.ru', 'http://localhost:3000'],
  credentials: true
}));

// Хранилище данных
const chatData = {
  users: [
    { username: 'alex', password: '12345', email: 'alex@example.com' },
    { username: 'maria', password: '12345', email: 'maria@example.com' }
  ],
  messages: [],
  onlineUsers: []
};

// WebSocket сервер
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false // Важно для Railway
});

wss.on('connection', (ws) => {
  console.log('Новое подключение WebSocket');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Логин
      if (data.type === 'login') {
        const user = chatData.users.find(u => 
          u.username === data.username && u.password === data.password
        );
        if (user) {
          chatData.onlineUsers.push(user);
          ws.user = user;
          ws.send(JSON.stringify({
            type: 'login_success',
            user,
            onlineUsers: chatData.onlineUsers
          }));
          broadcastUserList();
        } else {
          ws.send(JSON.stringify({ type: 'login_error', message: 'Неверный логин/пароль' }));
        }
      }

      // Регистрация
      if (data.type === 'register') {
        const userExists = chatData.users.some(u => u.username === data.username);
        if (userExists) {
          ws.send(JSON.stringify({ type: 'register_error', message: 'Пользователь уже существует' }));
        } else {
          const newUser = { username: data.username, password: data.password, email: data.email };
          chatData.users.push(newUser);
          ws.send(JSON.stringify({ type: 'register_success', user: newUser }));
        }
      }

      // Сообщения
      if (data.type === 'message' && ws.user) {
        const messageObj = {
          id: uuidv4(),
          from: ws.user.username,
          to: data.to,
          content: data.content,
          timestamp: new Date().toISOString()
        };
        chatData.messages.push(messageObj);
        broadcastMessage(messageObj);
      }

    } catch (err) {
      console.error('Ошибка WebSocket:', err);
    }
  });

  ws.on('close', () => {
    if (ws.user) {
      chatData.onlineUsers = chatData.onlineUsers.filter(u => u.username !== ws.user.username);
      broadcastUserList();
    }
  });
});

// Рассылка сообщений
function broadcastMessage(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'new_message', message }));
    }
  });
}

// Рассылка списка пользователей
function broadcastUserList() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ 
        type: 'users', 
        users: chatData.onlineUsers 
      }));
    }
  });
}

// REST API для фронтенда
app.get('/api/messages', (req, res) => {
  const { user, withUser } = req.query;
  const messages = chatData.messages.filter(m => 
    m.to === 'all' || 
    (m.from === user && m.to === withUser) || 
    (m.from === withUser && m.to === user)
  );
  res.json(messages);
});

// Старт сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});