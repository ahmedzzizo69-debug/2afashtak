// Database class using IndexedDB for robust local storage
class LocalDB {
    constructor(dbName, version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => reject("Database error: " + event.target.errorCode);

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Create object store for items
                if (!db.objectStoreNames.contains('items')) {
                    const store = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('type', 'type', { unique: false }); // 'lost' or 'found'
                    store.createIndex('status', 'status', { unique: false }); // 'active' or 'resolved'
                    store.createIndex('category', 'category', { unique: false });
                }

                // Create object store for users
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                    userStore.createIndex('email', 'email', { unique: true });
                }
            };
        });
    }

    addItem(item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['items'], 'readwrite');
            const store = transaction.objectStore('items');
            
            // Add metadata
            item.timestamp = new Date().toISOString();
            item.status = 'active';

            const request = store.add(item);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    getAllItems() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['items'], 'readonly');
            const store = transaction.objectStore('items');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    updateItemStatus(id, status) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['items'], 'readwrite');
            const store = transaction.objectStore('items');
            
            const getRequest = store.get(id);
            getRequest.onsuccess = () => {
                const item = getRequest.result;
                item.status = status;
                const updateRequest = store.put(item);
                updateRequest.onsuccess = () => resolve();
                updateRequest.onerror = () => reject(updateRequest.error);
            };
        });
    }

    // User Methods
    addUser(user) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['users'], 'readwrite');
            const store = transaction.objectStore('users');
            const request = store.add(user);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['users'], 'readonly');
            const store = transaction.objectStore('users');
            const index = store.index('email');
            const request = index.get(email);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// App Logic
const db = new LocalDB('LostAndFoundDB');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await db.init();
        checkSession();
        loadDashboard();
    } catch (e) {
        console.error("Failed to initialize database", e);
        showToast("Database initialization failed!", true);
    }

    // Navigation setup
    const navLinks = document.querySelectorAll('.nav-links a');
    const tabs = document.querySelectorAll('.tab-content');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-tab');
            
            // Update active state on links
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Switch tabs
            tabs.forEach(tab => {
                tab.classList.remove('active');
                if(tab.id === target) {
                    tab.classList.add('active');
                }
            });

            // Specific tab actions
            if (target === 'dashboard') loadDashboard();
            if (target === 'search') loadSearch();
        });
    });

    // Form Submissions
    document.getElementById('form-lost').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (!user) {
            showToast("Please sign in to report an item", true);
            document.getElementById('nav-auth').click();
            return;
        }

        const item = {
            type: 'lost',
            userId: user.id,
            title: document.getElementById('lost-title').value,
            category: document.getElementById('lost-category').value,
            location: document.getElementById('lost-location').value,
            date: document.getElementById('lost-date').value,
            description: document.getElementById('lost-desc').value
        };

        await db.addItem(item);
        e.target.reset();
        showToast("Lost item reported successfully!");
        checkForMatches(item);
        loadDashboard(); // Refresh background data
    });

    document.getElementById('form-found').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (!user) {
            showToast("Please sign in to register an item", true);
            document.getElementById('nav-auth').click();
            return;
        }

        const item = {
            type: 'found',
            userId: user.id,
            title: document.getElementById('found-title').value,
            category: document.getElementById('found-category').value,
            location: document.getElementById('found-location').value,
            date: document.getElementById('found-date').value,
            description: document.getElementById('found-desc').value
        };

        await db.addItem(item);
        e.target.reset();
        showToast("Found item registered successfully!");
        checkForMatches(item);
        loadDashboard(); // Refresh background data
    });

    // Search logic
    document.getElementById('search-btn').addEventListener('click', loadSearch);
    document.getElementById('search-input').addEventListener('keyup', (e) => {
        if(e.key === 'Enter') loadSearch();
    });

    // Modal Logic
    const modal = document.getElementById('schema-modal');
    const schemaBtn = document.getElementById('view-schema-btn');
    const closeBtn = document.querySelector('.close-modal');

    schemaBtn.onclick = () => modal.classList.add('show');
    closeBtn.onclick = () => modal.classList.remove('show');
    window.onclick = (e) => { if(e.target == modal) modal.classList.remove('show'); }

    // Schema Tabs
    const schemaTabs = document.querySelectorAll('.schema-tab');
    const schemaViews = document.querySelectorAll('.schema-view');

    schemaTabs.forEach(tab => {
        tab.onclick = () => {
            schemaTabs.forEach(t => t.classList.remove('active'));
            schemaViews.forEach(v => v.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`schema-${tab.dataset.schema}`).classList.add('active');
        };
    });

    // Auth Tab Switching
    const authTabs = document.querySelectorAll('.auth-tab');
    const authForms = document.querySelectorAll('.auth-form');

    authTabs.forEach(tab => {
        tab.onclick = () => {
            authTabs.forEach(t => t.classList.remove('active'));
            authForms.forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`form-${tab.dataset.form}`).classList.add('active');
        };
    });

    // Signup Submission
    document.getElementById('form-signup').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = {
            name: document.getElementById('signup-name').value,
            email: document.getElementById('signup-email').value,
            phone: document.getElementById('signup-phone').value,
            password: document.getElementById('signup-password').value
        };

        try {
            await db.addUser(user);
            showToast("Account created! Please login.");
            document.querySelector('.auth-tab[data-form="login"]').click();
        } catch (err) {
            showToast("Email already exists!", true);
        }
    });

    // Login Submission
    document.getElementById('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const user = await db.getUserByEmail(email);
        if (user && user.password === password) {
            localStorage.setItem('currentUser', JSON.stringify(user));
            showToast(`Welcome back, ${user.name}!`);
            checkSession();
            // Go to dashboard
            document.querySelector('.nav-links a[data-tab="dashboard"]').click();
        } else {
            showToast("Invalid email or password", true);
        }
    });

    // Logout
    document.getElementById('logout-btn').onclick = () => {
        localStorage.removeItem('currentUser');
        showToast("Logged out successfully");
        checkSession();
        document.querySelector('.nav-links a[data-tab="dashboard"]').click();
    };
});

