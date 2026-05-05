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

// ===== Students Data =====
// أضف بيانات كل طالب: name, photo, track, color, social
const STUDENTS = [
    {
        name: 'Abdallah Shehawey',
        photo: 'Pic/abdallahshehawey.jpg',
        track: ['Embedded Systems','Embedded Linux', 'DevOps'],
        color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        social: {
            linkedin:  'https://www.linkedin.com/in/abdallah-shehawey',
            github:    'https://github.com/abdallah-shehawey',
            whatsapp:  '+201501899476',
            facebook:  'https://www.facebook.com/share/1BHxWsiLCE/',
        },
    },
    {
        name: 'Mohamed Adel Abd EL-Aaty',
        photo: 'Pic/',
        track: ['Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/mohamed-adel-9a34b42a7',
            whatsapp:  '+201065593315',
        },
    },
    {
        name: 'Ahmed Taha',
        photo: 'Pic/AhmedTaha.jpeg',
        track: 'Network security',
        color: 'linear-gradient(135deg, #ec4899, #be185d)',
        social: {
            linkedin:  'https://www.linkedin.com/in/ahmed-taahaa',
            whatsapp:  '+201066036829',
            facebook:  'https://www.facebook.com/Ahmed.Taahaaa',
        },
    },
    {
        name: 'Yousef Mohamed Abdelfattah',
        photo: 'Pic/Yousef.jpeg',
        track: 'Digital Design',
        color: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        social: {
            linkedin:  'https://www.linkedin.com/in/yousef-mohamed-abd-el-fattah-3b1a0328b',
            github:    'https://github.com/Yousef-fma',
            whatsapp:  '+201270809908',
            facebook:  'https://www.facebook.com/share/1AdT8F6sbq/',
        },
    },
    {
        name: 'Ramadan Khaled',
        photo: 'Pic/ramadan.jpeg',
        track: 'Digital Design',
        color: 'linear-gradient(135deg, #10b981, #047857)',
        social: {
            linkedin:  'https://www.linkedin.com/in/ramadan-khaled-80a8b3275?utm_source=share_via&utm_content=profile&utm_medium=member_ios',
            whatsapp:  '+201010634152',
            facebook:  '',
        },
    },
    {
        name: 'Ali Ibrahim',
        photo: 'Pic/ali.jpeg',
        track: 'Network',
        color: 'linear-gradient(135deg, #f59e0b, #b45309)',
        social: {
            whatsapp:  '+201023150203',
            facebook:  'https://www.facebook.com/share/18doCrAE9q/',
        },
    },
    {
        name: 'Youssef Elswase',
        photo: 'Pic/elswase.jpeg',
        track: ['Embedded System','Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/youssef-mohamed-7a21b8275',
            github:    'https://github.com/youssef-elswase',
            whatsapp:  '+201092223738',
            facebook:  'https://www.facebook.com/share/1U4nx8hwUt/',
        },
    },
    {
        name: 'Ahmed Gamal',
        photo: 'Pic/gmal.jpg',
        track: ['Embedded System','Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/ahmadgamalmansour',
            github:    'https://github.com/ahmedgamal2003',
            whatsapp:  '01006872317',
            facebook:  'https://www.facebook.com/profile.php?id=100019660395067',
        },
    },
    {
        name: 'Ahmed Abdulhameed',
        photo: 'Pic/7ameedo.jpeg',
        track: ['AI','Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/ahmed-abdulhameed-067871239/',
            github:    'https://github.com/AhmedAbdulhameed1',
            whatsapp:  '+201095468560',
        },
    },
    {
        name: 'Abdalrahman Taha',
        photo: 'Pic/bido.jpeg',
        track: ['Digital Design and Verification'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/abdalrahman-taha-493a3b237',
            github:    'https://github.com/bidotaha',
            whatsapp:  '+201117947328',
            facebook:  'https://www.facebook.com/bido.taha',
        },
    },
    {
        name: 'Abdallah Mohamed Salah',
        photo: 'Pic/salah.jpeg',
        track: ['Digital Design and Verification'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'www.linkedin.com/in/abdallah-mohamed-salah',
            github:    'https://github.com/AbdallahMoSalah',
            whatsapp:  '+201006076903',
            facebook:  'https://www.facebook.com/bdallhmhmdslah.295625/',
        },
    },
    {
        name: 'Abdalrahman Adwe',
        photo: 'Pic/adwe.jpg',
        track: ['Digital Design', 'Embedded Systems'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Abdalrahman Shaban',
        photo: 'Pic/shaban.jpg',
        track: ['Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Abdalrahman Eid',
        photo: 'Pic/eid.jpg',
        track: ['Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Mohamed Anwar',
        photo: 'Pic/anwar.jpg',
        track: ['Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Mohamed Beheiry',
        photo: 'Pic/behery.jpg',
        track: ['Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Ahmed Elsayed',
        photo: 'Pic/elsyed.jpg',
        track: ['AI', 'Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Mohamed Taha Khalifa',
        photo: 'Pic/khalifa.jpg',
        track: ['Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Mo2men Elzaghawy ',
        photo: 'Pic/momen.jpg',
        track: ['Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Omar Ahmed',
        photo: 'Pic/omar.jpg',
        track: ['Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Abdallah Saleh',
        photo: 'Pic/saleh.jpg',
        track: ['Embedded System', 'Software Testing'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Omar Elstawy',
        photo: 'Pic/setawey.jpg',
        track: ['Digital Design and Verification'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:    '',
            whatsapp:  '',
            facebook:  '',
        },
    },
];

// ===== Yearbook =====
function getInitials(name) {
    return name
        .split(' ')
        .slice(0, 2)
        .map(w => w[0])
        .join('')
        .toUpperCase();
}

const SOCIAL_CONFIG = {
    linkedin:  { icon: 'icons/linkedin.svg',   title: 'LinkedIn',  buildUrl: v => v },
    whatsapp:  { icon: 'icons/whatsapp(1).png',title: 'WhatsApp',  buildUrl: v => `https://wa.me/${v.replace(/\D/g,'')}` },
    facebook:  { icon: 'icons/facebook.svg',   title: 'Facebook',  buildUrl: v => v },
    github:    { icon: 'icons/github.svg',     title: 'GitHub',    buildUrl: v => v },
    instagram: { icon: 'icons/instagram.svg',  title: 'Instagram', buildUrl: v => v },
};

function openPhotoModal(student) {
    let modal = document.getElementById('photoModal');
    
    // Create modal if it doesn't exist
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'photoModal';
        modal.className = 'photo-modal';
        
        const closeModal = () => {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 300);
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.className === 'photo-modal-close') {
                closeModal();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        });

        document.body.appendChild(modal);
    }

    const isAvatar = !student.photo;
    
    // ── Generate Tracks HTML ──
    let tracksHtml = '';
    let tracks = student.track;
    if (tracks) {
        if (!Array.isArray(tracks)) tracks = [tracks];
        const badges = tracks.map(t => `<span class="student-track">${t}</span>`).join('');
        tracksHtml = `<div class="student-track-container">${badges}</div>`;
    }

    // ── Generate Social Buttons HTML ──
    let socialHtml = '';
    if (student.social) {
        const btns = Object.entries(student.social).map(([platform, value]) => {
            if (!value) return '';
            const cfg = SOCIAL_CONFIG[platform];
            if (!cfg) return '';
            return `
                <a class="social-btn social-${platform}" href="${cfg.buildUrl(value)}" target="_blank" rel="noopener noreferrer" title="${cfg.title}">
                    <img src="${cfg.icon}" alt="${cfg.title}" class="social-icon" />
                </a>
            `;
        }).join('');
        if (btns) {
            socialHtml = `<div class="social-links">${btns}</div>`;
        }
    }
    
    modal.innerHTML = `
        <span class="photo-modal-close">&times;</span>
        <div class="photo-modal-content">
            ${isAvatar 
                ? `<div class="photo-modal-avatar" style="background: ${student.color}">${getInitials(student.name)}</div>`
                : `<img src="${student.photo}" alt="${student.name}" />`
            }
            <h3>${student.name}</h3>
            ${tracksHtml}
            ${socialHtml}
        </div>
    `;

    modal.style.display = 'flex';
    // Trigger reflow for animation
    void modal.offsetWidth;
    modal.classList.add('active');
}

function renderYearbook(list = STUDENTS) {
    const grid      = document.getElementById('studentsGrid');
    const noResults = document.getElementById('noResults');
    if (!grid) return;
    grid.innerHTML = '';

    if (list.length === 0) {
        noResults.style.display = 'block';
        return;
    }
    noResults.style.display = 'none';

    list.forEach((student, i) => {
        const card = document.createElement('div');
        card.className = 'student-card';
        card.style.animation      = 'fadeInUp 0.5s ease-out both';
        card.style.animationDelay = `${i * 0.06}s`;

        // ── Photo wrap (using DOM API to avoid inline onerror HTML issues) ──
        const photoWrap = document.createElement('div');
        photoWrap.className = 'student-photo-wrap';

        // Make the entire card clickable
        card.style.cursor = 'pointer';
        card.title = 'Click to view details';
        card.addEventListener('click', (e) => {
            // Prevent opening modal if they clicked a social button on the small card
            if (!e.target.closest('.social-btn')) {
                openPhotoModal(student);
            }
        });

        if (student.photo) {
            const img = document.createElement('img');
            img.className = 'student-photo';
            img.src = student.photo;
            img.alt = student.name;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => {
                // Swap image with avatar on load failure
                student.photo = null; // Update student object for modal fallback
                const av = document.createElement('div');
                av.className = 'student-avatar';
                av.style.background = student.color;
                av.textContent = getInitials(student.name);
                photoWrap.replaceChild(av, img);
            });
            photoWrap.appendChild(img);
        } else {
            const av = document.createElement('div');
            av.className = 'student-avatar';
            av.style.background = student.color;
            av.textContent = getInitials(student.name);
            photoWrap.appendChild(av);
        }

        // ── Name ──
        const nameEl = document.createElement('p');
        nameEl.className = 'student-name';
        nameEl.textContent = student.name;

        // ── Track badge(s) ──
        const trackContainer = document.createElement('div');
        trackContainer.className = 'student-track-container';
        
        let tracks = student.track;
        if (tracks) {
            if (!Array.isArray(tracks)) tracks = [tracks];
            tracks.forEach(trackName => {
                const trackEl = document.createElement('span');
                trackEl.className = 'student-track';
                trackEl.textContent = trackName;
                trackContainer.appendChild(trackEl);
            });
        }

        // ── Social buttons ──
        const socialRow = document.createElement('div');
        socialRow.className = 'social-links';

        if (student.social) {
            Object.entries(student.social).forEach(([platform, value]) => {
                if (!value) return;
                const cfg = SOCIAL_CONFIG[platform];
                if (!cfg) return;

                const a = document.createElement('a');
                a.className = `social-btn social-${platform}`;
                a.href      = cfg.buildUrl(value);
                a.target    = '_blank';
                a.rel       = 'noopener noreferrer';
                a.title     = cfg.title;

                const img = document.createElement('img');
                img.src = cfg.icon;
                img.alt = cfg.title;
                img.className = 'social-icon';
                a.appendChild(img);

                socialRow.appendChild(a);
            });
        }

        card.appendChild(photoWrap);
        card.appendChild(nameEl);
        if (trackContainer.children.length > 0) card.appendChild(trackContainer);
        if (socialRow.children.length > 0) card.appendChild(socialRow);

        grid.appendChild(card);
    });
}

function filterStudents(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
        renderYearbook(STUDENTS);
        return;
    }
    const filtered = STUDENTS.filter(s => {
        // Search by name
        if (s.name.toLowerCase().includes(q)) return true;
        // Search by track (supports string or array)
        if (s.track) {
            const tracks = Array.isArray(s.track) ? s.track : [s.track];
            if (tracks.some(t => t.toLowerCase().includes(q))) return true;
        }
        return false;
    });
    renderYearbook(filtered);
}



let currentTab = 'exam';
let currentMode = 'countdown';
let countdownInterval = null;
let previousValues = { days: '', hours: '', minutes: '', seconds: '' };

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    startCountdown();
    updateLocalTime();
    initAudio();
    renderYearbook();
});

// ===== Mode Switching (Top-Level) =====
function switchMode(mode) {
    currentMode = mode;

    // Update mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

    // Show/hide sections
    const countdownEl = document.getElementById('mode-countdown');
    const yearbookEl  = document.getElementById('mode-yearbook');

    if (mode === 'countdown') {
        countdownEl.style.display = 'flex';
        yearbookEl.style.display  = 'none';
    } else {
        countdownEl.style.display = 'none';
        yearbookEl.style.display  = 'block';
        // Clear search on open
        document.getElementById('yearbookSearch').value = '';
        filterStudents('');
    }
}


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
    const count = isMobile ? 50 : 120;

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');

        const size = Math.random() * 4 + 2;
        const left = Math.random() * 100;
        const duration = Math.random() * 15 + (isMobile ? 15 : 10); // Slower on mobile
        // Use negative delay so the animation starts immediately but at a random point in its timeline
        const delay = -(Math.random() * 30);

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


