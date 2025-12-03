// client.js
const videoGrid = document.getElementById('video-grid');
const joinForm = document.getElementById('join-form');
const controlsDiv = document.getElementById('controls');

// ÖNEMLİ: Render.com'un size verdiği URL'yi buraya yapıştırın.
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
        createPeerConnection(newUserId, true); 
    });

    socket.on('signal', async (data) => {
        const { from, signalData } = data;
        let peer = peerConnections[from];

        if (!peer) {
            peer = createPeerConnection(from, false); 
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

    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
    });

    peer.ontrack = (event) => {
        if (document.getElementById(`video-${userId}`)) return; 

        const remoteStream = event.streams[0];
        addVideoStream(remoteStream, userId, false);
    };

    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                to: userId,
                signalData: { candidate: event.candidate }
            });
        }
    };

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

    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    
    const nameTag = document.createElement('p');
    nameTag.innerText = isLocal ? 'BEN' : `Kullanıcı: ${userId.substring(0, 4)}...`;
    nameTag.style.color = 'white';
    nameTag.style.position = 'absolute';
    nameTag.style.bottom = '5px';
    nameTag.style.left = '5px';
    nameTag.style.zIndex = '10';

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

        const localVideoElement = document.getElementById(`video-${socket.id}`).getElementsByTagName('video')[0];
        localVideoElement.srcObject = screenStream;

        const videoTrack = screenStream.getVideoTracks()[0];
        for (const userId in peerConnections) {
            const peer = peerConnections[userId];
            const sender = peer.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        }

        videoTrack.onended = async () => {
            console.log("Ekran paylaşımı durduruldu, kameraya geri dönülüyor.");
            
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            const newVideoTrack = localStream.getVideoTracks()[0];
            const newAudioTrack = localStream.getAudioTracks()[0];

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

            localVideoElement.srcObject = localStream;
        };

    } catch (err) {
        console.error("Ekran paylaşımı iptal edildi veya hata oluştu: ", err);
    }
}
