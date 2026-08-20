const schedule = require('node-schedule');

// Menyimpan reminder aktif di memori (hilang jika bot restart)
// Untuk penyimpanan permanen, bisa diganti dengan file JSON atau database.
const activeReminders = new Map();

/**
 * Buat reminder sekali jalan setelah sekian menit.
 * @param {import('whatsapp-web.js').Client} client
 * @param {string} chatId - id chat tujuan (grup atau personal)
 * @param {number} minutes - jarak waktu dalam menit
 * @param {string} message - isi pesan reminder
 */
function setReminderInMinutes(client, chatId, minutes, message) {
  const id = `${chatId}-${Date.now()}`;
  const date = new Date(Date.now() + minutes * 60 * 1000);

  const job = schedule.scheduleJob(date, async () => {
    await client.sendMessage(chatId, `⏰ Pengingat: ${message}`);
    activeReminders.delete(id);
  });

  activeReminders.set(id, job);
  return { id, date };
}

/**
 * Buat reminder harian berulang pada jam:menit tertentu.
 * @param {import('whatsapp-web.js').Client} client
 * @param {string} chatId
 * @param {number} hour - 0-23
 * @param {number} minute - 0-59
 * @param {string} message
 */
function setDailyReminder(client, chatId, hour, minute, message) {
  const id = `${chatId}-daily-${hour}${minute}-${Date.now()}`;
  const rule = new schedule.RecurrenceRule();
  rule.hour = hour;
  rule.minute = minute;

  const job = schedule.scheduleJob(rule, async () => {
    await client.sendMessage(chatId, `⏰ Pengingat harian: ${message}`);
  });

  activeReminders.set(id, job);
  return { id };
}

function cancelAllReminders() {
  for (const job of activeReminders.values()) {
    job.cancel();
  }
  activeReminders.clear();
}

module.exports = { setReminderInMinutes, setDailyReminder, cancelAllReminders, activeReminders };
