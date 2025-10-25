import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const TIKTOK_METADATA_ENDPOINT =
  process.env.TIKTOK_METADATA_ENDPOINT || 'https://www.tikwm.com/api/';

const API_RESPONSE_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 15000);

// Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const sanitizeFilename = (value = '') =>
  value
    .toString()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || `tiktok-audio-${crypto.randomInt(1000, 9999)}`;

const isTikTokUrl = (value = '') => {
  try {
    const { hostname, protocol } = new URL(value);
    return (
      ['http:', 'https:'].includes(protocol) && hostname.includes('tiktok')
    );
  } catch (error) {
    return false;
  }
};

const encodeSource = (value) =>
  Buffer.from(value, 'utf-8').toString('base64url');

const decodeSource = (value) =>
  Buffer.from(value, 'base64url').toString('utf-8');

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout ?? API_RESPONSE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'TikTok MP3 API is running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/convert', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Une URL TikTok est requise.' });
    }

    if (!isTikTokUrl(url)) {
      return res.status(400).json({
        error:
          "L'URL fournie ne semble pas provenir de TikTok. Merci de vérifier le lien.",
      });
    }

    const upstreamResponse = await fetchWithTimeout(
      TIKTOK_METADATA_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: new URLSearchParams({ url }),
      },
    );

    if (!upstreamResponse.ok) {
      console.error(
        'Metadata upstream error:',
        upstreamResponse.status,
        upstreamResponse.statusText,
      );
      return res.status(502).json({
        error:
          "Impossible de récupérer les informations de la vidéo pour le moment.",
      });
    }

    const payload = await upstreamResponse.json();

    if (payload.code !== 0 || !payload.data?.music) {
      console.error('Unexpected upstream payload:', payload);
      return res.status(400).json({
        error:
          "La conversion n'a pas abouti. Vérifiez que la vidéo est publique et disponible.",
      });
    }

    const { data } = payload;
    const title =
      data.title?.trim() ||
      data.music_info?.title?.trim() ||
      'TikTok Audio';
    const author =
      data.music_info?.author?.trim() ||
      data.author?.nickname?.trim() ||
      'Créateur TikTok';
    const safeTitle = sanitizeFilename(title);
    const encodedSource = encodeSource(data.music);

    res.json({
      success: true,
      audio: {
        title,
        author,
        cover: data.cover,
        duration: data.duration,
        fileName: `${safeTitle}.mp3`,
        downloadPath: `/api/download?source=${encodedSource}&title=${encodeURIComponent(
          safeTitle,
        )}`,
      },
      meta: {
        id: data.id,
        originalUrl: url,
        thumbnail: data.cover,
        videoDuration: data.duration,
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Metadata upstream timeout:', error);
      return res.status(504).json({
        error:
          'La réponse TikTok est trop longue à arriver. Réessayez dans un instant.',
      });
    }

    console.error('Convert error:', error);
    res.status(500).json({
      error:
        "Une erreur inattendue est survenue pendant la conversion. Merci de réessayer.",
    });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { source, title } = req.query;

    if (!source) {
      return res.status(400).json({ error: 'Paramètre source manquant.' });
    }

    let upstreamUrl;
    try {
      upstreamUrl = decodeSource(source);
    } catch (error) {
      return res
        .status(400)
        .json({ error: 'Paramètre source invalide ou corrompu.' });
    }

    const safeTitle = sanitizeFilename(title);

    const upstreamResponse = await fetchWithTimeout(upstreamUrl, {
      timeout: Number(process.env.AUDIO_TIMEOUT_MS ?? 30000),
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      console.error(
        'Audio upstream error:',
        upstreamResponse.status,
        upstreamResponse.statusText,
      );
      return res.status(502).json({
        error:
          'Impossible de récupérer le flux audio. Veuillez réessayer plus tard.',
      });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
    res.setHeader('Cache-Control', 'no-store');

    await pipeline(upstreamResponse.body, res);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Audio upstream timeout:', error);
      return res.status(504).json({
        error:
          'TikTok met trop de temps à répondre. Veuillez réessayer dans quelques instants.',
      });
    }

    console.error('Download error:', error);
    res
      .status(500)
      .json({ error: 'Une erreur est survenue pendant le téléchargement.' });
  }
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Une erreur interne est survenue.' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
