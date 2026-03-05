/* ══════════════════════════════════════════════════════════
   EmoSense — Face Emotion Recognition
   Uses: TensorFlow.js Face Landmarks Detection
   Emotions: Happy, Sad, Surprised, Scared, Angry, Disgusted, Neutral
   ══════════════════════════════════════════════════════════ */

// ─── Emotion Registry ────────────────────────────────────────
const EMOTIONS = [
  {
    id: 'happy',
    label: 'HAPPY',
    emoji: '😄',
    color: ['#f6d365','#fda085'],
    desc: 'Corners of mouth raised — a genuine smile detected.',
  },
  {
    id: 'sad',
    label: 'SAD',
    emoji: '😢',
    color: ['#4facfe','#00f2fe'],
    desc: 'Drooping mouth corners and heavy brow expression.',
  },
  {
    id: 'surprised',
    label: 'SURPRISED',
    emoji: '😲',
    color: ['#f093fb','#f5576c'],
    desc: 'Wide-open mouth and elevated eyebrows detected.',
  },
  {
    id: 'scared',
    label: 'SCARED',
    emoji: '😨',
    color: ['#4776e6','#8e54e9'],
    desc: 'Tense facial muscles and wide eyes — fear response.',
  },
  {
    id: 'angry',
    label: 'ANGRY',
    emoji: '😠',
    color: ['#f5576c','#f093fb'],
    desc: 'Furrowed brow and tight jaw muscles detected.',
  },
  {
    id: 'disgusted',
    label: 'DISGUSTED',
    emoji: '🤢',
    color: ['#43e97b','#38f9d7'],
    desc: 'Raised upper lip and nose wrinkle pattern found.',
  },
  {
    id: 'neutral',
    label: 'NEUTRAL',
    emoji: '😐',
    color: ['#a8edea','#fed6e3'],
    desc: 'Relaxed, symmetric face with no strong expression.',
  },
];

// ─── State ───────────────────────────────────────────────────
let detector      = null;
let stream        = null;
let animFrame     = null;
let isRunning     = false;
let history       = [];
let lastEmotion   = null;
let lastEmotionTs = 0;
const HISTORY_MAX = 24;

// ─── DOM Refs ─────────────────────────────────────────────────
const videoEl      = document.getElementById('videoEl');
const overlayCanvas= document.getElementById('overlayCanvas');
const ctx          = overlayCanvas.getContext('2d');
const startBtn     = document.getElementById('startBtn');
const captureBtn   = document.getElementById('captureBtn');
const statusDot    = document.getElementById('statusDot');
const statusText   = document.getElementById('statusText');
const faceLabel    = document.getElementById('faceLabel');
const faceLabelText= document.getElementById('faceLabelText');
const scanLine     = document.getElementById('scanLine');
const confBarFill  = document.getElementById('confBarFill');
const confValue    = document.getElementById('confValue');
const emotionHero  = document.getElementById('emotionHero');
const heroEmoji    = document.getElementById('heroEmoji');
const heroName     = document.getElementById('heroName');
const heroDesc     = document.getElementById('heroDesc');
const emotionBarsEl= document.getElementById('emotionBars');
const historyStrip = document.getElementById('historyStrip');
const snapshotModal= document.getElementById('snapshotModal');
const snapCanvas   = document.getElementById('snapCanvas');
const snapInfo     = document.getElementById('snapInfo');
const closeSnap    = document.getElementById('closeSnap');

// ─── Init Emotion Bars ────────────────────────────────────────
function buildEmotionBars() {
  emotionBarsEl.innerHTML = '';
  EMOTIONS.forEach(e => {
    const row = document.createElement('div');
    row.className = 'emo-bar-row';
    row.dataset.emotion = e.id;
    row.innerHTML = `
      <span class="emo-bar-emoji">${e.emoji}</span>
      <div class="emo-bar-wrap">
        <span class="emo-bar-label">${e.label}</span>
        <div class="emo-bar-track" style="margin-top:18px">
          <div class="emo-bar-fill" id="bar-${e.id}"></div>
        </div>
      </div>
      <span class="emo-bar-pct" id="pct-${e.id}">0%</span>
    `;
    emotionBarsEl.appendChild(row);
  });
}
buildEmotionBars();

// ─── Status helpers ───────────────────────────────────────────
function setStatus(msg, state = '') {
  statusText.textContent = msg;
  statusDot.className    = 'status-dot' + (state ? ' ' + state : '');
}

// ─── Start / Stop ─────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  if (isRunning) { stopCamera(); return; }
  await startCamera();
});