function checkSession() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    const navAuth = document.getElementById('nav-auth');
    
    if (user) {
        navAuth.textContent = user.name.split(' ')[0];
        navAuth.setAttribute('data-tab', 'profile');
        document.getElementById('profile-name').textContent = user.name;
        document.getElementById('profile-email').textContent = user.email;
        loadMyItems(user.id);
    } else {
        navAuth.textContent = 'Sign In';
        navAuth.setAttribute('data-tab', 'auth');
    }
}

async function loadMyItems(userId) {
    const items = await db.getAllItems();
    const myItems = items.filter(item => item.userId === userId);
    renderItems(myItems, 'my-items-grid');
}

async function loadDashboard() {
    const items = await db.getAllItems();
    
    let lostCount = 0;
    let foundCount = 0;
    let resolvedCount = 0;

    items.forEach(item => {
        if(item.status === 'resolved') resolvedCount++;
        else if(item.type === 'lost') lostCount++;
        else if(item.type === 'found') foundCount++;
    });

    // Animate numbers
    animateValue('stat-lost', lostCount);
    animateValue('stat-found', foundCount);
    animateValue('stat-resolved', resolvedCount);

    // Populate recent items (last 6)
    const recentItems = items.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 6);
    renderItems(recentItems, 'recent-items-grid');
}

async function loadSearch() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const items = await db.getAllItems();
    
    const filtered = items.filter(item => {
        return item.status === 'active' && 
               (item.title.toLowerCase().includes(query) || 
                item.description.toLowerCase().includes(query) ||
                item.location.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query));
    });

    renderItems(filtered, 'search-results-grid');
}

function renderItems(items, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if(items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1/-1; text-align:center;">No items found.</p>';
        return;
    }

    items.forEach(item => {
        const icon = getCategoryIcon(item.category);
        const card = document.createElement('div');
        card.className = `item-card ${item.type}`;
        
        card.innerHTML = `
            <div class="item-image-placeholder">
                ${icon}
            </div>
            <div class="item-details">
                <span class="item-badge ${item.type}">${item.type.toUpperCase()}</span>
                <h4 class="item-title">${item.title}</h4>
                <div class="item-meta">
                    <p>📍 ${item.location}</p>
                    <p>📅 ${item.date}</p>
                </div>
                <p class="item-desc">${item.description}</p>
                ${item.status === 'active' ? `<button class="item-match-btn" onclick="markResolved(${item.id})">Mark as Resolved</button>` : `<p style="color: var(--success); font-weight: bold;">Resolved ✓</p>`}
            </div>
        `;
        container.appendChild(card);
    });
}

// Ensure function is available globally for inline onclick handlers
window.markResolved = async function(id) {
    if(confirm("Are you sure you want to mark this item as resolved?")) {
        await db.updateItemStatus(id, 'resolved');
        showToast("Item marked as resolved!");
        loadDashboard();
        if(document.getElementById('search').classList.contains('active')) {
            loadSearch();
        }
    }
}

// Simple matching algorithm
async function checkForMatches(newItem) {
    const items = await db.getAllItems();
    const oppositeType = newItem.type === 'lost' ? 'found' : 'lost';
    
    const matches = items.filter(item => {
        if(item.type !== oppositeType || item.status !== 'active') return false;
        if(item.category !== newItem.category) return false;
        
        // Basic keyword matching in title or description
        const newWords = newItem.title.toLowerCase().split(' ').concat(newItem.description.toLowerCase().split(' '));
        const targetString = item.title.toLowerCase() + " " + item.description.toLowerCase();
        
        let matchScore = 0;
        newWords.forEach(word => {
            if(word.length > 3 && targetString.includes(word)) matchScore++;
        });

        return matchScore > 0;
    });

    if(matches.length > 0) {
        setTimeout(() => {
            alert(`We found ${matches.length} potential match(es) for your ${newItem.type} item! Check the Search tab and filter by category: ${newItem.category}.`);
        }, 1500);
    }
}

function getCategoryIcon(category) {
    const icons = {
        'Electronics': '📱',
        'Wallet/Purse': '👛',
        'Keys': '🔑',
        'Jewelry': '💍',
        'Documents': '📄',
        'Other': '📦'
    };
    return icons[category] || '📦';
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    if(isError) {
        toast.style.background = 'linear-gradient(135deg, var(--danger), #991b1b)';
    } else {
        toast.style.background = 'linear-gradient(135deg, var(--success), #047857)';
    }
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function animateValue(id, end) {
    const obj = document.getElementById(id);
    const start = parseInt(obj.innerText) || 0;
    if(start === end) return;
    
    let current = start;
    const range = end - start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(1000 / range)) || 50;
    
    const timer = setInterval(() => {
        current += increment;
        obj.innerText = current;
        if (current == end) {
            clearInterval(timer);
        }
    }, stepTime);
}
