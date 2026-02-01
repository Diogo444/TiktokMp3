import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import ffmpegStaticPath from 'ffmpeg-static';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const TIKTOK_METADATA_ENDPOINT =
  process.env.TIKTOK_METADATA_ENDPOINT || 'https://www.tikwm.com/api/';

const API_RESPONSE_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 15000);
const SUPPORTED_FORMATS = new Set(['mp3', 'mp4']);

// Messages d'erreur centralisés pour cohérence
const ERROR_MESSAGES = {
  urlRequired: 'Une URL TikTok ou YouTube est requise.',
  invalidFormat: 'Format invalide. Seuls MP3 et MP4 sont supportés.',
  invalidUrl: "L'URL fournie n'est pas reconnue comme TikTok ou YouTube. Vérifiez le lien et réessayez.",
  tiktokMetadataFailed: 'Impossible de récupérer les informations TikTok. Le service est peut-être temporairement indisponible.',
  tiktokVideoPrivate: 'Cette vidéo TikTok semble privée ou supprimée. Vérifiez qu\'elle est accessible publiquement.',
  tiktokAudioNotFound: 'Impossible d\'extraire l\'audio de cette vidéo TikTok.',
  tiktokVideoNotFound: 'Impossible d\'extraire la vidéo TikTok.',
  ytdlpMissing: 'yt-dlp n\'est pas install\u00e9 sur le serveur. Contactez l\'administrateur.',
  youtubeIdInvalid: 'Impossible d\'identifier la vid\u00e9o YouTube. V\u00e9rifiez le lien (formats accept\u00e9s: watch?v=..., youtu.be/..., shorts/...).',
  youtubeMetadataFailed: 'Impossible de récupérer les informations YouTube. Réessayez dans quelques instants.',
  youtubeStreamFailed: 'Impossible de récupérer les flux audio/vidéo YouTube.',
  ffmpegMissing: 'Le convertisseur audio (FFmpeg) n\'est pas disponible sur le serveur. Contactez l\'administrateur.',
  downloadTimeout: 'Le téléchargement a pris trop de temps. Réessayez dans quelques instants.',
  downloadFailed: 'Échec du téléchargement. Le service est peut-être surchargé.',
  serverError: 'Une erreur inattendue est survenue. Merci de réessayer.',
  sourceInvalid: 'Le lien de téléchargement est invalide ou expiré. Relancez la conversion.',
};

// Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware pour ajouter des headers de performance
app.use((req, res, next) => {
  // Ajouter le timing de la requête
  req.startTime = Date.now();
  
  // Headers de cache pour les APIs
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  next();
});

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

const isYouTubeUrl = (value = '') => {
  try {
    const { hostname, protocol } = new URL(value);
    if (!['http:', 'https:'].includes(protocol)) {
      return false;
    }
    const host = hostname.toLowerCase();
    return (
      host === 'youtu.be' ||
      host.endsWith('.youtu.be') ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'music.youtube.com' ||
      host.endsWith('.music.youtube.com')
    );
  } catch (error) {
    return false;
  }
};

const extractYouTubeVideoId = (value = '') => {
  try {
    const candidate = new URL(value);
    const host = candidate.hostname.toLowerCase();

    let id = null;
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      id = candidate.pathname.replace(/^\/+/, '').split('/')[0] || null;
    } else {
      id = candidate.searchParams.get('v');
      if (!id) {
        const path = candidate.pathname.replace(/^\/+/, '');
        const segments = path.split('/');
        const kind = segments[0];
        if (kind === 'shorts' || kind === 'embed' || kind === 'live') {
          id = segments[1] || null;
        }
      }
    }

    if (!id) {
      return null;
    }
    const trimmed = id.trim();
    return /^[a-zA-Z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
  } catch (error) {
    return null;
  }
};

const detectPlatform = (value = '') => {
  if (isTikTokUrl(value)) {
    return 'tiktok';
  }
  if (isYouTubeUrl(value)) {
    return 'youtube';
  }
  return null;
};

const encodeSource = (value) =>
  Buffer.from(JSON.stringify(value), 'utf-8').toString('base64url');

const decodeSource = (value) => {
  const decoded = Buffer.from(value, 'base64url').toString('utf-8');
  try {
    return JSON.parse(decoded);
  } catch (error) {
    return { platform: 'tiktok', url: decoded };
  }
};

const resolveFfmpegPath = () => {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }

  if (
    typeof ffmpegStaticPath === 'string' &&
    ffmpegStaticPath.length > 0 &&
    existsSync(ffmpegStaticPath)
  ) {
    return ffmpegStaticPath;
  }

  return 'ffmpeg';
};

