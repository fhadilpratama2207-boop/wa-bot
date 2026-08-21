require('dotenv').config();
const { execSync } = require('child_process');
const http = require('http');
const qrcodeTerminal = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { askAI } = require('./ai');
const { setReminderInMinutes, setDailyReminder } = require('./reminder');

// Cari lokasi Chromium yang sudah terinstall di server,
// supaya tidak pakai Chrome bawaan Puppeteer yang sering error di Railway.
function findChromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = ['chromium', 'chromium-browser', 'google-chrome-stable'];
  for (const bin of candidates) {
    try {
      const path = execSync(`which ${bin}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      if (path) return path;
    } catch (e) {
      // lanjut coba kandidat berikutnya
    }
  }
  return undefined; // biarkan Puppeteer pakai default kalau tidak ketemu (misal saat jalan di lokal/Termux)
}

const chromiumPath = findChromiumPath();
console.log('Menggunakan Chromium di:', chromiumPath || '(default bawaan Puppeteer)');

// Jika WHATSAPP_PHONE_NUMBER diisi di Variables, bot pakai kode pairing (ketik manual di WhatsApp)
// daripada scan QR. Format nomor: kode negara + nomor tanpa + atau 0 di depan.
// Contoh Indonesia: 6281234567890
const phoneNumberForPairing = process.env.WHATSAPP_PHONE_NUMBER;
let pairingRequested = false;
let botStatus = 'Menyiapkan bot...';

// --- Web server sederhana untuk melihat status/kode pairing lewat browser ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="4">
        <title>Status Bot WhatsApp</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 40px 20px; background: #111; color: #fff; }
        </style>
      </head>
      <body>
        <h2>${botStatus}</h2>
        <p style="color:#888; font-size:13px;">Halaman ini auto-refresh tiap 4 detik.</p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Web server jalan di port ${PORT}.`);
});

const client = new Client({
  authStrategy: new LocalAuth(), // menyimpan sesi login agar tidak perlu login ulang tiap kali
  puppeteer: {
    headless: true,
    executablePath: chromiumPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

client.on('qr', async (qr) => {
  if (phoneNumberForPairing) {
    if (!pairingRequested) {
      pairingRequested = true;
      try {
        const code = await client.requestPairingCode(phoneNumberForPairing);
        console.log('==============================');
        console.log('KODE PAIRING KAMU:', code);
        console.log('==============================');
        botStatus = `Kode pairing kamu: ${code}`;
      } catch (err) {
        console.error('Gagal membuat kode pairing:', err);
        botStatus = 'Gagal membuat kode pairing, cek nomor di WHATSAPP_PHONE_NUMBER.';
      }
    }
    return; // tidak perlu tampilkan QR kalau pakai mode pairing code
  }

  console.log('Scan QR code ini dengan WhatsApp di HP kamu:');
  qrcodeTerminal.generate(qr, { small: true });
  botStatus = 'Menunggu scan QR code (lihat Deploy Logs)...';
});

client.on('ready', () => {
  console.log('✅ Bot WhatsApp siap digunakan!');
  botStatus = '✅ Bot WhatsApp sudah aktif dan terhubung!';
});

client.on('auth_failure', (msg) => {
  console.error('❌ Autentikasi gagal:', msg);
  botStatus = '❌ Autentikasi gagal, coba deploy ulang.';
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Bot terputus:', reason);
  botStatus = '⚠️ Bot terputus dari WhatsApp.';
});

const HELP_TEXT = `*Menu Bot*
!menu - tampilkan menu ini
!info - info tentang bot ini
!ping - cek bot masih hidup
!ai <pertanyaan> - tanya ke AI
!reminder <menit> <pesan> - reminder sekali (contoh: !reminder 10 minum obat)
!reminderharian <jam:menit> <pesan> - reminder tiap hari (contoh: !reminderharian 07:00 olahraga)`;

client.on('message', async (msg) => {
  const text = msg.body.trim();
  const chatId = msg.from;

  // Abaikan pesan yang bukan command supaya tidak spam auto-reply ke semua pesan
  if (!text.startsWith('!')) return;

  const [rawCmd, ...args] = text.split(' ');
  const cmd = rawCmd.toLowerCase();

  try {
    switch (cmd) {
      case '!menu':
        await msg.reply(HELP_TEXT);
        break;

      case '!info':
        await msg.reply('Bot ini dibuat dengan whatsapp-web.js. Fitur: command custom, reminder, dan tanya AI. Ketik !menu untuk lihat semua perintah.');
        break;

      case '!ping':
        await msg.reply('Pong! Bot aktif ✅');
        break;

      case '!ai': {
        const question = args.join(' ');
        if (!question) {
          await msg.reply('Format: !ai <pertanyaan kamu>\nContoh: !ai jelaskan apa itu fotosintesis');
          break;
        }
        await msg.reply('Sebentar, aku carikan jawabannya...');
        const answer = await askAI(question);
        await msg.reply(answer);
        break;
      }

      case '!reminder': {
        const minutes = parseInt(args[0], 10);
        const message = args.slice(1).join(' ');
        if (!minutes || !message) {
          await msg.reply('Format: !reminder <menit> <pesan>\nContoh: !reminder 15 rapat online');
          break;
        }
        setReminderInMinutes(client, chatId, minutes, message);
        await msg.reply(`✅ Oke, aku akan mengingatkan "${message}" dalam ${minutes} menit.`);
        break;
      }

      case '!reminderharian': {
        const timeStr = args[0];
        const message = args.slice(1).join(' ');
        const match = timeStr && timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (!match || !message) {
          await msg.reply('Format: !reminderharian <jam:menit> <pesan>\nContoh: !reminderharian 07:00 olahraga pagi');
          break;
        }
        const hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        setDailyReminder(client, chatId, hour, minute, message);
        await msg.reply(`✅ Reminder harian jam ${timeStr} untuk "${message}" sudah dipasang.`);
        break;
      }

      default:
        await msg.reply('Perintah tidak dikenali. Ketik !menu untuk lihat daftar perintah.');
    }
  } catch (err) {
    console.error('Error saat memproses command:', err);
    await msg.reply('Maaf, terjadi kesalahan saat memproses perintahmu.');
  }
});

client.initialize();
      
