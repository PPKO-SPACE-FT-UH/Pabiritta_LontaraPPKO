from flask import g
import requests
import os

def kirim_notif_fonnte(target, pesan):
    """
    Fungsi universal untuk mengirim pesan WhatsApp via Fonnte.
    Target bisa Nomor HP (Japri) atau Group ID (Grup).
    """
    url = "https://api.fonnte.com/send"
    
    # Ganti dengan token yang Anda copy di Tahap 2
    # Untuk keamanan nanti (saat deploy), pindahkan token ini ke Environment Variables (.env)
    token_fonnte = "pB3fh5CyWqEuUmAMKVaN"
    
    headers = {
        "Authorization": token_fonnte
    }
    
    data = {
        "target": target, 
        "message": pesan 
    }
    
    try:
        response = requests.post(url, headers=headers, data=data)
        hasil = response.json()
        print(f"[Fonnte Log] Status pengiriman ke {target}: {hasil}")
        return hasil
    except Exception as e:
        print(f"[Fonnte Error] Gagal mengirim WA: {e}")
        return None