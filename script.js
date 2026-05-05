// ===== Target Dates =====
const EVENTS = {
    exam: {
        label: 'Final Exam (10:00 AM - 1:00 PM)',
        date: new Date('2026-06-03T10:00:00'),
    },
    discussion: {
        label: 'Project Discussion',
        date: new Date('2026-07-01T10:00:00'),
    },
    party: {
        label: 'Graduation Party',
        date: new Date('2026-07-22T10:00:00'),
    },
};

let currentTab = 'exam';
let countdownInterval = null;
let previousValues = { days: '', hours: '', minutes: '', seconds: '' };

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    startCountdown();
    updateLocalTime();
    initAudio();
});

// ===== Tab Switching =====
function switchTab(tab) {
    currentTab = tab;

    // Update active tab styling
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    // Reset previous values to force update
    previousValues = { days: '', hours: '', minutes: '', seconds: '' };

    startCountdown();
}

// ===== Start Countdown =====
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// ===== Update Countdown =====
function updateCountdown() {
    const event = EVENTS[currentTab];
    const targetDate = event.date;

    // Update event label
    const eventLabel = document.getElementById('eventLabel');
    const targetDisplay = document.getElementById('targetDateDisplay');

    if (!targetDate) {
        eventLabel.textContent = 'Select a date and time above';
        targetDisplay.textContent = '';
        document.getElementById('days').textContent = '00';
        document.getElementById('hours').textContent = '00';
        document.getElementById('minutes').textContent = '00';
        document.getElementById('seconds').textContent = '00';
        return;
    }

    // Format display date
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    };
    const formattedDate = targetDate.toLocaleString('en-GB', options);

    eventLabel.innerHTML = `${event.label}: <span>${formattedDate}</span>`;

    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
        // Event has passed
        document.getElementById('days').textContent = '00';
        document.getElementById('hours').textContent = '00';
        document.getElementById('minutes').textContent = '00';
        document.getElementById('seconds').textContent = '00';

        // Show celebration
        document.getElementById('celebration').style.display = 'block';
        launchConfetti();
        clearInterval(countdownInterval);
        return;
    }

    document.getElementById('celebration').style.display = 'none';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const daysStr = String(days).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    const secondsStr = String(seconds).padStart(2, '0');

    // Animate number changes
    animateNumber('days', daysStr, previousValues.days);
    animateNumber('hours', hoursStr, previousValues.hours);
    animateNumber('minutes', minutesStr, previousValues.minutes);
    animateNumber('seconds', secondsStr, previousValues.seconds);

    previousValues = {
        days: daysStr,
        hours: hoursStr,
        minutes: minutesStr,
        seconds: secondsStr,
    };

    updateLocalTime();
}

// ===== Animate Number =====
function animateNumber(id, newValue, oldValue) {
    const el = document.getElementById(id);
    if (newValue !== oldValue) {
        el.textContent = newValue;
        el.classList.remove('number-changed');
        void el.offsetWidth; // trigger reflow
        el.classList.add('number-changed');
    }
}

// ===== Update Local Time =====
function updateLocalTime() {
    const now = new Date();
    const options = {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    };
    document.getElementById('localTime').textContent =
        'Local time: ' + now.toLocaleString('en-GB', options);
}

// ===== Audio Playlist =====
const audioFiles = [
    'audio/Beehive_Events_لحلمي_أبحرت_سفني_فعادت_تحمل_الخير_🛳️_مقطع_من_البرومو.m4a',
    'audio/Facebook 1470750324447269(m4a).m4a',
    'audio/Facebook 1567613794189465(m4a).m4a',
    'audio/عبدالفتاح_سلامه_واليوم_نلاقي_امالا_؛قد_صالت_في_النفس_وجالت_قد_صرت.m4a',
];

let shuffledPlaylist = [];
let currentTrackIndex = 0;
let audioStarted = false;

// Shuffle array (Fisher-Yates)
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function initAudio() {
    const audio = document.getElementById('bgAudio');
    shuffledPlaylist = shuffleArray(audioFiles);
    currentTrackIndex = 0;

    // When a track ends, play the next one
    audio.addEventListener('ended', () => {
        currentTrackIndex++;
        if (currentTrackIndex >= shuffledPlaylist.length) {
            shuffledPlaylist = shuffleArray(audioFiles);
            currentTrackIndex = 0;
        }
        audio.src = shuffledPlaylist[currentTrackIndex];
        audio.play().catch(() => {});
    });

    // Pre-load first track (don't auto-play, wait for user click)
    audio.src = shuffledPlaylist[currentTrackIndex];
}

function hideHint() {
    const hint = document.getElementById('audioHint');
    if (hint) {
        hint.classList.add('hidden');
        setTimeout(() => { hint.style.display = 'none'; }, 500);
    }
}

function updateAudioButton(playing) {
    const btn = document.getElementById('audioBtn');
    const btnText = document.getElementById('audioBtnText');
    if (playing) {
        btn.classList.add('playing');
        btnText.textContent = '🔊 Playing';
    } else {
        btn.classList.remove('playing');
        btnText.textContent = '🔇 Muted';
    }
}

function toggleAudio() {
    const audio = document.getElementById('bgAudio');

    if (!audioStarted) {
        // First click - start playing
        audio.play().then(() => {
            audioStarted = true;
            updateAudioButton(true);
            hideHint();
        }).catch(() => {
            // If play fails, try reloading source
            audio.src = shuffledPlaylist[currentTrackIndex];
            audio.play().then(() => {
                audioStarted = true;
                updateAudioButton(true);
                hideHint();
            }).catch(() => {});
        });
    } else if (audio.paused) {
        // Resume playing
        audio.play().then(() => {
            updateAudioButton(true);
        }).catch(() => {});
    } else {
        // Pause
        audio.pause();
        updateAudioButton(false);
    }
}

// ===== Particles =====
function createParticles() {
    const container = document.getElementById('particles');
    // Reduce particles on mobile for better scrolling performance
    const isMobile = window.innerWidth <= 768;
    const count = isMobile ? 12 : 30;

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');

        const size = Math.random() * 4 + 2;
        const left = Math.random() * 100;
        const duration = Math.random() * 15 + (isMobile ? 15 : 10); // Slower on mobile
        const delay = Math.random() * 15;

        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = left + '%';
        particle.style.animationDuration = duration + 's';
        particle.style.animationDelay = delay + 's';

        // Random colors between purple and pink
        const hue = Math.random() * 60 + 250; // 250-310 range
        particle.style.background = `radial-gradient(circle, hsla(${hue}, 80%, 65%, 0.6), transparent)`;

        container.appendChild(particle);
    }
}

// ===== Confetti =====
function launchConfetti() {
    const colors = ['#8b5cf6', '#ec4899', '#fbbf24', '#34d399', '#60a5fa', '#f472b6'];

    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.width = Math.random() * 10 + 5 + 'px';
            confetti.style.height = Math.random() * 10 + 5 + 'px';
            confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
            confetti.style.animationDuration = Math.random() * 2 + 2 + 's';
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 4000);
        }, i * 30);
    }
}
