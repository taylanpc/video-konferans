// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Codespaces ortamında portu otomatik olarak alır.
const PORT = process.env.PORT || 3000;

// Express ve HTTP sunucusunu başlatma
const app = express();
const server = http.createServer(app);

// Socket.IO sunucusunu başlatma
const io = new Server(server, {
    cors: {
        // Ön yüz uygulaması farklı bir portta (veya farklı bir yerde) olacağı için
        // tüm kaynaklara izin veriyoruz.
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Sunucuyu dinlemeye başla
server.listen(PORT, () => {
    console.log(`✅ Sinyalleşme Sunucusu ${PORT} portunda çalışıyor.`);
});

// Statik dosyaları (web arayüzünü) sunması için Express'i ayarla
app.use(express.static('public'));


// ---------------------------------------------
//           SOCKET.IO SİNYALLEŞME MANTIĞI
// ---------------------------------------------

io.on('connection', (socket) => {
    console.log(`Yeni bir kullanıcı bağlandı: ${socket.id}`);

    // Kullanıcı bir odaya katılmak istediğinde (Toplantı adı/şifre kontrolü)
    socket.on('joinRoom', (data) => {
        // data: { roomName: 'ToplantiAdi', password: 'Sifre' }
        const { roomName, password } = data;
        
        // **Güvenlik Notu:** Bu basit örnekte şifre kontrolü atlanmıştır.
        // Gerçek bir uygulamada burada veritabanından şifre kontrolü yapılmalıdır.
        
        socket.join(roomName);
        console.log(`Kullanıcı ${socket.id}, odaya katıldı: ${roomName}`);

        // Odaya yeni birinin katıldığını diğerlerine bildir
        // Böylece yeni gelen kişiyle WebRTC bağlantısı kurmaya çalışırlar.
        socket.to(roomName).emit('userJoined', socket.id);
    });

    // WebRTC sinyal verilerini (ICE, SDP) alıp hedefe yönlendirme
    socket.on('signal', (data) => {
        // data: { to: hedef_socket_id, signalData: actual_webrtc_data }
        // Sinyali, belirtilen hedef kullanıcıya yönlendir.
        io.to(data.to).emit('signal', {
            from: socket.id,
            signalData: data.signalData
        });
    });

    // Kullanıcı ayrıldığında
    socket.on('disconnecting', () => {
        // Kullanıcının bulunduğu odaları bul
        const rooms = Array.from(socket.rooms);
        rooms.forEach(roomName => {
            // Odaya ayrılma bilgisini gönder
            socket.to(roomName).emit('userLeft', socket.id);
        });
        console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    });
});