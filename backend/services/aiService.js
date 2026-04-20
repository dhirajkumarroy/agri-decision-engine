'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const mlService = require('./mlService');
const logger = require('../config/logger');

// ===== INIT =====
const anthropicClient = config.ai.anthropicApiKey
  ? new Anthropic({ apiKey: config.ai.anthropicApiKey })
  : null;

// ===== SYSTEM PROMPT =====
const SYSTEM_PROMPT = `You are FarmBot, an expert AI farming assistant built into the Farmpilot AI platform.
You help Indian farmers with:
- Crop selection
- Disease explanation
- Irrigation decisions
- Fertilizer guidance
- Seasonal tips

Keep answers simple, short, and practical.`;

// ===== SESSION MEMORY =====
const sessionHistory = new Map();
const MAX_HISTORY_TURNS = 10;

function getHistory(sessionId) {
  if (!sessionHistory.has(sessionId)) {
    sessionHistory.set(sessionId, []);
  }
  return sessionHistory.get(sessionId);
}

function addToHistory(sessionId, userMsg, assistantMsg) {
  const history = getHistory(sessionId);

  history.push({ role: 'user', content: userMsg });
  history.push({ role: 'assistant', content: assistantMsg });

  if (history.length > MAX_HISTORY_TURNS * 2) {
    history.splice(0, history.length - MAX_HISTORY_TURNS * 2);
  }
}

function clearSession(sessionId) {
  sessionHistory.delete(sessionId);
}

// ===== PROVIDER =====
function getActiveProvider() {
  if (config.ai.provider === 'ollama') {
    if (!String(config.ai.ollamaModel || '').trim()) {
      throw new Error('OLLAMA_MODEL missing');
    }
    return 'ollama';
  }

  if (config.ai.provider === 'gemini') {
    if (!config.ai.geminiApiKey) {
      throw new Error('GEMINI_API_KEY missing');
    }
    return 'gemini';
  }

  if (!anthropicClient) {
    throw new Error('ANTHROPIC_API_KEY missing');
  }

  return 'anthropic';
}

function getOllamaBaseUrl() {
  return String(config.ai.ollamaHost || 'http://127.0.0.1:11434').replace(/\/+$/, '');
}

// ===== GEMINI PROMPT =====
function buildGeminiPrompt(messages) {
  return [
    SYSTEM_PROMPT,
    '',
    ...messages.map(m => `${m.role.toUpperCase()}: ${m.content}`),
    '',
    'ASSISTANT:',
  ].join('\n');
}

async function getFetch() {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }

  const mod = await import('node-fetch');
  return (mod.default || mod);
}

function getGeminiModelPath() {
  const rawModel = String(config.ai.geminiModel || '').trim();
  if (!rawModel) {
    throw new Error('GEMINI_MODEL missing');
  }

  return rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createStatusError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isGeminiRetryableError(err) {
  return err?.status === 429 || err?.status === 500 || err?.status === 503;
}

// ===== GEMINI API (FIXED) =====
async function runGemini(messages, maxTokens = 512) {
  try {
    const fetchFn = await getFetch();
    const modelPath = getGeminiModelPath();
    const response = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(config.ai.geminiApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: buildGeminiPrompt(messages) }],
            },
          ],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.5,
          },
        }),
      }
    );

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      logger.error('Gemini request failed', {
        status: response.status,
        model: modelPath,
        error: json.error?.message || 'Gemini failed',
      });
      throw createStatusError(json.error?.message || 'Gemini failed', response.status);
    }

    const text =
      json?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || '')
        .join('')
        .trim() || '';

    return text;

  } catch (err) {
    logger.error('Gemini error', { err: err.message, model: config.ai.geminiModel });
    throw err;
  }
}

