// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

server.listen(PORT, () => {
    console.log(`✅ Sinyalleşme Sunucusu ${PORT} portunda çalışıyor.`);
});

// Statik dosyaları (web arayüzünü) sunması için Express'i ayarla
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log(`Yeni bir kullanıcı bağlandı: ${socket.id}`);

    socket.on('joinRoom', (data) => {
        const { roomName } = data;
        
        // Önceki odadan ayrıl (Güvenlik için)
        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });

        socket.join(roomName);
        console.log(`Kullanıcı ${socket.id}, odaya katıldı: ${roomName}`);

        socket.to(roomName).emit('userJoined', socket.id);
    });

    socket.on('signal', (data) => {
        // Sinyali, belirtilen hedef kullanıcıya yönlendir.
        io.to(data.to).emit('signal', {
            from: socket.id,
            signalData: data.signalData
        });
    });

    socket.on('disconnecting', () => {
        const rooms = Array.from(socket.rooms);
        rooms.forEach(roomName => {
            socket.to(roomName).emit('userLeft', socket.id);
        });
        console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    });
});
