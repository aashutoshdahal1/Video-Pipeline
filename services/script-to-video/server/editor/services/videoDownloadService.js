const fs = require('fs');
const axios = require('axios');

/**
 * Downloads a video from a URL to a local file path.
 * - Validates HTTP 200 response (rejects redirects/errors)
 * - 60s timeout to avoid hanging forever
 * - Catches both writer and stream errors
 */
async function downloadVideo(url, outPath) {
  let writer;

  try {
    writer = fs.createWriteStream(outPath);

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5,
      validateStatus: (status) => status === 200,
    });

    return await new Promise((resolve, reject) => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        // Verify the file is not empty
        const stat = fs.statSync(outPath);
        if (stat.size < 512) {
          return reject(new Error(`Downloaded file is suspiciously small (${stat.size} bytes): ${url}`));
        }
        resolve(outPath);
      });

      writer.on('error', (err) => {
        reject(new Error(`Write error for ${url}: ${err.message}`));
      });

      response.data.on('error', (err) => {
        reject(new Error(`Stream error for ${url}: ${err.message}`));
      });
    });
  } catch (err) {
    // Clean up partial file on failure
    if (writer) {
      writer.destroy();
      fs.unlink(outPath, () => {});
    }

    if (err.response) {
      throw new Error(
        `Failed to download video (HTTP ${err.response.status}): ${url}`
      );
    }
    if (err.code === 'ECONNABORTED') {
      throw new Error(`Download timed out after 60s: ${url}`);
    }
    throw err;
  }
}

module.exports = { downloadVideo };