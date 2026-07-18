const axios = require('axios');

const DOODLEGEN_URL = process.env.DOODLEGEN_URL || 'http://localhost:3000';

async function generateImages(prompt, aspect = '16:9', count = 1) {
  const response = await axios.post(`${DOODLEGEN_URL}/api/generate/image`, {
    prompt,
    aspect,
    count: Math.min(count, 4),
    tokens: []
  }, { timeout: 60000 });

  if (!response.data.urls || !response.data.urls.length) {
    throw new Error('No images returned from doodlegen');
  }

  return response.data.urls;
}

module.exports = { generateImages };
