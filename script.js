const audio = document.querySelector('#audio');
const playlistItems = [...document.querySelectorAll('.playlist-item')];
const playButton = document.querySelector('#play-button');
const progress = document.querySelector('#progress');
const volume = document.querySelector('#volume');
const currentTime = document.querySelector('#current-time');
const duration = document.querySelector('#duration');
const nowTitle = document.querySelector('#now-title');
const trackCount = document.querySelector('#track-count');
const visualizer = document.querySelector('#visualizer-canvas');
const visualizerContext = visualizer.getContext('2d');
const discordStatus = document.querySelector('#discord-status');
const activityName = document.querySelector('#activity-name');
const activityDetails = document.querySelector('#activity-details');
const activityCover = document.querySelector('#activity-cover');
const discordUsername = document.querySelector('#discord-username');
const parisTime = document.querySelector('#paris-time');
const discordUserId = '659094544939352064';
const pages = [...document.querySelectorAll('.player-page, .discord-page, .paris-page')];
let discordSocket;
let discordHeartbeat;
let audioContext;
let analyser;
let frequencyData;
let animationFrame;
let currentIndex = 0;

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
};

function setActivityCover(url) {
  activityCover.replaceChildren();
  if (!url) return;
  try {
    const imageUrl = new URL(url);
    if (imageUrl.protocol !== 'https:') return;
    const image = document.createElement('img');
    image.src = imageUrl.href;
    image.alt = '';
    image.loading = 'lazy';
    activityCover.append(image);
  } catch {
    return;
  }
}

function loadTrack(index, play = false) {
  const item = playlistItems[index];
  if (!item) return;
  currentIndex = index;
  audio.src = item.dataset.src;
  nowTitle.textContent = item.querySelector('.track-name').textContent;
  playlistItems.forEach((entry, entryIndex) => entry.classList.toggle('active', entryIndex === index));
  item.scrollIntoView({ block: 'nearest' });
  if (play) audio.play().catch(() => {});
}

function startVisualizer() {
  if (!audioContext) {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;
    audioContext.createMediaElementSource(audio).connect(analyser);
    analyser.connect(audioContext.destination);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
  }

  if (audioContext.state === 'suspended') audioContext.resume();
  cancelAnimationFrame(animationFrame);
  drawVisualizer();
}

function drawVisualizer() {
  const width = visualizer.clientWidth;
  const height = visualizer.clientHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  if (visualizer.width !== width * pixelRatio || visualizer.height !== height * pixelRatio) {
    visualizer.width = width * pixelRatio;
    visualizer.height = height * pixelRatio;
    visualizerContext.scale(pixelRatio, pixelRatio);
  }

  analyser.getByteFrequencyData(frequencyData);
  visualizerContext.clearRect(0, 0, width, height);
  const barCount = 42;
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);

  for (let index = 0; index < barCount; index += 1) {
    const sampleIndex = Math.floor((index / barCount) * frequencyData.length);
    const energy = frequencyData[sampleIndex] / 255;
    const barHeight = 4 + energy * (height - 8);
    const x = index * (barWidth + gap);
    const gradient = visualizerContext.createLinearGradient(0, height, 0, height - barHeight);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#777777');
    visualizerContext.fillStyle = gradient;
    visualizerContext.fillRect(x, height - barHeight, barWidth, barHeight);
  }

  animationFrame = requestAnimationFrame(drawVisualizer);
}

function updateDiscordActivity(presence) {
  const allowedStatuses = new Set(['online', 'idle', 'dnd', 'offline']);
  const status = allowedStatuses.has(presence.discord_status) ? presence.discord_status : 'offline';
  discordUsername.textContent = 'archiste.';
  discordUsername.dataset.text = 'archiste.';
  discordStatus.className = `discord-status ${status}`;
  discordStatus.replaceChildren();
  const statusIndicator = document.createElement('i');
  statusIndicator.setAttribute('aria-hidden', 'true');
  discordStatus.append(statusIndicator, document.createTextNode(` ${status.toUpperCase()}`));

  if (presence.spotify) {
    activityName.textContent = presence.spotify.song;
    activityDetails.textContent = `Spotify · ${presence.spotify.artist}`;
    setActivityCover(presence.spotify.album_art_url);
    return;
  }

  const activity = presence.activities?.find((entry) => entry.type !== 4);
  if (activity) {
    activityName.textContent = activity.name;
    activityDetails.textContent = activity.details || activity.state || 'Activité en cours';
    setActivityCover('');
    return;
  }

  activityName.textContent = status === 'offline' ? 'Hors ligne' : 'Aucune activité';
  activityDetails.textContent = status === 'offline' ? 'Discord non connecté' : 'En ligne sur Discord';
  setActivityCover('');
}