const isFfmpegAvailable = (ffmpegPath) => {
  if (!ffmpegPath || typeof ffmpegPath !== 'string') {
    return false;
  }

  const isLikelyPath =
    ffmpegPath.includes('/') ||
    ffmpegPath.includes('\\') ||
    ffmpegPath.toLowerCase().endsWith('.exe');

  if (isLikelyPath && !existsSync(ffmpegPath)) {
    return false;
  }

  const check = spawnSync(ffmpegPath, ['-version'], { stdio: 'ignore' });
  return !check.error && check.status === 0;
};

const isCommandAvailable = (command) => {
  try {
    const check = spawnSync(command, ['--version'], { stdio: 'ignore' });
    return !check.error && check.status === 0;
  } catch {
    return false;
  }
};

const YOUTUBE_PROVIDER = (() => {
  const configured = (process.env.YOUTUBE_PROVIDER || '').trim().toLowerCase();
  if (configured) {
    return configured;
  }
  return isCommandAvailable('yt-dlp') ? 'yt-dlp' : 'ytdl';
})();

const runCommand = async (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    const timeoutMs = Number(options.timeoutMs ?? 30000);
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${command} timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(
          `${command} exited with code ${code}${stderr ? `: ${stderr}` : ''}`,
        );
        error.code = code;
        error.stderr = stderr;
        reject(error);
      }
    });
  });

const toFfmpegHeadersValue = (headers = {}) => {
  const pairs = Object.entries(headers)
    .filter(([key, value]) => key && typeof value === 'string' && value.trim())
    .map(([key, value]) => `${key}: ${value.replace(/[\r\n]+/g, ' ').trim()}\r\n`);
  return pairs.join('');
};

const isYouTubeBotProtectionError = (stderr = '') =>
  typeof stderr === 'string' &&
  /sign in to confirm you.?re not a bot/i.test(stderr);

