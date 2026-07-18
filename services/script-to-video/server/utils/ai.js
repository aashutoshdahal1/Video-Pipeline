// Simple heuristic-based script processor: split scenes and extract keywords.
const natural = require('natural');

const tokenizer = new natural.WordTokenizer();

function extractKeywords(text, maxKeywords = 10) {
  if (!text) return [];
  const words = tokenizer.tokenize(text.toLowerCase()).filter(w => w.length > 2);
  const freq = {};
  words.forEach(w => {
    freq[w] = (freq[w] || 0) + 1;
  });
  const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  return sorted.slice(0, maxKeywords);
}

function splitScenes(text) {
  if (!text) return [];
  // Split by double newlines or sentences longer than 6 words
  const raw = text.split(/\n\n+|\r\n\r\n+/).map(s => s.trim()).filter(Boolean);
  const scenes = [];
  raw.forEach(block => {
    const sentences = block.split(/[\.\!\?]+/).map(s => s.trim()).filter(Boolean);
    sentences.forEach(s => {
      if (s.split(' ').length >= 3) scenes.push(s);
    });
  });
  return scenes.slice(0, 20);
}

module.exports = { extractKeywords, splitScenes };
