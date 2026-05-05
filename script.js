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
    custom: {
        label: 'Custom Date',
        date: null,
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
});

// ===== Tab Switching =====
function switchTab(tab) {
    currentTab = tab;

    // Update active tab styling
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    // Toggle date picker
    const datePicker = document.getElementById('datePickerContainer');
    datePicker.style.display = tab === 'custom' ? 'block' : 'none';

    // Reset previous values to force update
    previousValues = { days: '', hours: '', minutes: '', seconds: '' };

    startCountdown();
}

// ===== Set Custom Date =====
function setCustomDate() {
    const input = document.getElementById('customDateInput');
    if (input.value) {
        EVENTS.custom.date = new Date(input.value);
        EVENTS.custom.label = 'Custom Date';
        previousValues = { days: '', hours: '', minutes: '', seconds: '' };
        startCountdown();
    }
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
    const formattedDate = targetDate.toLocaleString('en-US', options);

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
        'Local time: ' + now.toLocaleString('en-US', options);
}

// ===== Audio Toggle =====
let isPlaying = false;

function toggleAudio() {
    const audio = document.getElementById('bgAudio');
    const btn = document.getElementById('audioBtn');
    const btnText = document.getElementById('audioBtnText');

    if (isPlaying) {
        audio.pause();
        btn.classList.remove('playing');
        btnText.textContent = 'Play Audio';
        isPlaying = false;
    } else {
        audio.play().catch(() => {
            // Autoplay blocked
        });
        btn.classList.add('playing');
        btnText.textContent = 'Pause Audio';
        isPlaying = true;
    }
}

// ===== Particles =====
function createParticles() {
    const container = document.getElementById('particles');
    const count = 25;

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');

        const size = Math.random() * 4 + 2;
        const left = Math.random() * 100;
        const duration = Math.random() * 15 + 10;
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
