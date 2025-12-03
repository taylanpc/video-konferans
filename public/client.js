// client.js
const videoGrid = document.getElementById('video-grid');
const joinForm = document.getElementById('join-form');
const controlsDiv = document.getElementById('controls');

// ⚠️ BURAYI KENDİ RENDER URL'NİZLE DEĞİŞTİRİN
const RENDER_URL = 'https://taylancam-app.onrender.com'; 

let socket;
const peerConnections = {}; 

const iceServers = {
    'iceServers': [
        { 'urls': 'stun:stun.l.google.com:19302' }
    ]
};

let localStream;


// ---------------------------------------------
// 1. ODAYA KATILMA FONKSİYONU
// ---------------------------------------------

async function joinMeeting() {
    const roomName = document.getElementById('roomName').value;
    const password = document.getElementById('password').value;

    if (!roomName) {
        alert('Lütfen bir toplantı adı girin.');
        return;
    }

    try {
        // Socket.IO bağlantısını HTTPS (WSS) protokolünü kullanarak kur.
        socket = io(RENDER_URL, { 
            transports: ['websocket'],
            secure: true // Güvenli bağlantıyı zorla
        }); 

        // Bağlantı hatası yakalama
        socket.on('connect_error', (err) => {
            console.error("Socket.IO Bağlantı Hatası:", err);
            alert(`Sunucuya bağlanılamadı. URL'yi kontrol edin. Hata: ${err.message}`);
        });

        // Kameradan ve mikrofondan yerel akışı al
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Kendi video elementini oluştur
        addVideoStream(localStream, socket.id, true);
        
        // Formu gizle, kontrolleri göster
        joinForm.style.display = 'none';
        controlsDiv.style.display = 'flex';

        // Sunucuya bağlanınca odaya katılma sinyalini gönder
        socket.on('connect', () => {
            socket.emit('joinRoom', { roomName, password });
        });
        
        // Socket.IO Olay Dinleyicilerini Kur
        setupSocketListeners();

    } catch (err) {
        console.error("Medya cihazlarına erişilemedi (İzin sorunu?): ", err);
        alert("Mikrofon veya kamera izni verilemedi. Lütfen izinleri ve gizlilik ayarlarını kontrol edin.");
    }
}

// ---------------------------------------------
// 2. SOCKET.IO OLAY YÖNETİMİ
// ---------------------------------------------

function setupSocketListeners() {
    
    socket.on('userJoined', (newUserId) => {
        console.log('Odaya yeni kullanıcı katıldı:', newUserId);
        createPeerConnection(newUserId, true); // Teklif Gönderen (Initiator)
    });

    socket.on('signal', async (data) => {
        const { from, signalData } = data;
        let peer = peerConnections[from];

        if (!peer) {
            peer = createPeerConnection(from, false); // Teklif Kabul Eden
        }

        try {
            if (signalData.type === 'offer') {
                await peer.setRemoteDescription(new RTCSessionDescription(signalData));
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                
                socket.emit('signal', {
                    to: from,
                    signalData: peer.localDescription
                });
            } else if (signalData.type === 'answer') {
                await peer.setRemoteDescription(new RTCSessionDescription(signalData));
            } else if (signalData.candidate) {
                await peer.addIceCandidate(new RTCIceCandidate(signalData.candidate));
            }
        } catch (e) {
            console.error('Sinyalleme hatası:', e);
        }
    });

    socket.on('userLeft', (userId) => {
        const videoElement = document.getElementById(`video-${userId}`);
        if (videoElement) {
            videoElement.parentElement.remove(); 
        }
        if (peerConnections[userId]) {
            peerConnections[userId].close(); 
            delete peerConnections[userId];
        }
    });
}

// ---------------------------------------------
// 3. PEER CONNECTION (EŞLER ARASI BAĞLANTI) YÖNETİMİ
// ---------------------------------------------

