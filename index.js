require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { askAI } = require('./ai');
const { setReminderInMinutes, setDailyReminder } = require('./reminder');

const client = new Client({
  authStrategy: new LocalAuth(), // menyimpan sesi login agar tidak perlu scan QR tiap kali
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('Scan QR code ini dengan WhatsApp di HP kamu:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot WhatsApp siap digunakan!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Autentikasi gagal:', msg);
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Bot terputus:', reason);
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