async function runGeminiWithRetry(messages, maxTokens = 512, retries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await runGemini(messages, maxTokens);
    } catch (err) {
      lastError = err;
      if (!isGeminiRetryableError(err) || attempt === retries) {
        throw err;
      }

      const delayMs = 600 * (attempt + 1);
      logger.warn('Gemini temporarily unavailable, retrying', {
        attempt: attempt + 1,
        delayMs,
        status: err.status,
        model: config.ai.geminiModel,
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function runOllama(messages, maxTokens = 512) {
  try {
    const fetchFn = await getFetch();
    const response = await fetchFn(`${getOllamaBaseUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ai.ollamaModel,
        prompt: buildGeminiPrompt(messages),
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature: 0.5,
        },
      }),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      logger.error('Ollama request failed', {
        status: response.status,
        model: config.ai.ollamaModel,
        error: json.error || 'Ollama failed',
      });
      throw createStatusError(json.error || 'Ollama failed', response.status);
    }

    return String(json.response || '').trim();
  } catch (err) {
    logger.error('Ollama error', {
      err: err.message,
      model: config.ai.ollamaModel,
      host: config.ai.ollamaHost,
    });
    throw err;
  }
}

async function runAnthropicText(messages, maxTokens = 512) {
  const response = await anthropicClient.messages.create({
    model: config.ai.anthropicModel,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages,
  });

  return response.content
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('')
    .trim() || '';
}

// ===== ANTHROPIC =====
async function* runAnthropicStream(messages) {
  const stream = await anthropicClient.messages.stream({
    model: config.ai.anthropicModel,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages,
  });

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text;
    }
  }
}

// ===== CROP INTENT =====
const CROP_INTENT_RE = /\b(recommend|suggest|crop|grow|plant)\b/i;

function extractCropParams(message) {
  const get = (key) => {
    const m = message.match(new RegExp(`${key}[:=\\s]+(\\d+\\.?\\d*)`, 'i'));
    return m ? parseFloat(m[1]) : undefined;
  };

  return {
    N: get('nitrogen'),
    P: get('phosphorus'),
    K: get('potassium'),
    ph: get('ph'),
    rainfall: get('rainfall'),
  };
}

// ===== MAIN CHAT =====
async function* streamChat(sessionId, userMessage) {
  const history = getHistory(sessionId);

  let contextNote = '';

  // ML crop suggestion
  if (CROP_INTENT_RE.test(userMessage)) {
    const params = extractCropParams(userMessage);

    if (Object.values(params).every(v => v !== undefined)) {
      try {
        const result = await mlService.predictCrop(params);
        const crop = result?.top_crop || result?.crop;

        if (crop) {
          contextNote = `\n[ML suggests: ${crop}] Explain simply.`;
        }
      } catch (err) {
        logger.warn('ML failed', { err: err.message });
      }
    }
  }

  const messages = [
    ...history,
    { role: 'user', content: userMessage + contextNote },
  ];

  let fullResponse = '';

  try {
    const provider = getActiveProvider();

    if (provider === 'ollama') {
      fullResponse = await runOllama(messages);
      yield fullResponse;
    } else if (provider === 'gemini') {
      try {
        fullResponse = await runGeminiWithRetry(messages);
      } catch (err) {
        if (isGeminiRetryableError(err) && anthropicClient) {
          logger.warn('Gemini overloaded, falling back to Anthropic', {
            geminiModel: config.ai.geminiModel,
            anthropicModel: config.ai.anthropicModel,
            status: err.status,
          });
          fullResponse = await runAnthropicText(messages);
        } else {
          throw err;
        }
      }
      yield fullResponse;
    } else {
      for await (const chunk of runAnthropicStream(messages)) {
        fullResponse += chunk;
        yield chunk;
      }
    }

  } catch (err) {
    logger.error('AI error', { err: err.message });
    yield "⚠️ AI service temporarily unavailable";
  }

  addToHistory(sessionId, userMessage, fullResponse);
}

// ===== EXPLAIN ML =====
async function explainMLResult(type, result) {
  const prompt = `Explain simply: ${JSON.stringify(result)}`;
  const messages = [{ role: 'user', content: prompt }];

  try {
    const provider = getActiveProvider();
    if (provider === 'ollama') {
      return await runOllama(messages, 256);
    }
    if (provider === 'gemini') {
      return await runGeminiWithRetry(messages, 256);
    }
    return await runAnthropicText(messages, 256);
  } catch (err) {
    if (isGeminiRetryableError(err) && anthropicClient) {
      logger.warn('Gemini overloaded for explain endpoint, falling back to Anthropic', {
        geminiModel: config.ai.geminiModel,
        anthropicModel: config.ai.anthropicModel,
        status: err.status,
      });
      return await runAnthropicText(messages, 256);
    }
    throw err;
  }
}

// ===== EXPORT =====
module.exports = {
  streamChat,
  explainMLResult,
  clearSession,
};
