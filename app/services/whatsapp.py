import os
import requests

def kirim_notif_fonnte(target, pesan):
    """
    Fungsi universal untuk mengirim pesan WhatsApp via Fonnte.
    Target bisa Nomor HP (Japri) atau Group ID (Grup).
    """
    url = "https://api.fonnte.com/send"
    
    # Mengambil token dari file .env
    token_fonnte = os.getenv("FONNTE_TOKEN")
    
    if not token_fonnte:
        print("[Fonnte Error] Token Fonnte belum diatur di .env")
        return None
        
    headers = {
        "Authorization": token_fonnte
    }
    
    data = {
        "target": target, 
        "message": pesan,
    }
    
    try:
        response = requests.post(url, headers=headers, data=data)
        hasil = response.json()
        print(f"[Fonnte Log] Status pengiriman ke {target}: {hasil}")
        return hasil
    except Exception as e:
        print(f"[Fonnte Error] Gagal mengirim WA: {e}")
        return None


def kirim_notifikasi_ews(nama_lokasi, status, kelembapan, roll, pitch):
    """Format pesan untuk peringatan dini dari Sensor IoT (EWS)."""
    target_group = os.getenv("WA_GROUP_TARGET")
    ikon = "⚠️" if status == "Waspada" else "🚨"
    
    pesan = f"""{ikon} *PERINGATAN DINI POTENSI LONGSOR* {ikon}

Tabe', Bapak/Ibu warga Desa Lonjoboko. 🙏

Mohon perhatian dan kewaspadaannya. Sistem Landslide Early Warning System (EWS) saat ini mendeteksi adanya pergerakan atau kondisi tanah yang melampaui ambang batas normal.

*Berikut adalah detail informasi dari lokasi pantau:*
📍 Lokasi Sensor: {nama_lokasi}
{ikon} Status Peringatan: *{status.upper()}*

*Data Pembacaan Sensor:*
💧 Kelembapan Tanah: {kelembapan}%
📐 Kemiringan Tanah (Roll): {roll}°
📐 Kemiringan Tanah (Pitch): {pitch}°

*Himbauan untuk Warga:*
Mohon agar Bapak/Ibu tetap tenang, tingkatkan kewaspadaan, dan dimohon untuk sementara waktu menghindari aktivitas di sekitar lereng / lokasi tersebut.

*Instruksi untuk KTB:*
Kepada Tim Kelompok Tangguh Bencana (KTB), mohon untuk segera melakukan pengecekan visual ke lokasi kejadian dan memantau perkembangan lebih lanjut melalui Dashboard Pa'biritta.

Keselamatan kita adalah yang utama. LONTARA: Stay aware, everywhere! 🌿"""

    return kirim_notif_fonnte(target_group, pesan)