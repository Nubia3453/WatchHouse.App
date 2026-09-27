(function () {
  const contentRoot = document.getElementById('contentRoot');
  const loadingMsg = document.getElementById('loadingMsg');
  const heroSub = document.getElementById('heroSub');
  const searchInput = document.getElementById('searchInput');

  const settingsModal = document.getElementById('settingsModal');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsCancel = document.getElementById('settingsCancel');
  const settingsSave = document.getElementById('settingsSave');
  const settingsError = document.getElementById('settingsError');
  settingsError.style.textAlign = 'left';
  const apiKeyInput = document.getElementById('apiKeyInput');
  const playlistIdInput = document.getElementById('playlistIdInput');

  const playerOverlay = document.getElementById('playerOverlay');
  const playerFrameWrap = document.getElementById('playerFrameWrap');
  const playerTitle = document.getElementById('playerTitle');
  const closePlayerBtn = document.getElementById('closePlayerBtn');

  const tagModal = document.getElementById('tagModal');
  const tagModalTitle = document.getElementById('tagModalTitle');
  const tagGenreSelect = document.getElementById('tagGenreSelect');
  const tagLanguageSelect = document.getElementById('tagLanguageSelect');
  const tagMoodSelect = document.getElementById('tagMoodSelect');
  const tagGenreCustom = document.getElementById('tagGenreCustom');
  const tagLanguageCustom = document.getElementById('tagLanguageCustom');
  const tagMoodCustom = document.getElementById('tagMoodCustom');
  const tagCancel = document.getElementById('tagCancel');
  const tagSave = document.getElementById('tagSave');

  const genreFilter = document.getElementById('genreFilter');
  const languageFilter = document.getElementById('languageFilter');
  const moodFilter = document.getElementById('moodFilter');
  const filterHint = document.getElementById('filterHint');

  const DEFAULT_PLAYLIST_ID = 'PLhspAmY9B1Rv7c1Xe7nfS0UWcSQ5OW_FT';

  const GENRE_OPTIONS = ['Action', 'Comedy', 'Drama', 'Horror', 'Thriller', 'Romance', 'Sci-Fi', 'Documentary', 'Animation', 'Other'];
  const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Spanish', 'French', 'Korean', 'Japanese', 'Other'];
  const MOOD_OPTIONS = ['Feel-good', 'Intense', 'Relaxing', 'Thought-provoking', 'Nostalgic', 'Scary', 'Other'];

  let allVideos = [];
  let tagsById = {};
  let progressById = {};
  let currentTagVideoId = null;
  let lastErrorMessage = '';
  let ytPlayer = null;
  let ytApiReadyPromise = null;
  let progressTimer = null;
  let currentPlayingVideo = null;

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function loadTags() {
    try { tagsById = JSON.parse(safeGet('wh_tags') || '{}'); } catch (e) { tagsById = {}; }
  }
  function saveTags() { safeSet('wh_tags', JSON.stringify(tagsById)); }

  function loadProgress() {
    try { progressById = JSON.parse(safeGet('wh_progress') || '{}'); } catch (e) { progressById = {}; }
  }
  function saveProgress() { safeSet('wh_progress', JSON.stringify(progressById)); }

  // ---------- Settings modal ----------
  function openSettings() {
    apiKeyInput.value = safeGet('wh_api_key') || '';
    playlistIdInput.value = safeGet('wh_playlist_id') || DEFAULT_PLAYLIST_ID;
    settingsError.style.display = 'none';
    settingsModal.classList.add('open');
  }
  function closeSettings() { settingsModal.classList.remove('open'); }

  settingsBtn.addEventListener('click', openSettings);
  settingsCancel.addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });

  settingsSave.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const pid = playlistIdInput.value.trim();
    if (!key || !pid) return;
    settingsSave.textContent = 'Loading…';
    settingsSave.disabled = true;
    const ok = await loadPlaylist(key, pid);
    settingsSave.textContent = 'Save & load';
    settingsSave.disabled = false;
    if (ok) {
      safeSet('wh_api_key', key);
      safeSet('wh_playlist_id', pid);
      closeSettings();
    } else {
      settingsError.textContent = lastErrorMessage || "Couldn't load that playlist — double-check the key and ID.";
      settingsError.style.display = 'block';
    }
  });

  // ---------- Tag editor modal ----------
  function fillSelect(select, options, currentValue) {
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— none —';
    select.appendChild(blank);
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    });
    if (currentValue && options.includes(currentValue)) {
      select.value = currentValue;
    } else if (currentValue) {
      select.value = 'Other';
    } else {
      select.value = '';
    }
  }

  function wireCustomToggle(select, customInput, currentValue) {
    const allKnown = GENRE_OPTIONS.concat(LANGUAGE_OPTIONS, MOOD_OPTIONS);
    const sync = () => {
      if (select.value === 'Other') {
        customInput.style.display = 'block';
        customInput.value = (currentValue && !allKnown.includes(currentValue)) ? currentValue : '';
      } else {
        customInput.style.display = 'none';
      }
    };
    select.onchange = sync;
    sync();
  }

  function openTagEditor(video) {
    currentTagVideoId = video.id;
    tagModalTitle.textContent = video.title;
    const existing = tagsById[video.id] || {};
    fillSelect(tagGenreSelect, GENRE_OPTIONS, existing.genre);
    fillSelect(tagLanguageSelect, LANGUAGE_OPTIONS, existing.language);
    fillSelect(tagMoodSelect, MOOD_OPTIONS, existing.mood);
    wireCustomToggle(tagGenreSelect, tagGenreCustom, existing.genre);
    wireCustomToggle(tagLanguageSelect, tagLanguageCustom, existing.language);
    wireCustomToggle(tagMoodSelect, tagMoodCustom, existing.mood);
    tagModal.classList.add('open');
  }
  function closeTagEditor() { tagModal.classList.remove('open'); currentTagVideoId = null; }

  tagCancel.addEventListener('click', closeTagEditor);
  tagModal.addEventListener('click', (e) => { if (e.target === tagModal) closeTagEditor(); });

  function resolveValue(select, customInput) {
    if (select.value === 'Other') return customInput.value.trim();
    return select.value;
  }

  tagSave.addEventListener('click', () => {
    if (!currentTagVideoId) return;
    const genre = resolveValue(tagGenreSelect, tagGenreCustom);
    const language = resolveValue(tagLanguageSelect, tagLanguageCustom);
    const mood = resolveValue(tagMoodSelect, tagMoodCustom);
    const entry = {};
    if (genre) entry.genre = genre;
    if (language) entry.language = language;
    if (mood) entry.mood = mood;
    if (Object.keys(entry).length) {
      tagsById[currentTagVideoId] = entry;
    } else {
      delete tagsById[currentTagVideoId];
    }
    saveTags();
    closeTagEditor();
    rebuildFilterOptions();
    render();
  });

  // ---------- Filters ----------
  function rebuildFilterOptions() {
    const genres = new Set(), languages = new Set(), moods = new Set();
    Object.values(tagsById).forEach(t => {
      if (t.genre) genres.add(t.genre);
      if (t.language) languages.add(t.language);
      if (t.mood) moods.add(t.mood);
    });
    const fill = (select, values, label) => {
      const current = select.value;
      select.innerHTML = `<option value="">${label}: All</option>`;
      Array.from(values).sort().forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        select.appendChild(o);
      });
      if (Array.from(values).includes(current)) select.value = current;
    };
    fill(genreFilter, genres, 'Genre');
    fill(languageFilter, languages, 'Language');
    fill(moodFilter, moods, 'Mood');
    filterHint.style.display = Object.keys(tagsById).length ? 'none' : 'inline';
  }

  function isFiltering() {
    return !!(searchInput.value.trim() || genreFilter.value || languageFilter.value || moodFilter.value);
  }

  function matchesFilters(v) {
    const q = searchInput.value.trim().toLowerCase();
    const t = tagsById[v.id] || {};
    if (q && !v.title.toLowerCase().includes(q)) return false;
    if (genreFilter.value && t.genre !== genreFilter.value) return false;
    if (languageFilter.value && t.language !== languageFilter.value) return false;
    if (moodFilter.value && t.mood !== moodFilter.value) return false;
    return true;
  }

  [searchInput, genreFilter, languageFilter, moodFilter].forEach(el => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  // ---------- Rendering ----------
  function renderEmptyState() {
    heroSub.textContent = "Your \"Movies\" playlist is already linked — just add a free API key to load it in.";
    contentRoot.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = '<strong>Almost there.</strong><br>Your playlist is pre-linked — add your free YouTube Data API key to start watching.<br><button id="emptyStateConnectBtn">Add API key</button>';
    contentRoot.appendChild(div);
    document.getElementById('emptyStateConnectBtn').addEventListener('click', openSettings);
  }

  function render() {
    if (!allVideos.length) return;
    contentRoot.innerHTML = '';

    if (isFiltering()) {
      const matches = allVideos.filter(matchesFilters);
      contentRoot.appendChild(buildGridSection(null, matches, true));
      return;
    }

    // Browse mode: Continue Watching first, then Genre / Mood / Language, then the full catalog.
    const continueList = Object.keys(progressById)
      .map(id => ({ id, p: progressById[id] }))
      .filter(x => x.p && x.p.fraction > 0.03 && x.p.fraction < 0.95)
      .sort((a, b) => b.p.updatedAt - a.p.updatedAt)
      .map(x => allVideos.find(v => v.id === x.id))
      .filter(Boolean);

    if (continueList.length) {
      contentRoot.appendChild(buildShelf('Continue Watching', continueList));
    }

    const byKind = { genre: [], language: [], mood: [] };
    allVideos.forEach(v => {
      const t = tagsById[v.id];
      if (!t) return;
      ['genre', 'language', 'mood'].forEach(kind => {
        if (t[kind]) byKind[kind].push(v);
      });
    });
    const kindLabels = { genre: 'Genre', language: 'Language', mood: 'Mood' };

    let hasShelves = continueList.length > 0;
    ['genre', 'mood', 'language'].forEach(kind => {
      if (!byKind[kind].length) return;
      hasShelves = true;
      contentRoot.appendChild(buildShelf(kindLabels[kind], byKind[kind]));
    });

    contentRoot.appendChild(buildGridSection(hasShelves ? 'All movies' : null, allVideos, false));
  }

  function buildShelf(title, videos) {
    const shelf = document.createElement('div');
    shelf.className = 'shelf';
    const titleEl = document.createElement('div');
    titleEl.className = 'shelf-title';
    titleEl.textContent = title;
    const row = document.createElement('div');
    row.className = 'shelf-row';
    videos.forEach(v => row.appendChild(buildCard(v)));
    shelf.appendChild(titleEl);
    shelf.appendChild(row);
    return shelf;
  }

  function buildGridSection(sectionTitleText, videos, isFilteredView) {
    const wrap = document.createElement('div');
    if (sectionTitleText) {
      const h = document.createElement('div');
      h.className = 'section-title';
      h.textContent = sectionTitleText;
      wrap.appendChild(h);
    }
    const grid = document.createElement('div');
    grid.className = 'movie-grid';
    if (!videos.length) {
      grid.innerHTML = `<div class="empty-state">${isFilteredView ? 'No matches found.' : 'No movies yet.'}</div>`;
    } else {
      videos.forEach(v => grid.appendChild(buildCard(v)));
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function buildCard(v) {
    const card = document.createElement('div');
    card.className = 'card';
    const tags = tagsById[v.id] || {};
    const pills = ['genre', 'language', 'mood']
      .filter(k => tags[k])
      .map(k => `<span class="tag-pill">${escapeHtml(tags[k])}</span>`)
      .join('');
    const prog = progressById[v.id];
    const showProgress = prog && prog.fraction > 0.03 && prog.fraction < 0.95;
    const progressBar = showProgress
      ? `<div class="progress-track"><div class="progress-fill" style="width:${Math.round(prog.fraction * 100)}%"></div></div>`
      : '';

    card.innerHTML = `
      <div class="thumb-wrap" tabindex="0" role="button" aria-label="Play ${escapeHtml(v.title)}">
        <img src="${v.thumb}" alt="" loading="lazy">
        <div class="play-badge">
          <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
            <circle cx="23" cy="23" r="22" stroke="#F2EDE4" stroke-width="1.4"/>
            <path d="M19 15L31 23L19 31V15Z" fill="#F2EDE4"/>
          </svg>
        </div>
        ${progressBar}
      </div>
      <div class="meta">
        <div class="title-block">
          <p class="title">${escapeHtml(v.title)}</p>
          <div class="tag-pills">${pills}</div>
        </div>
        <button class="tag-btn" title="Tag genre / language / mood" aria-label="Tag this movie">🏷</button>
      </div>
    `;
    const thumb = card.querySelector('.thumb-wrap');
    const play = () => openPlayer(v);
    thumb.addEventListener('click', play);
    thumb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
    card.querySelector('.tag-btn').addEventListener('click', (e) => { e.stopPropagation(); openTagEditor(v); });
    return card;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------- Player (YouTube IFrame API, with progress tracking) ----------
  function loadYouTubeAPI() {
    if (ytApiReadyPromise) return ytApiReadyPromise;
    ytApiReadyPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) { resolve(); return; }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prevCallback === 'function') prevCallback();
        resolve();
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
    return ytApiReadyPromise;
  }

  function recordProgress() {
    if (!ytPlayer || !currentPlayingVideo) return;
    try {
      const duration = ytPlayer.getDuration();
      const seconds = ytPlayer.getCurrentTime();
      if (!duration || isNaN(duration)) return;
      const fraction = seconds / duration;
      progressById[currentPlayingVideo.id] = { seconds, duration, fraction, updatedAt: Date.now() };
      saveProgress();
    } catch (e) {}
  }

  function stopProgressTracking() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  }

  async function openPlayer(v) {
    currentPlayingVideo = v;
    playerTitle.textContent = v.title;
    playerOverlay.classList.add('open');
    playerFrameWrap.innerHTML = '<div id="ytPlayerContainer"></div>';

    await loadYouTubeAPI();

    const saved = progressById[v.id];
    const startSeconds = (saved && saved.fraction > 0.03 && saved.fraction < 0.95) ? Math.floor(saved.seconds) : 0;

    ytPlayer = new YT.Player('ytPlayerContainer', {
      videoId: v.id,
      playerVars: { autoplay: 1, rel: 0, start: startSeconds },
      events: {
        onReady: () => { stopProgressTracking(); progressTimer = setInterval(recordProgress, 5000); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            delete progressById[v.id];
            saveProgress();
          } else if (e.data === YT.PlayerState.PAUSED) {
            recordProgress();
          }
        }
      }
    });
  }

  function closePlayer() {
    recordProgress();
    stopProgressTracking();
    playerOverlay.classList.remove('open');
    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
      try { ytPlayer.destroy(); } catch (e) {}
    }
    ytPlayer = null;
    currentPlayingVideo = null;
    playerFrameWrap.innerHTML = '<div id="ytPlayerContainer"></div>';
    render();
  }
  closePlayerBtn.addEventListener('click', closePlayer);
  window.addEventListener('beforeunload', recordProgress);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (playerOverlay.classList.contains('open')) closePlayer();
      if (tagModal.classList.contains('open')) closeTagEditor();
    }
  });

  // ---------- Playlist loading ----------
  async function loadPlaylist(apiKey, playlistId) {
    loadingMsg.style.display = 'block';
    contentRoot.innerHTML = '';
    lastErrorMessage = '';
    try {
      let items = [];
      let pageToken = '';
      do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}${pageToken ? '&pageToken=' + pageToken : ''}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let res;
        try {
          res = await fetch(url, { signal: controller.signal });
        } catch (fetchErr) {
          if (fetchErr.name === 'AbortError') {
            lastErrorMessage = 'Request timed out after 15s — your network may be blocking access to googleapis.com (common on some mobile carriers, VPNs, or restrictive Wi-Fi).';
          } else {
            lastErrorMessage = `Network error: ${fetchErr.message || 'the request failed before reaching YouTube.'}`;
          }
          throw fetchErr;
        } finally {
          clearTimeout(timeoutId);
        }
        if (!res.ok) {
          let detail = '';
          try {
            const errJson = await res.json();
            detail = (errJson.error && errJson.error.message) || '';
          } catch (parseErr) {}
          lastErrorMessage = `YouTube API error (${res.status}): ${detail || 'request failed'}`;
          throw new Error(lastErrorMessage);
        }
        const data = await res.json();
        items = items.concat(data.items || []);
        pageToken = data.nextPageToken || '';
      } while (pageToken);

      allVideos = items
        .filter(it => it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId && it.snippet.title !== 'Deleted video' && it.snippet.title !== 'Private video')
        .map(it => ({
          id: it.snippet.resourceId.videoId,
          title: it.snippet.title,
          thumb: (it.snippet.thumbnails && (it.snippet.thumbnails.high || it.snippet.thumbnails.medium || it.snippet.thumbnails.default) || {}).url || ''
        }));

      loadingMsg.style.display = 'none';
      if (!allVideos.length) {
        contentRoot.innerHTML = '<div class="empty-state">This playlist loaded but has no watchable videos.</div>';
        heroSub.textContent = "Everything below streams straight from your own YouTube playlist.";
        return true;
      }
      heroSub.textContent = `${allVideos.length} title${allVideos.length === 1 ? '' : 's'} from your playlist — organized below, or search to jump straight to one.`;
      rebuildFilterOptions();
      render();
      return true;
    } catch (e) {
      loadingMsg.style.display = 'none';
      if (!lastErrorMessage) {
        lastErrorMessage = 'Network or CORS error — the request never reached YouTube. Check your internet connection or try again.';
      }
      return false;
    }
  }

  // ---------- Boot ----------
  (function init() {
    loadTags();
    loadProgress();
    const key = safeGet('wh_api_key');
    const pid = safeGet('wh_playlist_id') || DEFAULT_PLAYLIST_ID;
    if (key && pid) {
      loadPlaylist(key, pid).then(ok => { if (!ok) renderEmptyState(); });
    } else {
      renderEmptyState();
    }
  })();
})();