function createPeerConnection(userId, isInitiator) {
    const peer = new RTCPeerConnection(iceServers);
    peerConnections[userId] = peer;

    // 1. Yerel akışı (kamera/mikrofon) bağlantıya ekle
    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
    });

    // 2. Uzak akış (diğer kişinin videosu) geldiğinde (ÇOK KRİTİK NOKTA)
    peer.ontrack = (event) => {
        const remoteStream = event.streams[0];
        const existingVideoContainer = document.querySelector(`.video-container > #video-${userId}`).parentElement;
        
        // Eğer video elementi yoksa, oluştur
        if (!existingVideoContainer) {
            addVideoStream(remoteStream, userId, false);
        } else {
            // Eğer element zaten varsa, sadece akışı güncelle
            const videoElement = existingVideoContainer.querySelector('video');
            if (videoElement) {
                videoElement.srcObject = remoteStream;
            } else {
                 addVideoStream(remoteStream, userId, false);
            }
        }
    };
    
    // Bağlantı kurulurken ICE adayları oluşturulduğunda
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                to: userId,
                signalData: { candidate: event.candidate }
            });
        }
    };

    // Eğer teklif başlatan biz isek
    if (isInitiator) {
        peer.onnegotiationneeded = async () => {
            try {
                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);
                
                socket.emit('signal', {
                    to: userId,
                    signalData: peer.localDescription
                });
            } catch (e) {
                console.error('Teklif oluşturma hatası:', e);
            }
        };
    }

    return peer;
}

// ---------------------------------------------
// 4. MEDYA VE ARAYÜZ İŞLEMLERİ
// ---------------------------------------------

function addVideoStream(stream, userId, isLocal) {
    const videoElement = document.createElement('video');
    videoElement.id = `video-${userId}`;
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.muted = isLocal;
    
    // Video oynatmayı zorla
    videoElement.play().catch(e => console.error("Video otomatik oynatma engellendi:", e)); 

    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    
    const nameTag = document.createElement('p');
    nameTag.className = 'name-tag';
    nameTag.innerText = isLocal ? 'BEN' : `Kullanıcı: ${userId.substring(0, 4)}...`;
    
    videoContainer.appendChild(videoElement);
    videoContainer.appendChild(nameTag);
    videoGrid.appendChild(videoContainer);
}

function toggleMic() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById('micBtn').innerText = audioTrack.enabled ? '🎤 Mikrofon Kapat' : '🔇 Mikrofon Aç';
}

function toggleCamera() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    document.getElementById('camBtn').innerText = videoTrack.enabled ? '📹 Kamera Kapat' : '📷 Kamera Aç';
}

async function shareScreen() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true, 
            audio: true 
        });

        // 1. Kendi yerel videomuzdaki akışı değiştir
        const localVideoElement = document.getElementById(`video-${socket.id}`).getElementsByTagName('video')[0];
        localVideoElement.srcObject = screenStream;

        // 2. Tüm eşlere yeni ekran akışını gönder
        const videoTrack = screenStream.getVideoTracks()[0];
        for (const userId in peerConnections) {
            const peer = peerConnections[userId];
            const sender = peer.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        }

        // 3. Ekran paylaşımı durdurulduğunda kamera akışına geri dön
        videoTrack.onended = async () => {
            console.log("Ekran paylaşımı durduruldu, kameraya geri dönülüyor.");
            
            // Kamera/Mikrofon akışını tekrar al
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            const newVideoTrack = localStream.getVideoTracks()[0];
            const newAudioTrack = localStream.getAudioTracks()[0];

            // Tüm eşlere kamera akışını gönder
            for (const userId in peerConnections) {
                const peer = peerConnections[userId];
                
                const videoSender = peer.getSenders().find(s => s.track.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(newVideoTrack);
                }
                const audioSender = peer.getSenders().find(s => s.track.kind === 'audio');
                if (audioSender) {
                    await audioSender.replaceTrack(newAudioTrack);
                }
            }

            // Kendi yerel videomuzu kamera akışıyla güncelle
            localVideoElement.srcObject = localStream;
        };

    } catch (err) {
        console.error("Ekran paylaşımı iptal edildi veya hata oluştu: ", err);
    }
}
