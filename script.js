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
const STUDENTS = [
    {
        name: 'Abdallah Shehawey',
        photo: 'Pic/abdallahshehawey.jpg',
        track: ['Embedded Systems', 'Embedded Linux', 'DevOps'],
        color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        social: {
            linkedin:  'https://www.linkedin.com/in/abdallah-shehawey',
            github:  'https://github.com/abdallah-shehawey',
            whatsapp:  '+201501899476',
            facebook:  'https://www.facebook.com/share/1BHxWsiLCE/',
        },
    },
    {
        name: 'Abdallah Mohamed Salah',
        photo: 'Pic/salah.jpg',
        track: ['Digital Design & Verification'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'www.linkedin.com/in/abdallah-mohamed-salah',
            github:  'https://github.com/AbdallahMoSalah',
            whatsapp:  '+201006076903',
            facebook:  'https://www.facebook.com/bdallhmhmdslah.295625/',
        },
    },
    {
        name: 'Abdelrahman Adwe',
        photo: 'Pic/adwe.jpg',
        track: ['Digital IC Design & Verification', 'Embedded Systems'],
        color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        social: {
            linkedin:  'https://www.linkedin.com/in/abdelrhman-adwe/',
            github:  'https://github.com/abdelrahmanadwe',
            whatsapp:  '+201093980406',
            facebook:  'https://www.facebook.com/share/1BLCftWCZ3/',
        },
    },
    {
        name: 'Abdelrahman Taha',
        photo: 'Pic/bido.jpeg',
        track: ['Digital Design and Verification'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/abdalrahman-taha-493a3b237',
            github:  'https://github.com/bidotaha',
            whatsapp:  '+201117947328',
            facebook:  'https://www.facebook.com/bido.taha',
        },
    },
    {
        name: 'Abdelrahman Shaban',
        photo: 'Pic/shaban.jpg',
        track: ['Network Engineer'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/abdelrahman-shaban-470834243',
            whatsapp:  '+201115737513',
            facebook:  'https://www.facebook.com/share/1F175p8e6d/',
        },
    },
    {
        name: 'Ahmed Abdulhameed',
        photo: 'Pic/7ameedo.jpeg',
        track: ['AI', 'Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/ahmed-abdulhameed-067871239/',
            github:  'https://github.com/AhmedAbdulhameed1',
            whatsapp:  '+201095468560',
        },
    },
    {
        name: 'Ahmed Elsayed',
        photo: 'Pic/elsyed.jpg',
        track: ['AI', 'Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/ahmad-elsayed-bab65b291',
            whatsapp:  '+201067628053',
            facebook:  'https://www.facebook.com/share/1BGSgEkoaD/',
        },
    },
    {
        name: 'Ahmed Gamal',
        photo: 'Pic/gmal.jpg',
        track: ['Embedded System', 'Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/ahmadgamalmansour',
            github:  'https://github.com/ahmedgamal2003',
            whatsapp:  '01006872317',
            facebook:  'https://www.facebook.com/profile.php?id=100019660395067',
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
        name: 'Anas Ghazy',
        photo: 'Pic/anas.jpeg',
        track: ['Network Engineer'],
        color: 'linear-gradient(135deg, #ec4899, #be185d)',
        social: {
            linkedin:  'https://www.linkedin.com/in/anas-ghazy-aaa896323',
            whatsapp:  '+201025145996',
            facebook:  'https://www.facebook.com/share/173eunCXL5/?mibextid=wwXIfr',
        },
    },
    {
        name: 'Mohamed Adel',
        photo: 'Pic/adel.jpeg',
        track: ['Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/mohamed-adel-9a34b42a7',
            whatsapp:  '+201065593315',
        },
    },
    {
        name: 'Mohamed Anwar',
        photo: 'Pic/anwar.jpg',
        track: ['Digital IC Design & Verification'],
        color: 'linear-gradient(135deg, #0ea5e9, #1e3a8a)',
        social: {
            linkedin:  'https://www.linkedin.com/in/mohammed-anwar-170727279',
            github:  'https://github.com/MohammedAnwar2244',
            whatsapp:  '+201104910528',
            facebook:  'https://www.facebook.com/share/1BPhMMCQjX/',
        },
    },
    {
        name: 'Mohamed Behiry',
        photo: 'Pic/behery.jpg',
        track: ['Network Engineering', 'Network Security'],
        color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        social: {
            linkedin:  'https://www.linkedin.com/in/mohamed-behiry-462055240',
            github:  'https://github.com/Mohammed-Abdelfatth',
            whatsapp:  '+201023198792',
            facebook:  'https://www.facebook.com/share/18KvrPxGj2/',
        },
    },
    {
        name: 'Mohamed Elsayed Eldokhmisy',
        photo: 'Pic/dokhmis.jpeg',
        track: ['Digital Design & Verification'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/mohamed-elsayed-eldokhmisy/',
            github:  'https://github.com/mohamedesayd',
            whatsapp:  '+201024105435',
            facebook:  'https://www.facebook.com/share/1BAUNC4B27/',
        },
    },
    {
        name: 'Mohamed Emadeldin',
        photo: 'Pic/mohemad.jpg',
        track: ['Digital IC Design', 'Digital IC Verification'],
        color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        social: {
            linkedin:  'https://www.linkedin.com/in/mohamed-emadeldin-202954239/',
            github:  'https://github.com/Moh-Emadeldin',
            whatsapp:  '',
            facebook:  'https://www.facebook.com/mohamed58emad',
        },
    },
    {
        name: 'Mohammed Taha Khalifa',
        photo: 'Pic/khalifa.jpg',
        track: ['Network'],
        color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        social: {
            linkedin:  'https://www.linkedin.com/in/mohammed-taha-khalifa-8264a5349',
            whatsapp:  '+201127326706',
            facebook:  'https://www.facebook.com/share/1BY2TNDX8y/',
        },
    },
    {
        name: 'Momen Elzaghawy',
        photo: 'Pic/momen.jpg',
        track: ['Digital Design', 'Digital Verification', 'Asic Verification'],
        color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        social: {
            linkedin:  'linkedin.com/in/momenelzaghawy',
            github:  'https://github.com/momenelzaghawy',
            whatsapp:  '+201002115038',
            facebook:  'https://www.facebook.com/share/1BHxWsiLCE/',
        },
    },
    {
        name: 'Omar Ahmed',
        photo: 'Pic/omar.jpg',
        track: ['Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:  '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Omar Elstawy',
        photo: 'Pic/setawey.jpg',
        track: ['Network', 'Embedded Systems', 'Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:  '',
            whatsapp:  '',
            facebook:  '',
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
        name: 'Yousef Mohamed Abdelfattah',
        photo: 'Pic/Yousef.jpeg',
        track: 'Digital Design',
        color: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        social: {
            linkedin:  'https://www.linkedin.com/in/yousef-mohamed-abd-el-fattah-3b1a0328b',
            github:  'https://github.com/Yousef-fma',
            whatsapp:  '+201270809908',
            facebook:  'https://www.facebook.com/share/1AdT8F6sbq/',
        },
    },
    {
        name: 'Youssef Elswase',
        photo: 'Pic/elswase.jpeg',
        track: ['Embedded System', 'Digital Design'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  'https://www.linkedin.com/in/youssef-mohamed-7a21b8275',
            github:  'https://github.com/youssef-elswase',
            whatsapp:  '+201092223738',
            facebook:  'https://www.facebook.com/share/1U4nx8hwUt/',
        },
    },
    {
        name: 'Abdallah Saleh',
        photo: 'Pic/saleh.jpg',
        track: ['Embedded System', 'Software Testing'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:  '',
            whatsapp:  '',
            facebook:  '',
        },
    },
    {
        name: 'Abdelrahman Eid',
        photo: 'Pic/eid.jpg',
        track: ['Network'],
        color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        social: {
            linkedin:  '',
            github:  '',
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
    email:     { icon: 'icons/email.svg',      title: 'Email',     buildUrl: v => `mailto:${v}` },
};

function openPhotoModal(student) {
    let modal = document.getElementById('photoModal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'photoModal';
        modal.className = 'photo-modal';
        
        modal.closeModal = (fromPopState = false) => {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 300);
            if (!fromPopState && window.location.hash === '#student') {
                history.back();
            }
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.className === 'photo-modal-close') {
                modal.closeModal();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                modal.closeModal();
            }
        });

        // Handle hardware back button
        window.addEventListener('popstate', (e) => {
            if (modal.style.display === 'flex' && window.location.hash !== '#student') {
                modal.closeModal(true);
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

    // ── Team Leader Badge HTML ──
    const leaderBadgeHtml = student.teamLeader
        ? `<div class="modal-leader-badge">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
               Team Leader
           </div>`
        : '';

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
            ${leaderBadgeHtml}
            ${tracksHtml}
            ${socialHtml}
        </div>
    `;

    modal.style.display = 'flex';
    // Trigger reflow for animation
    void modal.offsetWidth;
    modal.classList.add('active');

    // Add state to browser history for mobile back button
    if (window.location.hash !== '#student') {
        history.pushState(null, '', '#student');
    }
}

function openContactModal() {
    const devInfo = {
        name: 'Abdallah Shehawey',
        photo: 'Pic/abdallahshehawey.jpg',
        track: ['Embedded Systems', 'Embedded Linux', 'DevOps'],
        color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        social: {
            linkedin:  'https://www.linkedin.com/in/abdallah-shehawey',
            github:  'https://github.com/abdallah-shehawey',
            whatsapp:  '+201501899476',
            facebook:  'https://www.facebook.com/share/1BHxWsiLCE/',
            email: 'shehawey9@gmail.com'
        },
    };
    openPhotoModal(devInfo);
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

let selectedCategories = new Set();
let currentSearchQuery = '';

function getStudentCategories(student) {
    let tracks = student.track;
    if (!tracks) return new Set();
    if (!Array.isArray(tracks)) tracks = [tracks];
    
    let categories = new Set();
    tracks.forEach(track => {
        const t = track.toLowerCase();
        if (t.includes('embedded')) categories.add('Embedded');
        else if (t.includes('digital') || t.includes('ic') || t.includes('asic')) categories.add('Digital Design');
        else if (t.includes('network')) categories.add('Network');
        else if (t.includes('ai')) categories.add('AI');
        else if (t.includes('devops')) categories.add('DevOps');
        else if (t.includes('test')) categories.add('Software Testing');
        else categories.add(track);
    });
    return categories;
}

function renderStats() {
    const statsContainer = document.getElementById('yearbookStats');
    if (!statsContainer) return;

    let trackCounts = {};
    
    STUDENTS.forEach(s => {
        const cats = getStudentCategories(s);
        cats.forEach(cat => {
            trackCounts[cat] = (trackCounts[cat] || 0) + 1;
        });
    });

    const statsData = [
        { category: 'All', label: 'Students', count: STUDENTS.length }
    ];

    // Sort tracks by count (descending)
    const sortedCategories = Object.entries(trackCounts).sort((a, b) => b[1] - a[1]);

    sortedCategories.forEach(([cat, count]) => {
        let label = cat;
        if (cat === 'Embedded' || cat === 'AI' || cat === 'Network' || cat === 'DevOps') {
            label += ' Engineers';
        } else if (cat === 'Digital Design') {
            label = 'Digital Designers';
        }
        statsData.push({ category: cat, label: label, count: count });
    });

    statsContainer.innerHTML = statsData.map(stat => {
        const isActive = stat.category === 'All' 
            ? selectedCategories.size === 0 
            : selectedCategories.has(stat.category);
        return `
        <div class="stat-item ${isActive ? 'active-filter' : ''}" data-category="${stat.category}" onclick="toggleCategoryFilter('${stat.category}')">
            <span class="stat-number" data-target="${stat.count}">0</span>
            <span class="stat-label">${stat.label}</span>
        </div>
        `;
    }).join('');

    // Animate counters
    const statNumbers = document.querySelectorAll('.stat-number');
    statNumbers.forEach(el => {
        const target = +el.getAttribute('data-target');
        const duration = 1500; // ms
        const frameDuration = 1000 / 60;
        const totalFrames = Math.round(duration / frameDuration);
        let frame = 0;
        
        const counter = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            const easeOut = 1 - (1 - progress) * (1 - progress);
            const currentCount = Math.round(target * easeOut);
            
            el.textContent = currentCount;
            if (frame >= totalFrames) {
                el.textContent = target;
                clearInterval(counter);
            }
        }, frameDuration);
    });
}

function toggleCategoryFilter(cat) {
    if (cat === 'All') {
        selectedCategories.clear();
    } else {
        if (selectedCategories.has(cat)) {
            selectedCategories.delete(cat);
        } else {
            selectedCategories.add(cat);
        }
    }
    
    const statItems = document.querySelectorAll('.stat-item');
    statItems.forEach(item => {
        const itemCat = item.getAttribute('data-category');
        if (itemCat === 'All') {
            item.classList.toggle('active-filter', selectedCategories.size === 0);
        } else {
            item.classList.toggle('active-filter', selectedCategories.has(itemCat));
        }
    });
    
    applyFilters();
}

function filterStudents(query) {
    currentSearchQuery = query.trim().toLowerCase();
    applyFilters();
}

function applyFilters() {
    const filtered = STUDENTS.filter(s => {
        // Text search
        let matchesText = true;
        if (currentSearchQuery) {
            const inName = s.name.toLowerCase().includes(currentSearchQuery);
            let inTrack = false;
            if (s.track) {
                const tracks = Array.isArray(s.track) ? s.track : [s.track];
                inTrack = tracks.some(t => t.toLowerCase().includes(currentSearchQuery));
            }
            matchesText = inName || inTrack;
        }
        
        // Category search (OR logic if multiple selected)
        let matchesCategory = true;
        if (selectedCategories.size > 0) {
            const sCats = getStudentCategories(s);
            matchesCategory = Array.from(selectedCategories).some(c => sCats.has(c));
        }
        
        return matchesText && matchesCategory;
    });
    
    renderYearbook(filtered);
}



// ===== Graduation Projects Data =====
const GRADUATION_PROJECTS = [
    // ── Network ──
    {
        category: 'Network',
        icon: '🌐',
        team: [
            { name: 'Ahmed Taha',          leader: true  },
            { name: 'Abdelrahman Shaban',  leader: false },
            { name: 'Abdelrahman Eid',     leader: false },
            { name: 'Omar Elstawy',        leader: false },
            { name: 'Ali Ibrahim',         leader: false },
            { name: 'Mahmoud Nassar',      leader: false },
        ],
    },
    {
        category: 'Network',
        icon: '📡',
        team: [
            { name: 'Mohamed Saeed',         leader: true  },
            { name: 'Mohammed Taha Khalifa', leader: false },
            { name: 'Mohamed Behiry',        leader: false },
            { name: 'Ahmed Elsayed',         leader: false },
            { name: 'Anas Ghazy',            leader: false },
            { name: 'Eslam Ahmed',           leader: false },
        ],
    },
    // ── Embedded ──
    {
        category: 'Embedded',
        icon: '🔌',
        team: [
            { name: 'Abdallah Shehawey', leader: true  },
            { name: 'Ahmed Gamal',       leader: false },
            { name: 'Abdallah Saleh',    leader: false },
        ],
    },
    // ── Digital ──
    {
        category: 'Digital',
        icon: '⚡',
        team: [
            { name: 'Abdallah Mohamed Salah',     leader: true  },
            { name: 'Mohamed Adel',           leader: false },
            { name: 'Abdelrahman Adwe',               leader: false },
            { name: 'Yousef Mohamed Abdelfattah', leader: false },
            { name: 'Mohamed Elsayed Eldokhmisy', leader: false },
            { name: 'Momen Elzaghawy',            leader: false },
            { name: 'Mohamed Anwar',              leader: false },
            
        ],
    },
    {
        category: 'Digital',
        icon: '🧠',
        team: [
            { name: 'Omar Ahmed',        leader: true  },
            { name: 'Youssef Elswase',   leader: false },
            { name: 'Ramadan Khaled', leader: false },
            { name: 'Mohamed Emadeldin', leader: false },
            { name: 'Abdelrahman Taha',  leader: false },
            { name: 'Ahmed Abdulhameed',   leader: false },
            
        ],
    },
];

let currentProjectCat = 'Digital';

// SVG icons per project category
const PROJ_ICONS = {
    Digital:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>`,
    Embedded: `<img src="icons/embedded_icon.png" alt="Embedded" class="proj-card-img-icon" />`,
    Network:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

// Display labels for category badges
const CAT_LABELS = {
    Digital:  'Digital Design',
    Embedded: 'Embedded Systems',
    Network:  'Network',
};

function switchProjectCat(cat) {
    currentProjectCat = cat;

    // Update tab active state
    document.querySelectorAll('.project-tab').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-pcat="${cat}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    renderProjects();
}

function renderProjects() {
    const grid = document.getElementById('projectsGrid');
    if (!grid) return;

    const filtered = GRADUATION_PROJECTS.filter(p => p.category === currentProjectCat);

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="no-projects">No projects found in this category.</p>';
        return;
    }

    grid.innerHTML = '';
    const catKey = currentProjectCat.toLowerCase();

    filtered.forEach((project, idx) => {
        const card = document.createElement('div');
        card.className = `project-card cat-${catKey}`;
        card.style.animationDelay = `${idx * 0.1}s`;

        // ── Card Top: badge + icon ──
        const cardTop = document.createElement('div');
        cardTop.className = 'project-card-top';
        const iconSvg = PROJ_ICONS[project.category] || '';
        const catLabel = CAT_LABELS[project.category] || project.category;
        cardTop.innerHTML = `
            <span class="project-cat-badge cat-${catKey}">${iconSvg} ${catLabel}</span>
            <div class="project-card-icon cat-${catKey}">${iconSvg}</div>
        `;

        // ── Coming Soon Body ──
        const comingSoonEl = document.createElement('div');
        comingSoonEl.className = 'project-coming-soon';
        comingSoonEl.innerHTML = `
            <div class="cs-pulse-ring"></div>
            <span class="cs-clock">🕐</span>
            <span class="cs-text">Coming Soon</span>
            <span class="cs-sub">Details will be announced shortly</span>
        `;

        // ── Team Section ──
        const teamSection = document.createElement('div');
        teamSection.className = 'project-team';

        const teamLabel = document.createElement('span');
        teamLabel.className = 'project-team-label';
        teamLabel.textContent = 'Team';

        const membersRow = document.createElement('div');
        membersRow.className = 'project-members';

        project.team.forEach(member => {
            const student = STUDENTS.find(s => s.name === member.name);

            const pill = document.createElement('button');
            pill.className = 'project-member-pill' + (member.leader ? ' is-leader' : '');
            pill.title = member.leader ? `${member.name} — Team Leader` : member.name;
            pill.type = 'button';

            // Crown for leader — star SVG
            if (member.leader) {
                const leaderIcon = document.createElement('span');
                leaderIcon.className = 'leader-icon';
                leaderIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
                pill.appendChild(leaderIcon);
            }

            // Avatar
            if (student && student.photo) {
                const img = document.createElement('img');
                img.src = student.photo;
                img.alt = member.name;
                img.className = 'member-avatar-sm';
                img.addEventListener('error', () => {
                    const fb = document.createElement('span');
                    fb.className = 'member-avatar-sm-initials';
                    fb.style.background = student.color;
                    fb.textContent = getInitials(member.name);
                    img.replaceWith(fb);
                });
                pill.appendChild(img);
            } else {
                const av = document.createElement('span');
                av.className = 'member-avatar-sm-initials';
                av.style.background = student ? student.color : 'linear-gradient(135deg,#8b5cf6,#ec4899)';
                av.textContent = getInitials(member.name);
                pill.appendChild(av);
            }

            const nameSpan = document.createElement('span');
            nameSpan.textContent = member.name.split(' ').slice(0, 2).join(' ');
            pill.appendChild(nameSpan);

            // Click → open student modal (pass teamLeader flag for leaders)
            if (student) {
                pill.style.cursor = 'pointer';
                const studentData = member.leader ? { ...student, teamLeader: true } : student;
                pill.addEventListener('click', () => openPhotoModal(studentData));
            } else {
                pill.style.cursor = 'default';
                pill.style.opacity = '0.7';
            }

            membersRow.appendChild(pill);
        });

        teamSection.appendChild(teamLabel);
        teamSection.appendChild(membersRow);

        card.appendChild(cardTop);
        card.appendChild(comingSoonEl);
        card.appendChild(teamSection);

        grid.appendChild(card);
    });
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
    const projectsEl  = document.getElementById('mode-projects');

    countdownEl.style.display = 'none';
    yearbookEl.style.display  = 'none';
    projectsEl.style.display  = 'none';

    if (mode === 'countdown') {
        countdownEl.style.display = 'flex';
    } else if (mode === 'yearbook') {
        yearbookEl.style.display = 'block';
        // Clear search on open
        document.getElementById('yearbookSearch').value = '';
        currentSearchQuery = '';
        selectedCategories.clear();
        applyFilters();
        renderStats();
    } else if (mode === 'projects') {
        projectsEl.style.display = 'block';
        renderProjects();
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
    const isMobile = window.innerWidth <= 768;
    const count = isMobile ? 25 : 120;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');

        const size = Math.random() * 3 + 1.5;
        const left = Math.random() * 100;
        const duration = Math.random() * 15 + (isMobile ? 20 : 10);
        const delay = -(Math.random() * 50);

        particle.style.cssText = `
            width:${size}px;
            height:${size}px;
            left:${left}%;
            animation-duration:${duration}s;
            animation-delay:${delay}s;
            background:${isMobile
                ? `hsla(${Math.random()*60+250},70%,65%,0.5)`
                : `radial-gradient(circle,hsla(${Math.random()*60+250},80%,65%,0.6),transparent)`
            };
        `;

        fragment.appendChild(particle);
    }
    container.appendChild(fragment);
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
