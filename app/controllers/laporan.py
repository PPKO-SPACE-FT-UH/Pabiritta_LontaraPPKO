"""Blueprint laporan warga (buat & lihat daftar)."""
import cloudinary.uploader
import time
import os
from datetime import datetime, timedelta
from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, current_app
)
from sqlalchemy import or_, desc

from app import db
from app.models.laporan import Laporan
from app.models.aktivitas import Aktivitas
from app.services.whatsapp import kirim_notif_fonnte

laporan_bp = Blueprint("laporan", __name__)

WA_COOLDOWN_MENIT = 20


def _allowed_file(filename: str) -> bool:
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in current_app.config["ALLOWED_EXTENSIONS"]


@laporan_bp.route("/buat", methods=["GET", "POST"])
def buat():
    if request.method == "POST":
        # Validasi field wajib
        kategori = request.form.get("kategori", "").strip()
        deskripsi = request.form.get("deskripsi", "").strip()
        lokasi_label = request.form.get("lokasi_label", "").strip() or None
        latitude = request.form.get("latitude", "").strip()
        longitude = request.form.get("longitude", "").strip()
        nama = request.form.get("nama_pelapor", "").strip()
        dusun = request.form.get("dusun", "").strip()
        no_hp = request.form.get("no_hp", "").strip() or None

        import re

        errors = []
        if kategori not in Laporan.KATEGORI_CHOICES:
            errors.append("Kategori tidak valid.")
        if not deskripsi:
            errors.append("Deskripsi wajib diisi.")
        try:
            lat_f = float(latitude)
            lng_f = float(longitude)
        except ValueError:
            errors.append("Koordinat lokasi tidak valid.")
            lat_f = lng_f = None
        if not nama:
            errors.append("Nama pelapor wajib diisi.")
        if not dusun:
            errors.append("Dusun wajib diisi.")
        if no_hp:
            hp_clean = re.sub(r'[\s\-]', '', no_hp)
            if not re.match(r'^08\d{8,11}$', hp_clean):
                errors.append("Format nomor HP tidak valid. Contoh: 0812-3456-7890.")
        else:
            errors.append("Nomor HP wajib diisi.")

        # Upload foto ke Cloudinary (wajib)
        foto_url = None
        file = request.files.get("foto")
        if not file or not file.filename:
            errors.append("Foto bukti kejadian wajib diunggah.")
        else:
            if not _allowed_file(file.filename):
                errors.append("Format foto harus JPG atau PNG.")
            else:
                try:
                    result = cloudinary.uploader.upload(
                        file,
                        folder="pabiritta/laporan",
                        allowed_formats=["jpg", "jpeg", "png"],
                        quality="auto",
                        fetch_format="auto",
                    )
                    foto_url = result["secure_url"]
                except Exception:
                    errors.append("Gagal mengunggah foto. Silakan coba lagi.")

        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("publik/buat_laporan.html", form=request.form)

        laporan = Laporan(
            foto_url=foto_url,
            latitude=lat_f,
            longitude=lng_f,
            kategori=kategori,
            deskripsi=deskripsi,
            lokasi_label=lokasi_label,
            nama_pelapor=nama,
            dusun=dusun,
            no_hp=no_hp,
            status=Laporan.STATUS_MENUNGGU,
        )
        db.session.add(laporan)
        db.session.flush()

        Aktivitas.log(
            aktor=nama,
            peran="warga",
            aksi="Membuat Laporan Baru",
            keterangan=f"Laporan #{laporan.id} — {kategori} di {lokasi_label or ('Dusun ' + dusun)}",
            laporan_id=laporan.id,
            status_lama=None,
            status_baru=Laporan.STATUS_MENUNGGU,
        )
        db.session.commit()

        if kategori == "Kejadian Longsor":
            nomor_admin = os.getenv("WA_ADMIN_TARGET")

            ambang_waktu = datetime.utcnow() - timedelta(minutes=WA_COOLDOWN_MENIT)
            laporan_terbaru_lain = Laporan.query.filter(
                Laporan.kategori == "Kejadian Longsor",
                Laporan.id != laporan.id,
                Laporan.created_at >= ambang_waktu,
            ).count()

            if laporan_terbaru_lain > 0:
                print(
                    f"[WA Skip] Ada {laporan_terbaru_lain} laporan longsor lain "
                    f"dalam {WA_COOLDOWN_MENIT} menit terakhir. Anti-spam aktif."
                )
            elif nomor_admin:
                total_menunggu = Laporan.query.filter(
                    Laporan.kategori == "Kejadian Longsor",
                    Laporan.status == Laporan.STATUS_MENUNGGU,
                ).count()

                waktu_laporan = datetime.now().strftime("%d-%m-%Y %H:%M")
                link_login = url_for('auth.login', _external=True)

                pesan_admin = (
                    f"🚨 *INFORMASI ADUAN MASYARAKAT: PA'BIRITTA* 🚨\n\n"
                    f"Yth. Tim Admin,\n\n"
                    f"Sistem telah menerima laporan aduan masyarakat terkait Kejadian Tanah Longsor. "
                    f"Berikut adalah rincian informasi dari pelapor:\n\n"
                    f"👤 Nama Pelapor: {nama}\n"
                    f"📍 Titik Lokasi: {lokasi_label or dusun}\n"
                    f"⏰ Waktu Laporan: {waktu_laporan}\n\n"
                    f"Mohon untuk segera ditindaklanjuti. Silakan login ke Dashboard Pa'Biritta "
                    f"guna memverifikasi laporan ini, melihat bukti lampiran, serta menentukan "
                    f"status penanganan darurat.\n\n"
                    f"🔗 Link Dashboard: {link_login}\n\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"📊 *Ringkasan Antrian Verifikasi*\n"
                    f"Saat ini terdapat *{total_menunggu} laporan longsor* yang berstatus menunggu "
                    f"verifikasi admin di dashboard.\n\n"
                    f"_Catatan: Untuk menjaga fokus penanganan dan menghindari notifikasi berulang "
                    f"atas kejadian yang sama, WhatsApp susulan tidak akan dikirim selama "
                    f"{WA_COOLDOWN_MENIT} menit ke depan. Mohon pantau dashboard secara berkala "
                    f"untuk laporan tambahan yang mungkin masuk._\n\n"
                    f"Terima kasih atas respons cepat Anda. Keselamatan warga adalah prioritas utama!\n\n"
                    f"_Pesan ini dibuat otomatis oleh Sistem Layanan Aduan Bencana Pa'Biritta LONTARA._"
                )

                kirim_notif_fonnte(target=nomor_admin, pesan=pesan_admin)

        flash("Laporan berhasil dikirim. Terima kasih telah melapor!", "success")
        return redirect(url_for("laporan.daftar"))

    return render_template("publik/buat_laporan.html", form={})

