(function () {
  const shelvesRoot = document.getElementById('shelvesRoot');
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

  const DEFAULT_PLAYLIST_ID = 'PLhspAmY9B1Rv7c1Xe7nfS0UWcSQ5OW_FT';

  let allVideos = [];
  let lastErrorMessage = '';

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

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

  function renderEmptyState() {
    heroSub.textContent = "Your \"Movies\" playlist is already linked — just add a free API key to load it in.";
    shelvesRoot.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = '<strong>Almost there.</strong><br>Your playlist is pre-linked — add your free YouTube Data API key to start watching.<br><button id="emptyStateConnectBtn">Add API key</button>';
    shelvesRoot.appendChild(div);
    document.getElementById('emptyStateConnectBtn').addEventListener('click', openSettings);
  }

  function renderShelves(videos) {
    shelvesRoot.innerHTML = '';
    if (!videos.length) {
      shelvesRoot.innerHTML = '<div class="empty-state">No matches found.</div>';
      return;
    }
    const shelf = document.createElement('div');
    shelf.className = 'shelf';
    const row = document.createElement('div');
    row.className = 'shelf-row';
    videos.forEach(v => row.appendChild(buildCard(v)));
    shelf.appendChild(row);
    shelvesRoot.appendChild(shelf);
  }

  function buildCard(v) {
    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Play ' + v.title);
    card.innerHTML = `
      <div class="thumb-wrap">
        <img src="${v.thumb}" alt="" loading="lazy">
        <div class="play-badge">
          <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
            <circle cx="23" cy="23" r="22" stroke="#F2EDE4" stroke-width="1.4"/>
            <path d="M19 15L31 23L19 31V15Z" fill="#F2EDE4"/>
          </svg>
        </div>
      </div>
      <div class="meta"><p class="title">${escapeHtml(v.title)}</p></div>
    `;
    const play = () => openPlayer(v);
    card.addEventListener('click', play);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
    return card;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function openPlayer(v) {
    playerTitle.textContent = v.title;
    playerFrameWrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${v.id}?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
    playerOverlay.classList.add('open');
  }
  function closePlayer() {
    playerOverlay.classList.remove('open');
    playerFrameWrap.innerHTML = '';
  }
  closePlayerBtn.addEventListener('click', closePlayer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && playerOverlay.classList.contains('open')) closePlayer(); });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q ? allVideos.filter(v => v.title.toLowerCase().includes(q)) : allVideos;
    renderShelves(filtered);
  });

  async function loadPlaylist(apiKey, playlistId) {
    loadingMsg.style.display = 'block';
    shelvesRoot.innerHTML = '';
    lastErrorMessage = '';
    try {
      let items = [];
      let pageToken = '';
      do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url);
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
        shelvesRoot.innerHTML = '<div class="empty-state">This playlist loaded but has no watchable videos.</div>';
        heroSub.textContent = "Everything below streams straight from your own YouTube playlist.";
        return true;
      }
      heroSub.textContent = `${allVideos.length} title${allVideos.length === 1 ? '' : 's'} from your playlist — click anything to watch.`;
      renderShelves(allVideos);
      return true;
    } catch (e) {
      loadingMsg.style.display = 'none';
      if (!lastErrorMessage) {
        lastErrorMessage = 'Network or CORS error — the request never reached YouTube. Check your internet connection or try again.';
      }
      return false;
    }
  }

  // Boot
  (function init() {
    const key = safeGet('wh_api_key');
    const pid = safeGet('wh_playlist_id') || DEFAULT_PLAYLIST_ID;
    if (key && pid) {
      loadPlaylist(key, pid).then(ok => { if (!ok) renderEmptyState(); });
    } else {
      renderEmptyState();
    }
  })();
})();
