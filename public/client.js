// public/client.js dosyasındaki shareScreen fonksiyonunun YENİ HALİ
async function shareScreen() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        // 1. Yeni akışı (ekran) kendi yerel videomuzda göster
        const localVideoElement = document.getElementById(`video-${socket.id}`).getElementsByTagName('video')[0];
        localVideoElement.srcObject = screenStream;

        // 2. Tüm eşlere (peer) ekran akışını gönder
        const videoTrack = screenStream.getVideoTracks()[0];
        for (const userId in peerConnections) {
            const peer = peerConnections[userId];
            const sender = peer.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        }

        // Ekran paylaşımı durdurulduğunda ne yapılacağını tanımla
        videoTrack.onended = async () => {
            console.log("Ekran paylaşımı durduruldu, kameraya geri dönülüyor.");
            
            // 3. Eski kamera/mikrofon akışını yeniden al
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            // 4. Yeni (kamera) akışı tüm eşlere gönder
            const newVideoTrack = localStream.getVideoTracks()[0];
            const newAudioTrack = localStream.getAudioTracks()[0];

            for (const userId in peerConnections) {
                const peer = peerConnections[userId];
                
                // Video izini değiştir
                const videoSender = peer.getSenders().find(s => s.track.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(newVideoTrack);
                }
                // Ses izini değiştir (isteğe bağlı, gerekirse)
                const audioSender = peer.getSenders().find(s => s.track.kind === 'audio');
                if (audioSender) {
                    await audioSender.replaceTrack(newAudioTrack);
                }
            }

            // 5. Kendi yerel videomuzu kamera akışıyla güncelle
            localVideoElement.srcObject = localStream;
        };

        alert('Ekran paylaşımı başlatıldı. Paylaşımı bitirmek için tarayıcının "Paylaşımı Durdur" çubuğunu kullanın.');

    } catch (err) {
        console.error("Ekran paylaşımı iptal edildi veya hata oluştu: ", err);
    }
}