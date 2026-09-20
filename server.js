const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'vamp-shmot-secret-change-me';

const db = new DatabaseSync(path.join(__dirname, 'database.db'));

/* ============================================================
   РўРђР‘Р›РР¦Р«
   ============================================================ */
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        logo TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        description TEXT,
        sizes TEXT DEFAULT '[]',
        images TEXT DEFAULT '[]',
        brand_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS slides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        img TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        customer_name TEXT,
        phone TEXT,
        address TEXT,
        comment TEXT,
        items TEXT,
        total INTEGER,
        status TEXT DEFAULT 'new',
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        phone TEXT,
        email TEXT,
        address TEXT,
        instagram TEXT,
        telegram TEXT,
        whatsapp TEXT,
        work_hours TEXT
    );
`);

/* ============================================================
   РњРР“Р РђР¦РР (РґРѕР±Р°РІРёС‚СЊ brand_id, РµСЃР»Рё С‚Р°Р±Р»РёС†Р° Р±С‹Р»Р° СЃС‚Р°СЂРѕР№)
   ============================================================ */
try {
    const cols = db.prepare("PRAGMA table_info(products)").all();
    if (!cols.find(c => c.name === 'brand_id')) {
        db.exec('ALTER TABLE products ADD COLUMN brand_id INTEGER');
        console.log('РњРёРіСЂР°С†РёСЏ: РґРѕР±Р°РІР»РµРЅРѕ РїРѕР»Рµ brand_id РІ products');
    }
} catch (e) { console.error(e); }

/* ============================================================
   РќРђР§РђР›Р¬РќР«Р• Р”РђРќРќР«Р•
   ============================================================ */
{
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin');
    if (!admin) {
        const hash = bcrypt.hashSync('admin123', 10);
        db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
          .run('Администратор', 'admin', hash, 'admin');
        console.log('РђРґРјРёРЅ: admin / admin123');
    }
}

{
    const count = db.prepare('SELECT COUNT(*) as c FROM brands').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO brands (name, description, logo) VALUES (?, ?, ?)');
        insert.run('Vamp Shmot', 'РЎРѕР±СЃС‚РІРµРЅРЅС‹Р№ Р±СЂРµРЅРґ РјР°РіР°Р·РёРЅР°', '');
        insert.run('Noir Atelier', 'РџРµС‚РµСЂР±СѓСЂРіСЃРєРёР№ Р±СЂРµРЅРґ РєРѕР¶Р°РЅС‹С… РёР·РґРµР»РёР№', '');
        insert.run('Moscow Dark', 'РњРѕСЃРєРѕРІСЃРєРёР№ Р±СЂРµРЅРґ Р°Р»СЊС‚РµСЂРЅР°С‚РёРІРЅРѕР№ РѕРґРµР¶РґС‹', '');
        console.log('Р”РѕР±Р°РІР»РµРЅС‹ Р±СЂРµРЅРґС‹ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ');
    }
}

{
    const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO products (name, price, description, sizes, images, brand_id) VALUES (?, ?, ?, ?, ?, ?)');
        const defaults = [
            { name: "РљРѕР¶Р°РЅС‹Р№ РїР»Р°С‰ РќРѕС‡РЅР°СЏ С‚РµРЅСЊ", price: 25000, description: "Р”Р»РёРЅРЅС‹Р№ РєРѕР¶Р°РЅС‹Р№ РїР»Р°С‰.", sizes: ["S","M","L","XL"], images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1200"], brand: 1 },
            { name: "Р§РѕРєРµСЂ СЃ С€РёРїР°РјРё", price: 3500, description: "РљРѕР¶Р°РЅС‹Р№ С‡РѕРєРµСЂ.", sizes: ["ONE SIZE"], images: ["https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=1200"], brand: 1 },
            { name: "РЎС‚СЂСѓРєС‚СѓСЂРЅС‹Р№ РєРѕСЂСЃРµС‚", price: 12000, description: "РљРѕСЂСЃРµС‚ СЃ РІС‹С€РёРІРєРѕР№.", sizes: ["XS","S","M","L"], images: ["https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=1200"], brand: 2 },
            { name: "Р”Р»РёРЅРЅС‹Рµ РїРµСЂС‡Р°С‚РєРё", price: 4500, description: "РљРѕР¶Р°РЅС‹Рµ РїРµСЂС‡Р°С‚РєРё.", sizes: ["S","M","L"], images: ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200"], brand: 2 },
            { name: "Р®Р±РєР°-РјР°РєСЃРё", price: 8900, description: "Р®Р±РєР° РІ РїРѕР».", sizes: ["XS","S","M","L","XL"], images: ["https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=1200"], brand: 3 },
            { name: "Р‘РѕС‚РёРЅРєРё РЅР° РїР»Р°С‚С„РѕСЂРјРµ", price: 18000, description: "Р’С‹СЃРѕРєРёРµ Р±РѕС‚РёРЅРєРё.", sizes: ["36","37","38","39","40","41"], images: ["https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=1200"], brand: 3 }
        ];
        for (const p of defaults) {
            insert.run(p.name, p.price, p.description, JSON.stringify(p.sizes), JSON.stringify(p.images), p.brand);
        }
        console.log('Р”РѕР±Р°РІР»РµРЅС‹ С‚РѕРІР°СЂС‹ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ');
    }
}

{
    const count = db.prepare('SELECT COUNT(*) as c FROM slides').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO slides (img) VALUES (?)');
        [
            "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600",
            "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600",
            "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600"
        ].forEach(img => insert.run(img));
        console.log('Р”РѕР±Р°РІР»РµРЅС‹ СЃР»Р°Р№РґС‹ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ');
    }
}

{
    const c = db.prepare('SELECT id FROM contacts WHERE id = 1').get();
    if (!c) {
        db.prepare(`INSERT INTO contacts (id, phone, email, address, instagram, telegram, whatsapp, work_hours)
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?)`)
          .run('+7 (999) 123-45-67', 'info@vampshmot.ru', 'РњРѕСЃРєРІР°, СѓР». РўРІРµСЂСЃРєР°СЏ, 1',
               '@vampshmot', '@vampshmot', '+79991234567', 'РџРЅвЂ“Р’СЃ: 10:00вЂ“22:00');
        console.log('Р”РѕР±Р°РІР»РµРЅС‹ РєРѕРЅС‚Р°РєС‚С‹ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ');
    }
}

/* ============================================================
   Р¤РђР™Р›Р«
   ============================================================ */
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, 'img_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('РўРѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ'));
    }
});

/* ============================================================
   MIDDLEWARE
   ============================================================ */
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'РќРµС‚ С‚РѕРєРµРЅР°' });
    try {
        req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'РќРµРІРµСЂРЅС‹Р№ С‚РѕРєРµРЅ' });
    }
}
function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РґР»СЏ Р°РґРјРёРЅР°' });
    next();
}

/* ============================================================
   РђР’РўРћР РР—РђР¦РРЇ
   ============================================================ */
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Р—Р°РїРѕР»РЅРёС‚Рµ РІСЃРµ РїРѕР»СЏ' });
    if (password.length < 6) return res.status(400).json({ error: 'РџР°СЂРѕР»СЊ РјРёРЅРёРјСѓРј 6 СЃРёРјРІРѕР»РѕРІ' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email СѓР¶Рµ Р·Р°РЅСЏС‚' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
                     .run(name, email, hash, 'user');
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user, token });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Р—Р°РїРѕР»РЅРёС‚Рµ РІСЃРµ РїРѕР»СЏ' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ email РёР»Рё РїР°СЂРѕР»СЊ' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at }, token });
});

app.get('/api/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'РќРµ РЅР°Р№РґРµРЅ' });
    res.json(user);
});

app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
    res.json(db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC').all());
});

/* ============================================================
   Р‘Р Р•РќР”Р«
   ============================================================ */
app.get('/api/brands', (req, res) => {
    res.json(db.prepare('SELECT * FROM brands ORDER BY name ASC').all());
});

app.get('/api/brands/:id', (req, res) => {
    const b = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
    if (!b) return res.status(404).json({ error: 'Р‘СЂРµРЅРґ РЅРµ РЅР°Р№РґРµРЅ' });
    res.json(b);
});

app.post('/api/brands', authMiddleware, adminMiddleware, (req, res) => {
    const { name, description, logo } = req.body;
    if (!name) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' });
    const r = db.prepare('INSERT INTO brands (name, description, logo) VALUES (?, ?, ?)')
                .run(name, description || '', logo || '');
    res.json(db.prepare('SELECT * FROM brands WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/brands/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { name, description, logo } = req.body;
    const existing = db.prepare('SELECT id FROM brands WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Р‘СЂРµРЅРґ РЅРµ РЅР°Р№РґРµРЅ' });
    db.prepare('UPDATE brands SET name = ?, description = ?, logo = ? WHERE id = ?')
      .run(name, description || '', logo || '', req.params.id);
    res.json(db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id));
});

app.delete('/api/brands/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'РќРµ РЅР°Р№РґРµРЅ' });
    res.json({ ok: true });
});

/* ============================================================
   РўРћР’РђР Р«
   ============================================================ */
function enrichProduct(p) {
    try {
        p.images = JSON.parse(p.images || '[]');
        p.sizes = JSON.parse(p.sizes || '[]');
    } catch { p.images = []; p.sizes = []; }
    p.img = p.images[0] || '';
    if (p.brand_id) {
        const b = db.prepare('SELECT id, name FROM brands WHERE id = ?').get(p.brand_id);
        p.brand = b || null;
    } else {
        p.brand = null;
    }
    return p;
}

app.get('/api/products', (req, res) => {
    const brandId = req.query.brand;
    let rows;
    if (brandId) {
        rows = db.prepare('SELECT * FROM products WHERE brand_id = ? ORDER BY id DESC').all(brandId);
    } else {
        rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    }
    res.json(rows.map(enrichProduct));
});

app.get('/api/products/:id', (req, res) => {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'РќРµ РЅР°Р№РґРµРЅ' });
    res.json(enrichProduct(p));
});

app.post('/api/products', authMiddleware, adminMiddleware, (req, res) => {
    const { name, price, description, sizes, images, brand_id } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ Рё С†РµРЅР° РѕР±СЏР·Р°С‚РµР»СЊРЅС‹' });
    if (!images || !images.length) return res.status(400).json({ error: 'Р”РѕР±Р°РІСЊС‚Рµ С„РѕС‚Рѕ' });
    const r = db.prepare('INSERT INTO products (name, price, description, sizes, images, brand_id) VALUES (?, ?, ?, ?, ?, ?)')
                .run(name, price, description || '', JSON.stringify(sizes || ['ONE SIZE']), JSON.stringify(images), brand_id || null);
    res.json(enrichProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(r.lastInsertRowid)));
});

app.put('/api/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { name, price, description, sizes, images, brand_id } = req.body;
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'РќРµ РЅР°Р№РґРµРЅ' });
    db.prepare('UPDATE products SET name = ?, price = ?, description = ?, sizes = ?, images = ?, brand_id = ? WHERE id = ?')
      .run(name, price, description || '', JSON.stringify(sizes || ['ONE SIZE']), JSON.stringify(images || []), brand_id || null, req.params.id);
    res.json(enrichProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
});

app.delete('/api/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'РќРµ РЅР°Р№РґРµРЅ' });
    res.json({ ok: true });
});

/* ============================================================
   Р—РђР“Р РЈР—РљРђ
   ============================================================ */
app.post('/api/upload', authMiddleware, adminMiddleware, upload.array('photos', 20), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Р¤Р°Р№Р»С‹ РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹' });
    res.json({ urls: req.files.map(f => '/uploads/' + f.filename) });
});

/* ============================================================
   РЎР›РђР™Р”Р«
   ============================================================ */
app.get('/api/slides', (req, res) => {
    res.json(db.prepare('SELECT * FROM slides ORDER BY id DESC').all());
});

app.post('/api/slides', authMiddleware, adminMiddleware, (req, res) => {
    const { img } = req.body;
    if (!img) return res.status(400).json({ error: 'URL РѕР±СЏР·Р°С‚РµР»РµРЅ' });
    const r = db.prepare('INSERT INTO slides (img) VALUES (?)').run(img);
    res.json(db.prepare('SELECT * FROM slides WHERE id = ?').get(r.lastInsertRowid));
});

app.delete('/api/slides/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM slides WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'РќРµ РЅР°Р№РґРµРЅ' });
    res.json({ ok: true });
});

/* ============================================================
   Р—РђРљРђР—Р« (РєРѕСЂР·РёРЅР°)
   ============================================================ */
app.post('/api/orders', authMiddleware, (req, res) => {
    const { customer_name, phone, address, comment, items, total } = req.body;
    if (!customer_name || !phone || !address) return res.status(400).json({ error: 'Р—Р°РїРѕР»РЅРёС‚Рµ РёРјСЏ, С‚РµР»РµС„РѕРЅ Рё Р°РґСЂРµСЃ' });
    if (!items || !items.length) return res.status(400).json({ error: 'РљРѕСЂР·РёРЅР° РїСѓСЃС‚Р°' });
    const r = db.prepare(`INSERT INTO orders (user_id, customer_name, phone, address, comment, items, total, status)
                          VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`)
                .run(req.user.id, customer_name, phone, address, comment || '', JSON.stringify(items), total || 0);
    res.json({ id: r.lastInsertRowid, ok: true });
});

app.get('/api/orders', authMiddleware, adminMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    rows.forEach(o => { try { o.items = JSON.parse(o.items || '[]'); } catch { o.items = []; } });
    res.json(rows);
});

app.put('/api/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'РЎС‚Р°С‚СѓСЃ РѕР±СЏР·Р°С‚РµР»РµРЅ' });
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
});

/* ============================================================
   РљРћРќРўРђРљРўР«
   ============================================================ */
app.get('/api/contacts', (req, res) => {
    const c = db.prepare('SELECT * FROM contacts WHERE id = 1').get();
    res.json(c || {});
});

app.put('/api/contacts', authMiddleware, adminMiddleware, (req, res) => {
    const { phone, email, address, instagram, telegram, whatsapp, work_hours } = req.body;
    db.prepare(`UPDATE contacts SET phone = ?, email = ?, address = ?, instagram = ?, telegram = ?, whatsapp = ?, work_hours = ?
                WHERE id = 1`)
      .run(phone || '', email || '', address || '', instagram || '', telegram || '', whatsapp || '', work_hours || '');
    res.json(db.prepare('SELECT * FROM contacts WHERE id = 1').get());
});

/* ============================================================
   SPA
   ============================================================ */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log('\nРЎРµСЂРІРµСЂ Р·Р°РїСѓС‰РµРЅ: http://localhost:' + PORT + '\n');
});