async function startCamera() {
  setStatus('Requesting camera…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    setStatus('Loading neural network…');

    // Load model
    if (!detector) {
      const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
      detector = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: true,
        maxFaces: 1,
      });
    }

    isRunning = true;
    startBtn.textContent = '';
    startBtn.innerHTML   = '<span class="btn-icon">⏹</span> Stop Camera';
    captureBtn.disabled  = false;
    scanLine.classList.add('active');
    setStatus('Detecting emotions…', 'active');
    detect();

  } catch (err) {
    console.error(err);
    setStatus('Camera error — check permissions.', 'error');
  }
}

function stopCamera() {
  isRunning = false;
  cancelAnimationFrame(animFrame);
  stream?.getTracks().forEach(t => t.stop());
  stream    = null;
  videoEl.srcObject = null;
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  scanLine.classList.remove('active');
  captureBtn.disabled  = true;
  startBtn.innerHTML   = '<span class="btn-icon">▶</span> Start Camera';
  setStatus('Camera stopped.');
  faceLabelText.textContent = 'Scanning…';
  resetBars();
  updateHero(EMOTIONS.find(e => e.id === 'neutral'), {});
  confBarFill.style.width = '0%';
  confValue.textContent   = '—';
}

// ─── Detection loop ───────────────────────────────────────────
async function detect() {
  if (!isRunning) return;

  if (videoEl.readyState >= 2) {
    overlayCanvas.width  = videoEl.videoWidth  || 640;
    overlayCanvas.height = videoEl.videoHeight || 480;

    try {
      const faces = await detector.estimateFaces(videoEl, { flipHorizontal: false });

      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (faces.length > 0) {
        const face = faces[0];
        drawFaceOverlay(face);

        const scores = analyzeEmotion(face.keypoints);
        const topEmotion = getTopEmotion(scores);
        const conf = scores[topEmotion.id] || 0;

        // Update confidence bar
        confBarFill.style.width = (conf * 100).toFixed(1) + '%';
        confValue.textContent   = (conf * 100).toFixed(0) + '%';
        if (conf > 0.7) confBarFill.style.background = 'linear-gradient(90deg,#00ff88,#00e5ff)';
        else if (conf > 0.4) confBarFill.style.background = 'linear-gradient(90deg,#0077b6,#00e5ff)';
        else confBarFill.style.background = 'linear-gradient(90deg,#8e54e9,#4776e6)';

        updateBars(scores);
        faceLabelText.textContent = topEmotion.emoji + ' ' + topEmotion.label;

        // Only update hero when emotion changes (debounce 800ms)
        const now = Date.now();
        if (topEmotion.id !== lastEmotion || now - lastEmotionTs > 3000) {
          updateHero(topEmotion, scores);
          if (topEmotion.id !== lastEmotion) {
            addHistory(topEmotion);
            lastEmotion   = topEmotion.id;
          }
          lastEmotionTs = now;
        }

      } else {
        faceLabelText.textContent = 'No face detected';
        resetBars();
        confBarFill.style.width = '0%';
        confValue.textContent   = '—';
      }

    } catch (e) {
      console.warn('Detection error:', e);
    }
  }

  animFrame = requestAnimationFrame(detect);
}