const getYtDlpInfo = async (videoUrl, requestedFormat) => {
  const formatSelector =
    requestedFormat === 'mp4'
      ? 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b'
      : 'ba[ext=m4a]/ba/b';

  const potProviderUrl = process.env.POT_PROVIDER_URL || '';
  const args = ['-J', '--no-playlist', '--skip-download', '-f', formatSelector];

  const cookiesFileFromEnv = (process.env.YTDLP_COOKIES_FILE || '').trim();
  const defaultCookiesFile = '/run/secrets/youtube-cookies.txt';
  const cookiesFile =
    cookiesFileFromEnv ||
    (existsSync(defaultCookiesFile) ? defaultCookiesFile : '');

  if (cookiesFile) {
    if (existsSync(cookiesFile)) {
      args.push('--cookies', cookiesFile);
    } else {
      console.warn(
        `YTDLP_COOKIES_FILE is set but file does not exist: ${cookiesFile}`,
      );
    }
  }
   
  // Add PO Token provider if configured
  if (potProviderUrl) {
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${potProviderUrl}`);
  }
  
  args.push(videoUrl);

  const { stdout, stderr } = await runCommand(
    'yt-dlp',
    args,
    { timeoutMs: Number(process.env.YTDLP_TIMEOUT_MS ?? 45000) },
  );

  if (stderr?.trim()) {
    console.error('yt-dlp stderr:', stderr.trim());
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    console.error('yt-dlp JSON parse error:', error);
    throw new Error('yt-dlp did not return valid JSON');
  }
};

const normalizeYtDlpInputs = (payload, fallbackHeaders) => {
  const topHeaders = payload?.http_headers || payload?.headers || fallbackHeaders || {};
  const formats = payload?.requested_formats?.length
    ? payload.requested_formats
    : payload?.url
      ? [payload]
      : [];

  return formats
    .map((fmt) => ({
      url: fmt?.url,
      headers: fmt?.http_headers || fmt?.headers || topHeaders,
      vcodec: (fmt?.vcodec || '').toString(),
      acodec: (fmt?.acodec || '').toString(),
    }))
    .filter((entry) => typeof entry.url === 'string' && entry.url.length > 0);
};

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
  res.json({ message: 'TikTok / YouTube MP3 API is running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/convert', async (req, res) => {
  const startTime = Date.now();
  try {
    const { url, format: rawFormat } = req.body;

    if (!url) {
      return res
        .status(400)
        .json({ error: ERROR_MESSAGES.urlRequired, code: 'URL_REQUIRED' });
    }

    const format = (rawFormat || 'mp3').toString().trim().toLowerCase();
    if (!SUPPORTED_FORMATS.has(format)) {
      return res.status(400).json({
        error: ERROR_MESSAGES.invalidFormat,
        code: 'INVALID_FORMAT',
      });
    }

    const platform = detectPlatform(url);
    if (!platform) {
      return res.status(400).json({
        error: ERROR_MESSAGES.invalidUrl,
        code: 'INVALID_URL',
      });
    }

    if (platform === 'tiktok') {
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
          error: ERROR_MESSAGES.tiktokMetadataFailed,
          code: 'TIKTOK_METADATA_FAILED',
        });
      }

      const payload = await upstreamResponse.json();

      if (payload.code !== 0 || !payload.data) {
        console.error('Unexpected upstream payload:', payload);
        return res.status(400).json({
          error: ERROR_MESSAGES.tiktokVideoPrivate,
          code: 'TIKTOK_VIDEO_PRIVATE',
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

      const tiktokSourceUrl =
        format === 'mp4'
          ? data.hdplay || data.play || data.wmplay || data.video || null
          : data.music || null;

      if (!tiktokSourceUrl) {
        return res.status(400).json({
          error: format === 'mp4' ? ERROR_MESSAGES.tiktokVideoNotFound : ERROR_MESSAGES.tiktokAudioNotFound,
          code: format === 'mp4' ? 'TIKTOK_VIDEO_NOT_FOUND' : 'TIKTOK_AUDIO_NOT_FOUND',
        });
      }

      const safeTitle = sanitizeFilename(title);
      const encodedSource = encodeSource({
        platform: 'tiktok',
        format,
        url: tiktokSourceUrl,
      });

      res.json({
        success: true,
        audio: {
          platform,
          format,
          title,
          author,
          cover: data.cover,
          duration: data.duration,
          fileName: `${safeTitle}.${format}`,
          downloadPath: `/api/download?source=${encodedSource}&title=${encodeURIComponent(
            safeTitle,
          )}`,
        },
        meta: {
          id: data.id,
          originalUrl: url,
          thumbnail: data.cover,
          videoDuration: data.duration,
          processingTimeMs: Date.now() - startTime,
        },
      });
      return;
    }

    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.youtubeIdInvalid,
        code: 'YOUTUBE_ID_INVALID',
      });
    }

    const youtubeWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // yt-dlp est requis pour YouTube (ytdl-core est déprécié/archivé)
    if (!isCommandAvailable('yt-dlp')) {
      console.error('yt-dlp is not available on this server');
      return res.status(500).json({
        error: ERROR_MESSAGES.ytdlpMissing,
        code: 'YTDLP_MISSING',
      });
    }

    let title = 'YouTube Audio';
    let author = 'YouTube';
    let duration = undefined;
    let cover = undefined;

    try {
      const ytdlpPayload = await getYtDlpInfo(youtubeWatchUrl, format);
      title = ytdlpPayload?.title?.trim?.() || title;
      author =
        ytdlpPayload?.uploader?.trim?.() ||
        ytdlpPayload?.channel?.trim?.() ||
        ytdlpPayload?.creator?.trim?.() ||
        author;
      duration =
        typeof ytdlpPayload?.duration === 'number'
          ? ytdlpPayload.duration
          : duration;
      cover =
        ytdlpPayload?.thumbnail ||
        ytdlpPayload?.thumbnails?.at(-1)?.url ||
        ytdlpPayload?.thumbnails?.[0]?.url ||
        cover;
    } catch (error) {
      console.error('yt-dlp metadata error:', error);
      if (isYouTubeBotProtectionError(error?.stderr)) {
        return res.status(403).json({
          error:
            'YouTube demande une validation "anti-bot" depuis ce serveur. Configurez des cookies (YTDLP_COOKIES_FILE) ou utilisez une IP/réseau différent, puis réessayez.',
          code: 'YOUTUBE_AUTH_REQUIRED',
        });
      }
      return res.status(502).json({
        error: ERROR_MESSAGES.youtubeMetadataFailed,
        code: 'YOUTUBE_METADATA_FAILED',
      });
    }

    const safeTitle = sanitizeFilename(title);
    const encodedSource = encodeSource({ platform: 'youtube', format, id: videoId });

    res.json({
      success: true,
      audio: {
        platform,
        format,
        title,
        author,
        cover,
        duration,
        fileName: `${safeTitle}.${format}`,
        downloadPath: `/api/download?source=${encodedSource}&title=${encodeURIComponent(
          safeTitle,
        )}`,
      },
      meta: {
        id: videoId,
        originalUrl: url,
        videoDuration: duration,
        processingTimeMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Metadata upstream timeout:', error);
      return res.status(504).json({
        error: ERROR_MESSAGES.downloadTimeout,
        code: 'TIMEOUT',
      });
    }

    console.error('Convert error:', error);
    res.status(500).json({
      error: ERROR_MESSAGES.serverError,
      code: 'SERVER_ERROR',
    });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { source, title } = req.query;

    if (!source) {
      return res.status(400).json({ error: ERROR_MESSAGES.sourceInvalid, code: 'SOURCE_MISSING' });
    }

    let payload;
    try {
      payload = decodeSource(source);
    } catch (error) {
      return res
        .status(400)
        .json({ error: ERROR_MESSAGES.sourceInvalid, code: 'SOURCE_INVALID' });
    }

    const safeTitle = sanitizeFilename(title);
    const format = payload?.format === 'mp4' ? 'mp4' : 'mp3';

    if (payload?.platform === 'youtube') {
      const videoId = payload?.id;
      if (!videoId || typeof videoId !== 'string') {
        return res.status(400).json({
          error: ERROR_MESSAGES.sourceInvalid,
          code: 'YOUTUBE_SOURCE_INVALID',
        });
      }

      const ffmpegPath = resolveFfmpegPath();
      if (!isFfmpegAvailable(ffmpegPath)) {
        return res.status(500).json({
          error: ERROR_MESSAGES.ffmpegMissing,
          code: 'FFMPEG_MISSING',
        });
      }
      const inputUrl = `https://www.youtube.com/watch?v=${videoId}`;

      if (YOUTUBE_PROVIDER === 'yt-dlp' && isCommandAvailable('yt-dlp')) {
        let ytdlpPayload;
        try {
          ytdlpPayload = await getYtDlpInfo(inputUrl, format);
        } catch (error) {
          console.error('yt-dlp info error:', error);
          if (isYouTubeBotProtectionError(error?.stderr)) {
            return res.status(403).json({
              error:
                'YouTube demande une validation "anti-bot" depuis ce serveur. Configurez des cookies (YTDLP_COOKIES_FILE) ou utilisez une IP/réseau différent, puis réessayez.',
              code: 'YOUTUBE_AUTH_REQUIRED',
            });
          }
          return res.status(502).json({
            error: ERROR_MESSAGES.youtubeStreamFailed,
            code: 'YOUTUBE_STREAM_FAILED',
          });
        }

        const inputs = normalizeYtDlpInputs(ytdlpPayload);
        if (inputs.length === 0) {
          return res.status(502).json({
            error: ERROR_MESSAGES.youtubeStreamFailed,
            code: 'YOUTUBE_STREAM_EMPTY',
          });
        }

        const audioBitrate = process.env.YOUTUBE_AUDIO_BITRATE || '192k';
        const ffmpegArgs = ['-hide_banner', '-loglevel', 'error'];

        if (format === 'mp4') {
          const videoInput =
            inputs.find((entry) => entry.vcodec && entry.vcodec !== 'none') ||
            inputs[0];
          const audioInput =
            inputs.find((entry) => entry.acodec && entry.acodec !== 'none' && entry.vcodec === 'none') ||
            inputs.find((entry) => entry.acodec && entry.acodec !== 'none') ||
            null;

          const selectedInputs = audioInput && audioInput !== videoInput ? [videoInput, audioInput] : [videoInput];

          for (const selected of selectedInputs) {
            const headersValue = toFfmpegHeadersValue(selected.headers);
            if (headersValue) {
              ffmpegArgs.push('-headers', headersValue);
            }
            ffmpegArgs.push('-i', selected.url);
          }

          const videoCodec = (videoInput?.vcodec || '').toLowerCase();
          const audioCodec = (audioInput?.acodec || '').toLowerCase();
          const isH264 = videoCodec.includes('avc1') || videoCodec.includes('h264');
          const isAac = audioCodec.includes('mp4a') || audioCodec.includes('aac');

          const videoArgs = isH264
            ? ['-c:v', 'copy']
            : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'];
          const audioArgs = audioInput
            ? isAac
              ? ['-c:a', 'copy']
              : ['-c:a', 'aac', '-b:a', audioBitrate]
            : ['-an'];

          if (audioInput && selectedInputs.length === 2) {
            ffmpegArgs.push('-map', '0:v:0', '-map', '1:a:0');
          }

          ffmpegArgs.push(
            ...videoArgs,
            ...audioArgs,
            '-shortest',
            '-f',
            'mp4',
            '-movflags',
            'frag_keyframe+empty_moov',
            'pipe:1',
          );

          const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${safeTitle}.mp4"`,
          );
          res.setHeader('Cache-Control', 'no-store');

          ffmpeg.stderr.on('data', (chunk) => {
            const message = chunk?.toString?.() || '';
            if (message.trim()) {
              console.error('ffmpeg stderr:', message.trim());
            }
          });

          ffmpeg.on('error', (error) => {
            console.error('ffmpeg spawn error:', error);
            res.destroy(error);
          });

          res.on('close', () => {
            if (!res.writableEnded) {
              try {
                ffmpeg.kill('SIGKILL');
              } catch {
                // ignore
              }
            }
          });

          const outputPipeline = pipeline(ffmpeg.stdout, res);
          const ffmpegExit = new Promise((resolve, reject) => {
            ffmpeg.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`ffmpeg exited with code ${code}`));
              }
            });
          });

          await Promise.all([outputPipeline, ffmpegExit]).catch((error) => {
            console.error('YouTube MP4 (yt-dlp) error:', error);
            if (!res.headersSent) {
              res.status(502).json({
                error: 'La conversion vidéo YouTube a échoué. La vidéo est peut-être protégée ou trop longue.',
                code: 'YOUTUBE_MP4_FAILED',
              });
            } else {
              res.destroy(error);
            }
          });

          return;
        }

        const audioInput =
          inputs.find((entry) => entry.acodec && entry.acodec !== 'none') || inputs[0];

        const headersValue = toFfmpegHeadersValue(audioInput.headers);
        if (headersValue) {
          ffmpegArgs.push('-headers', headersValue);
        }

        ffmpegArgs.push(
          '-i',
          audioInput.url,
          '-vn',
          '-acodec',
          'libmp3lame',
          '-b:a',
          audioBitrate,
          '-f',
          'mp3',
          'pipe:1',
        );

        const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeTitle}.mp3"`,
        );
        res.setHeader('Cache-Control', 'no-store');

        ffmpeg.stderr.on('data', (chunk) => {
          const message = chunk?.toString?.() || '';
          if (message.trim()) {
            console.error('ffmpeg stderr:', message.trim());
          }
        });

        ffmpeg.on('error', (error) => {
          console.error('ffmpeg spawn error:', error);
          res.destroy(error);
        });

        res.on('close', () => {
          if (!res.writableEnded) {
            try {
              ffmpeg.kill('SIGKILL');
            } catch {
              // ignore
            }
          }
        });

        const outputPipeline = pipeline(ffmpeg.stdout, res);
        const ffmpegExit = new Promise((resolve, reject) => {
          ffmpeg.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`ffmpeg exited with code ${code}`));
            }
          });
        });

        await Promise.all([outputPipeline, ffmpegExit]).catch((error) => {
          console.error('YouTube MP3 (yt-dlp) error:', error);
          if (!res.headersSent) {
            res.status(502).json({
              error: 'La conversion audio YouTube a échoué. Réessayez dans quelques instants.',
              code: 'YOUTUBE_MP3_FAILED',
            });
          } else {
            res.destroy(error);
          }
        });

        return;
      }

      // yt-dlp is required for YouTube downloads
      return res.status(500).json({
        error: 'yt-dlp n\'est pas disponible sur ce serveur. Contactez l\'administrateur.',
        code: 'YTDLP_NOT_AVAILABLE',
      });
    }

    const upstreamUrl = payload?.url;
    if (!upstreamUrl || typeof upstreamUrl !== 'string') {
      return res.status(400).json({
        error: ERROR_MESSAGES.sourceInvalid,
        code: 'TIKTOK_SOURCE_INVALID',
      });
    }

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
        error: ERROR_MESSAGES.downloadFailed,
        code: 'UPSTREAM_FAILED',
      });
    }

    const contentType = format === 'mp4' ? 'video/mp4' : 'audio/mpeg';
    const fileExt = format === 'mp4' ? 'mp4' : 'mp3';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeTitle}.${fileExt}"`,
    );
    res.setHeader('Cache-Control', 'no-store');

    await pipeline(upstreamResponse.body, res);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Audio upstream timeout:', error);
      return res.status(504).json({
        error: ERROR_MESSAGES.downloadTimeout,
        code: 'DOWNLOAD_TIMEOUT',
      });
    }

    console.error('Download error:', error);
    res
      .status(500)
      .json({ error: ERROR_MESSAGES.serverError, code: 'DOWNLOAD_ERROR' });
  }
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: ERROR_MESSAGES.serverError, code: 'INTERNAL_ERROR' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
