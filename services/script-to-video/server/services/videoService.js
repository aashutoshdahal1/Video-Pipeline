const Cache = require('../models/Cache');
const mongoose = require('mongoose');
const { searchPexels } = require('./pexelsService');
const { searchPixabay } = require('./pixabayService');

// In-flight dedupe map
const inFlight = new Map();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const VALID_SOURCES = new Set(['pexels', 'pixabay']);
const memoryCache = new Map();

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

function getMemoryCache(cacheKey) {
  const cached = memoryCache.get(cacheKey);
  if (!cached) return null;
  if ((Date.now() - cached.createdAt) >= CACHE_TTL_MS) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return cached.results;
}

function setMemoryCache(cacheKey, results) {
  memoryCache.set(cacheKey, { results, createdAt: Date.now() });
}

const RELATED_QUERY_MAP = {
  earth: ['planet', 'world', 'globe', 'nature', 'environment', 'space'],
  nature: ['forest', 'mountains', 'landscape', 'outdoors'],
  city: ['urban', 'street', 'downtown', 'buildings'],
  ocean: ['sea', 'waves', 'beach', 'water'],
  forest: ['woods', 'trees', 'nature', 'outdoors'],
  night: ['dark', 'lights', 'city night', 'stars'],
};

function normalizeQueryValue(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackQueries(query, keywords = []) {
  const normalizedQuery = normalizeQueryValue(query);
  const unique = new Set();
  const candidates = [];

  const pushCandidate = (value) => {
    const normalized = normalizeQueryValue(value);
    if (!normalized || unique.has(normalized)) return;
    unique.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(normalizedQuery);

  (keywords || []).slice(0, 5).forEach(pushCandidate);

  normalizedQuery.split(' ').forEach((part) => {
    if (part.length > 2) pushCandidate(part);
  });

  const baseTerms = [normalizedQuery, ...normalizedQuery.split(' ')];
  baseTerms.forEach((term) => {
    const related = RELATED_QUERY_MAP[term];
    if (related) related.forEach(pushCandidate);
  });

  return candidates;
}

function normalizeSources(sources) {
  const sourceList = Array.isArray(sources)
    ? sources
    : typeof sources === 'string'
      ? sources.split(',')
      : [];

  const normalized = sourceList
    .map((source) => String(source).trim().toLowerCase())
    .filter((source) => source === 'all' || VALID_SOURCES.has(source));

  if (!normalized.length || normalized.includes('all')) {
    return ['pexels', 'pixabay'];
  }

  return Array.from(new Set(normalized));
}

async function searchSourceWithFallback(searchFn, query, keywords, apiKey, orientation = null) {
  const candidates = buildFallbackQueries(query, keywords);
  if (candidates.length === 0) return [];

  const primaryResults = await searchFn(candidates[0], 15, apiKey, orientation);
  if (Array.isArray(primaryResults) && primaryResults.length > 0) {
    return primaryResults;
  }

  const fallbackCandidates = candidates.slice(1, 4);
  if (fallbackCandidates.length === 0) return primaryResults || [];

  const settled = await Promise.allSettled(
    fallbackCandidates.map((candidate) => searchFn(candidate, 15, apiKey, orientation))
  );

  const merged = [];
  const seen = new Set();

  const addResult = (item) => {
    const dedupeKey = item.videoUrl || item.thumbnail || `${item.source}:${item.title}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    merged.push(item);
  };

  (primaryResults || []).forEach(addResult);

  settled.forEach((result) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      result.value.forEach(addResult);
    }
  });

  return merged;
}

function scoreResults(results, keywords = []) {
  const kws = (keywords || []).map(k => k.toLowerCase());
  return results.map(item => {
    let score = 0;
    const hay = [item.title || '', (item.description||''), (item.tags||[]).join(' ')].join(' ').toLowerCase();
    kws.forEach(k => {
      if (!k) return;
      if ((item.title || '').toLowerCase().includes(k)) score += 5;
      if ((item.tags || []).some(t => t.toLowerCase().includes(k))) score += 3;
      if ((item.description || '').toLowerCase().includes(k)) score += 1;
      // bonus if appears anywhere
      if (hay.includes(k) && score === 0) score += 0;
    });
    return { ...item, relevanceScore: score };
  }).sort((a,b) => b.relevanceScore - a.relevanceScore);
}

async function searchUnified(query, keywords = [], options = {}) {
  const selectedSources = normalizeSources(options.sources);
  const orientation = options.orientation || null;
  const key = query.trim().toLowerCase();
  const cacheKey = `${key}::${selectedSources.slice().sort().join(',')}::${orientation || 'any'}`;
  const canUseDbCache = isDbReady();

  // check cache
  let cached = null;
  if (canUseDbCache) {
    try {
      cached = await Cache.findOne({ query: cacheKey }).exec();
      if (cached && cached.results && cached.results.length > 0 && (Date.now() - new Date(cached.createdAt).getTime()) < CACHE_TTL_MS) {
        return cached.results;
      }
    } catch (err) {
      cached = null;
    }
  } else {
    const mem = getMemoryCache(cacheKey);
    if (mem && mem.length > 0) return mem;
  }

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const calls = [];
      if (selectedSources.includes('pexels')) {
        calls.push(searchSourceWithFallback(searchPexels, query, keywords, options.pexelsKey, orientation));
      }
      if (selectedSources.includes('pixabay')) {
        calls.push(searchSourceWithFallback(searchPixabay, query, keywords, options.pixabayKey, orientation));
      }
      const settled = await Promise.allSettled(calls);
      const results = [];
      settled.forEach(s => {
        if (s.status === 'fulfilled' && Array.isArray(s.value)) results.push(...s.value);
      });
      const scored = scoreResults(results, keywords);

      // save cache only when there are results, so empty queries can retry with fallback logic later
      if (scored.length > 0) {
        if (canUseDbCache) {
          await Cache.findOneAndUpdate({ query: cacheKey }, { results: scored, createdAt: new Date() }, { upsert: true });
        } else {
          setMemoryCache(cacheKey, scored);
        }
      }
      return scored;
    } catch (err) {
      // on failure, return partial cached if any
      if (cached) return cached.results;
      throw err;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

async function searchScenes(sceneQueries = [], options = {}) {
  const normalizedScenes = (sceneQueries || [])
    .map((scene) => (typeof scene === 'string' ? scene.trim() : ''))
    .filter(Boolean);

  const settled = await Promise.allSettled(
    normalizedScenes.map(async (scene) => {
      const results = await searchUnified(scene, [], options);
      return {
        scene,
        results,
        count: results.length,
      };
    })
  );

  return settled.map((entry, index) => {
    if (entry.status === 'fulfilled') {
      return entry.value;
    }
    return {
      scene: normalizedScenes[index],
      results: [],
      count: 0,
      error: entry.reason?.message || 'Failed to fetch scene',
    };
  });
}

module.exports = { searchUnified, searchScenes };