// ─── Face overlay drawing ─────────────────────────────────────
function drawFaceOverlay(face) {
  const kp = face.keypoints;

  // Draw mesh dots
  ctx.fillStyle = 'rgba(0,229,255,0.25)';
  kp.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw bounding box
  const xs = kp.map(p => p.x);
  const ys = kp.map(p => p.y);
  const x1 = Math.min(...xs) - 16;
  const y1 = Math.min(...ys) - 16;
  const w  = Math.max(...xs) - x1 + 16;
  const h  = Math.max(...ys) - y1 + 16;

  ctx.strokeStyle = 'rgba(0,229,255,0.6)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x1, y1, w, h);
  ctx.setLineDash([]);

  // Key landmarks: eyes, mouth corners
  const FEATURE_INDICES = [
    // Left eye
    33, 160, 158, 133, 153, 144,
    // Right eye
    362, 385, 387, 263, 373, 380,
    // Mouth outer
    61, 291, 39, 181, 0, 17, 269, 405,
    // Brows
    70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
  ];
  ctx.fillStyle = 'rgba(0,229,255,0.9)';
  FEATURE_INDICES.forEach(i => {
    if (!kp[i]) return;
    ctx.beginPath();
    ctx.arc(kp[i].x, kp[i].y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Mouth curve line
  drawCurve(ctx, [61,62,63,64,65,66,67,0,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,291].map(i => kp[i]).filter(Boolean), 'rgba(0,229,255,0.5)', 1.5);

  // Eye outlines
  drawCurve(ctx, [33,160,158,133,153,144,33].map(i=>kp[i]).filter(Boolean), 'rgba(0,229,255,0.7)', 1.5);
  drawCurve(ctx, [362,385,387,263,373,380,362].map(i=>kp[i]).filter(Boolean), 'rgba(0,229,255,0.7)', 1.5);
}

function drawCurve(ctx, pts, color, lw) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.stroke();
}

// ─── Emotion Analysis (geometry-based) ───────────────────────
/*
  We derive 7 emotions from face geometry ratios:
  - Mouth openness  → surprised, happy, scared
  - Mouth corners   → happy (up), sad (down)
  - Brow height     → surprised, scared (up), angry (down)
  - Eye openness    → scared (wide), disgusted (narrow)
  - Nose wrinkle proxy (distance between nose+upper-lip) → disgusted

  Indices reference MediaPipe FaceMesh 468-point model.
*/
function dist(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function analyzeEmotion(kp) {
  // Normalization: inter-ocular distance
  const iod = dist(kp[33], kp[263]) || 1;

  // ── Mouth features ──
  const mouthH    = dist(kp[13], kp[14]) / iod;           // vertical opening (inner lips)
  const mouthOuter= dist(kp[0],  kp[17]) / iod;           // full mouth height
  const mouthW    = dist(kp[61], kp[291]) / iod;          // mouth width

  // Corner elevation: compare corner Y to mouth mid Y
  const mouthMidY = (kp[0] && kp[17]) ? (kp[0].y + kp[17].y) / 2 : 0;
  const leftCornerRise  = kp[61] ? (mouthMidY - kp[61].y)  / iod : 0; // +ve = smile
  const rightCornerRise = kp[291]? (mouthMidY - kp[291].y) / iod : 0;
  const cornerRise = (leftCornerRise + rightCornerRise) / 2;

  // ── Brow features ──
  // Brow midpoint Y vs eye center Y
  const leftBrowY  = kp[70] ? kp[70].y : 0;
  const rightBrowY = kp[300]? kp[300].y : 0;
  const leftEyeY   = kp[33] ? kp[33].y : 0;
  const rightEyeY  = kp[263]? kp[263].y : 0;
  const browRaise  = (((leftEyeY - leftBrowY) + (rightEyeY - rightBrowY)) / 2) / iod;

  // Brow furrow: inner brow distance (closer = furrow = angry)
  const browFurrow = dist(kp[107], kp[336]) / iod; // normalized — lower means more furrowed

  // ── Eye openness ──
  const leftEyeH  = dist(kp[160], kp[144]) / iod;
  const rightEyeH = dist(kp[385], kp[380]) / iod;
  const eyeOpen   = (leftEyeH + rightEyeH) / 2;

  // ── Nose-lip gap (disgust proxy) ──
  const noseLipGap= dist(kp[2], kp[0]) / iod;   // nose tip to upper lip

  // ─── Score each emotion ───────────────────────────────────
  const raw = {};

  // HAPPY: corners up + some mouth open
  raw.happy = clamp(
    cornerRise * 5 +
    mouthW * 0.4 +
    (mouthH > 0.06 ? mouthH * 2 : 0)
  );

  // SAD: corners down + brow slightly raised inner
  raw.sad = clamp(
    -cornerRise * 6 +
    (browRaise > 0.4 ? browRaise * 1.5 : 0)
  );

  // SURPRISED: mouth wide open + brows raised high + eyes wide
  raw.surprised = clamp(
    mouthOuter * 5 +
    browRaise * 2 +
    eyeOpen * 1.5 -
    0.5
  );

  // SCARED: eyes wide + brows raised + mouth partially open, corners neutral/down
  raw.scared = clamp(
    eyeOpen * 3 +
    browRaise * 2.5 +
    mouthOuter * 1.5 +
    (-cornerRise * 2) -
    0.8
  );

  // ANGRY: brow furrowed (low browFurrow value) + mouth tight
  raw.angry = clamp(
    (0.6 - browFurrow) * 6 +
    (-cornerRise * 2) +
    (-mouthOuter * 0.5)
  );

  // DISGUSTED: nose-lip gap small + upper lip raised + brow furrow
  raw.disgusted = clamp(
    (0.18 - noseLipGap) * 8 +
    (0.5 - browFurrow) * 2 +
    (-cornerRise * 1.5)
  );

  // Neutral: the "leftover" score
  const positiveSum = Object.values(raw).reduce((a, b) => a + Math.max(0, b), 0);
  raw.neutral = clamp(1 - positiveSum * 0.7);

  return softmax(raw);
}

function clamp(v, lo = 0, hi = 3) {
  return Math.max(lo, Math.min(hi, v));
}

function softmax(obj) {
  const keys = Object.keys(obj);
  const vals = keys.map(k => Math.exp(obj[k] * 2));
  const sum  = vals.reduce((a, b) => a + b, 0);
  const out  = {};
  keys.forEach((k, i) => { out[k] = vals[i] / sum; });
  return out;
}

function getTopEmotion(scores) {
  let best = null, bestScore = -1;
  EMOTIONS.forEach(e => {
    if ((scores[e.id] || 0) > bestScore) {
      bestScore = scores[e.id];
      best = e;
    }
  });
  return best || EMOTIONS[6]; // neutral fallback
}

// ─── UI Updates ───────────────────────────────────────────────
function updateBars(scores) {
  EMOTIONS.forEach(e => {
    const pct  = ((scores[e.id] || 0) * 100).toFixed(1);
    const fill = document.getElementById('bar-' + e.id);
    const pctEl= document.getElementById('pct-' + e.id);
    const row  = fill?.closest('.emo-bar-row');

    if (fill)  fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';

    if (row) {
      const isTop = pct == Math.max(...EMOTIONS.map(x => (scores[x.id]||0)*100)).toFixed(1);
      row.classList.toggle('active', parseFloat(pct) ===
        Math.max(...EMOTIONS.map(x => parseFloat(((scores[x.id]||0)*100).toFixed(1)))));
    }
  });
}

function resetBars() {
  EMOTIONS.forEach(e => {
    const fill = document.getElementById('bar-' + e.id);
    const pctEl= document.getElementById('pct-' + e.id);
    if (fill)  fill.style.width = '0%';
    if (pctEl) pctEl.textContent = '0%';
  });
}

function updateHero(emotion, scores) {
  heroEmoji.textContent = emotion.emoji;
  heroName.textContent  = emotion.label;
  heroDesc.textContent  = emotion.desc;
  emotionHero.dataset.emotion = emotion.id;

  // Pulse animation
  heroEmoji.style.animation = 'none';
  void heroEmoji.offsetWidth;
  heroEmoji.style.animation = '';
}

function addHistory(emotion) {
  const placeholder = historyStrip.querySelector('.placeholder-text');
  if (placeholder) placeholder.remove();

  history.unshift(emotion);
  if (history.length > HISTORY_MAX) history.pop();

  // Rebuild strip
  historyStrip.innerHTML = '';
  history.forEach(e => {
    const chip = document.createElement('div');
    chip.className = 'history-chip';
    chip.innerHTML = `<span class="chip-emoji">${e.emoji}</span><span>${e.label}</span>`;
    historyStrip.appendChild(chip);
  });
}

// ─── Snapshot ─────────────────────────────────────────────────
captureBtn.addEventListener('click', () => {
  const w = videoEl.videoWidth  || 640;
  const h = videoEl.videoHeight || 480;
  snapCanvas.width  = w;
  snapCanvas.height = h;
  const sc = snapCanvas.getContext('2d');

  // Draw flipped video
  sc.save();
  sc.drawImage(videoEl, 0, 0, w, h);
  // Draw overlay
  sc.drawImage(overlayCanvas, 0, 0, w, h);
  sc.restore();

  const top = EMOTIONS.find(e => e.id === lastEmotion) || EMOTIONS[6];
  snapInfo.innerHTML = `
    Snapshot — <strong style="color:var(--accent)">${top.emoji} ${top.label}</strong>
  `;
  snapshotModal.classList.add('open');
});

closeSnap.addEventListener('click', () => snapshotModal.classList.remove('open'));
snapshotModal.addEventListener('click', e => {
  if (e.target === snapshotModal) snapshotModal.classList.remove('open');
});

// ─── Ambient Particle Canvas ──────────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const pc     = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  class Particle {
    constructor() { this.reset(true); }
    reset(init = false) {
      this.x  = Math.random() * W;
      this.y  = init ? Math.random() * H : H + 10;
      this.r  = Math.random() * 1.5 + 0.3;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = -(Math.random() * 0.4 + 0.1);
      this.alpha = Math.random() * 0.5 + 0.1;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -10) this.reset();
    }
    draw() {
      pc.beginPath();
      pc.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      pc.fillStyle = `rgba(0,229,255,${this.alpha})`;
      pc.fill();
    }
  }

  for (let i = 0; i < 80; i++) particles.push(new Particle());

  (function loop() {
    pc.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  })();
})();

// ─── Boot ─────────────────────────────────────────────────────
setStatus('Ready — click Start Camera');
