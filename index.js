const {
  DisconnectReason,
  makeWASocket,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const express = require("express");
const fs = require("fs");
const path = require("path");

const sessionDir = path.resolve("auth_info_bailys");
const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

let sock;
let qrCode = null; // Variable untuk menyimpan kode QR

// Fungsi untuk menghapus direktori sesi
function deleteSession() {
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    console.log("Direktori sesi dihapus.");
  } else {
    console.log("Direktori sesi tidak ada.");
  }
}

// Fungsi untuk menghubungkan ke WhatsApp
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_bailys");
  sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("Kode QR baru diterima.");
      qrCode = qr; // Simpan QR Code untuk ditampilkan melalui endpoint
    }
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log(
        "Koneksi terputus karena",
        lastDisconnect?.error,
        ", mencoba untuk terhubung kembali:",
        shouldReconnect
      );
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        qrCode = null; // Hapus QR Code jika sesi benar-benar logout
        deleteSession(); // Hapus sesi jika logout
        connectToWhatsApp(); // Mulai ulang koneksi
      }
    } else if (connection === "open") {
      console.log("Koneksi terbuka");
      qrCode = null; // Hapus QR Code setelah berhasil login
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

// Endpoint untuk mengirim pesan
app.post("/send-message", async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).send("Nomor dan pesan harus disertakan.");
  }

  try {
    await sock.sendMessage(number + "@s.whatsapp.net", { text: message });
    res.send("Pesan terkirim.");
  } catch (error) {
    res.status(500).send("Gagal mengirim pesan: " + error.message);
  }
});

// Endpoint untuk mengecek nomor WhatsApp
app.post("/check-number", async (req, res) => {
  try {
    const { number } = req.body;

    if (!number) {
      return res
        .status(400)
        .json({ success: false, message: "Nomor harus disertakan." });
    }

    const waNumber = number.includes("@s.whatsapp.net")
      ? number
      : `${number}@s.whatsapp.net`;

    const [result] = await sock.onWhatsApp(waNumber);

    if (result?.exists) {
      res.json({
        success: true,
        message: "Nomor terdaftar di WhatsApp",
        exists: true,
      });
    } else {
      res.json({
        success: false,
        message: "Nomor tidak terdaftar di WhatsApp",
        exists: false,
      });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan",
      error: error.message,
    });
  }
});

// Endpoint untuk mendapatkan QR Code jika tersedia
app.get("/", (req, res) => {
  if (qrCode) {
    
    res.json({ success: true, qrCode });
  } else {
    res.json({
      success: false,
      message: "Tidak ada QR Code tersedia saat ini.",
    });
  }
});

// Hapus sesi dan mulai ulang koneksi WhatsApp saat server dimulai
deleteSession();
connectToWhatsApp().then(() => {
  app.listen(port,'0.0.0.0', () => {
    console.log(`Server berjalan di http://localhost:${port}`);
  });
});