@laporan_bp.route("/")
def daftar():
    q = request.args.get("q", "").strip()
    kategori = request.args.get("kategori", "").strip()
    status = request.args.get("status", "").strip()
    page = max(1, request.args.get("page", 1, type=int))
    per_page = 10

    query = Laporan.query.filter(Laporan.status != Laporan.STATUS_MENUNGGU)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Laporan.deskripsi.ilike(like),
                Laporan.lokasi_label.ilike(like),
                Laporan.dusun.ilike(like),
                Laporan.nama_pelapor.ilike(like),
            )
        )
    if kategori and kategori in Laporan.KATEGORI_CHOICES:
        query = query.filter_by(kategori=kategori)
    if status and status in Laporan.STATUS_CHOICES:
        query = query.filter_by(status=status)

    total = query.count()
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = min(page, total_pages)

    laporans = (
        query.order_by(desc(Laporan.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return render_template(
        "publik/laporan_warga.html",
        laporans=laporans,
        q=q,
        kategori=kategori,
        status=status,
        kategori_choices=Laporan.KATEGORI_CHOICES,
        status_choices=[
            Laporan.STATUS_PROSES,
            Laporan.STATUS_TINDAK_LANJUT,
            Laporan.STATUS_SELESAI,
            Laporan.STATUS_DITOLAK,
        ],
        page=page,
        total_pages=total_pages,
        total=total,
        per_page=per_page,
    )


@laporan_bp.route("/<int:laporan_id>")
def detail(laporan_id):
    laporan = Laporan.query.get_or_404(laporan_id)
    if laporan.status == Laporan.STATUS_MENUNGGU:
        from flask import abort
        abort(404)
    return render_template("publik/detail_laporan.html", laporan=laporan)