const fetch = require('node-fetch');

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/**
 * Kirim pertanyaan ke Claude API dan kembalikan jawabannya sebagai teks.
 * @param {string} prompt - pertanyaan/pesan dari user
 * @param {Array} history - riwayat percakapan singkat (opsional), format [{role, content}]
 */
async function askAI(prompt, history = []) {
  if (!API_KEY) {
    return 'Fitur AI belum aktif. Admin perlu mengisi ANTHROPIC_API_KEY di file .env terlebih dahulu.';
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: 'Kamu adalah asisten WhatsApp yang membalas dengan singkat, jelas, dan ramah dalam Bahasa Indonesia.',
        messages: [...history, { role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return 'Maaf, ada masalah saat menghubungi AI. Coba lagi sebentar ya.';
    }

    const data = await response.json();
    const textBlock = data.content.find((c) => c.type === 'text');
    return textBlock ? textBlock.text : 'Maaf, aku tidak dapat balasan dari AI kali ini.';
  } catch (err) {
    console.error('Gagal memanggil AI:', err);
    return 'Maaf, terjadi kesalahan saat menghubungi AI.';
  }
}

module.exports = { askAI };
