// public/client.js dosyasındaki createPeerConnection fonksiyonunun YENİ HALİ
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
        const existingVideo = document.getElementById(`video-${userId}`);
        
        // Eğer video elementi yoksa, oluştur ve akışı ata
        if (!existingVideo) {
            addVideoStream(remoteStream, userId, false);
        } else {
            // Eğer element zaten varsa (örneğin ekran paylaşımından sonra), sadece akışı güncelle
            existingVideo.srcObject = remoteStream;
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