function connectDiscord() {
  discordSocket = new WebSocket('wss://api.lanyard.rest/socket');
  discordSocket.addEventListener('open', () => {
    discordSocket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: discordUserId } }));
  });
  discordSocket.addEventListener('message', ({ data }) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message.op === 1) {
      clearInterval(discordHeartbeat);
      discordHeartbeat = setInterval(() => discordSocket.send(JSON.stringify({ op: 3 })), message.d.heartbeat_interval);
    }
    if (message.op === 0 && message.d) updateDiscordActivity(message.d);
  });
  discordSocket.addEventListener('close', () => {
    clearInterval(discordHeartbeat);
    discordStatus.className = 'discord-status offline';
    discordStatus.replaceChildren();
    const statusIndicator = document.createElement('i');
    statusIndicator.setAttribute('aria-hidden', 'true');
    discordStatus.append(statusIndicator, document.createTextNode(' DÉCONNECTÉ'));
    setTimeout(connectDiscord, 5000);
  });
  discordSocket.addEventListener('error', () => discordSocket.close());
}

function updateParisTime() {
  const now = new Date();
  const timeParts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const timeValues = Object.fromEntries(timeParts.map(({ type, value }) => [type, value]));
  parisTime.textContent = `${timeValues.hour}:${timeValues.minute}:${timeValues.second}`;
  parisTime.dataset.glitch = parisTime.textContent;
  parisTime.dateTime = now.toISOString();
  parisTime.classList.remove('clock-glitch', 'clock-minute-glitch');
  void parisTime.offsetWidth;
  parisTime.classList.add('clock-glitch');
  if (timeValues.second === '00') parisTime.classList.add('clock-minute-glitch');
}

function navigateToPage(direction) {
  const currentPage = pages.reduce((closestIndex, page, index) => {
    const distance = Math.abs(page.getBoundingClientRect().top + window.scrollY - window.scrollY);
    const closestDistance = Math.abs(pages[closestIndex].getBoundingClientRect().top + window.scrollY - window.scrollY);
    return distance < closestDistance ? index : closestIndex;
  }, 0);
  const nextIndex = Math.max(0, Math.min(pages.length - 1, currentPage + direction));
  if (nextIndex === currentPage) return;
  document.body.classList.remove('glitching');
  void document.body.offsetWidth;
  document.body.classList.add('glitching');
  pages[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.body.classList.remove('glitching'), 500);
}

document.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    navigateToPage(1);
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    navigateToPage(-1);
  }
});

playlistItems.forEach((item, index) => item.addEventListener('click', () => loadTrack(index, true)));
document.querySelector('#previous-button').addEventListener('click', () => loadTrack((currentIndex - 1 + playlistItems.length) % playlistItems.length, true));
document.querySelector('#next-button').addEventListener('click', () => loadTrack((currentIndex + 1) % playlistItems.length, true));
playButton.addEventListener('click', () => {
  startVisualizer();
  audio.paused ? audio.play() : audio.pause();
});
volume.addEventListener('input', () => { audio.volume = volume.value; });
progress.addEventListener('input', () => {
  if (audio.duration) audio.currentTime = (progress.value / 100) * audio.duration;
});
audio.addEventListener('loadedmetadata', () => { duration.textContent = formatTime(audio.duration); });
audio.addEventListener('error', () => { nowTitle.textContent = 'Fichier audio introuvable'; });
audio.addEventListener('timeupdate', () => {
  currentTime.textContent = formatTime(audio.currentTime);
  progress.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
});
audio.addEventListener('play', () => {
  startVisualizer();
  playButton.textContent = '';
});
audio.addEventListener('pause', () => { playButton.textContent = ''; });
audio.addEventListener('ended', () => loadTrack((currentIndex + 1) % playlistItems.length, true));
audio.volume = volume.value;
trackCount.textContent = `${String(playlistItems.length).padStart(2, '0')} titres`;
loadTrack(0);
connectDiscord();
updateParisTime();
setInterval(updateParisTime, 1000);
