const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');

/* Небольшой загрузчик .env без внешних зависимостей */
(function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const s = line.trim();
        if (!s || s.startsWith('#')) continue;
        const i = s.indexOf('=');
        if (i === -1) continue;
        const key = s.slice(0, i).trim();
        let val = s.slice(i + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
    }
})();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vamp-shmot-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.JWT_SECRET) {
    console.warn('ВНИМАНИЕ: используется секрет по умолчанию. Задайте JWT_SECRET в .env для продакшена.');
}

const db = new DatabaseSync(path.join(__dirname, 'database.db'));

/* ============================================================
   ТАБЛИЦЫ
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
   МИГРАЦИИ (добавить brand_id, если таблица была старой)
   ============================================================ */
try {
    const cols = db.prepare("PRAGMA table_info(products)").all();
    if (!cols.find(c => c.name === 'brand_id')) {
        db.exec('ALTER TABLE products ADD COLUMN brand_id INTEGER');
        console.log('Миграция: добавлено поле brand_id в products');
    }
} catch (e) { console.error(e); }

/* ============================================================
   НАЧАЛЬНЫЕ ДАННЫЕ
   ============================================================ */
{
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin');
    if (!admin) {
        const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
        db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
          .run('Администратор', 'admin', hash, 'admin');
        console.log('Админ: admin / ' + ADMIN_PASSWORD);
    }
}

{
    const count = db.prepare('SELECT COUNT(*) as c FROM brands').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO brands (name, description, logo) VALUES (?, ?, ?)');
        insert.run('Vamp Shmot', 'Собственный бренд магазина', '');
        insert.run('Noir Atelier', 'Петербургский бренд кожаных изделий', '');
        insert.run('Moscow Dark', 'Московский бренд альтернативной одежды', '');
        console.log('Добавлены бренды по умолчанию');
    }
}

{
    const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO products (name, price, description, sizes, images, brand_id) VALUES (?, ?, ?, ?, ?, ?)');
        const defaults = [
            { name: "Кожаный плащ Ночная тень", price: 25000, description: "Длинный кожаный плащ.", sizes: ["S","M","L","XL"], images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1200"], brand: 1 },
            { name: "Чокер с шипами", price: 3500, description: "Кожаный чокер.", sizes: ["ONE SIZE"], images: ["https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=1200"], brand: 1 },
            { name: "Структурный корсет", price: 12000, description: "Корсет с вышивкой.", sizes: ["XS","S","M","L"], images: ["https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=1200"], brand: 2 },
            { name: "Длинные перчатки", price: 4500, description: "Кожаные перчатки.", sizes: ["S","M","L"], images: ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200"], brand: 2 },
            { name: "Юбка-макси", price: 8900, description: "Юбка в пол.", sizes: ["XS","S","M","L","XL"], images: ["https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=1200"], brand: 3 },
            { name: "Ботинки на платформе", price: 18000, description: "Высокие ботинки.", sizes: ["36","37","38","39","40","41"], images: ["https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=1200"], brand: 3 }
        ];
        for (const p of defaults) {
            insert.run(p.name, p.price, p.description, JSON.stringify(p.sizes), JSON.stringify(p.images), p.brand);
        }
        console.log('Добавлены товары по умолчанию');
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
        console.log('Добавлены слайды по умолчанию');
    }
}

{
    const c = db.prepare('SELECT id FROM contacts WHERE id = 1').get();
    if (!c) {
        db.prepare(`INSERT INTO contacts (id, phone, email, address, instagram, telegram, whatsapp, work_hours)
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?)`)
          .run('+7 (999) 123-45-67', 'info@vampshmot.ru', 'Москва, ул. Тверская, 1',
               '@vampshmot', '@vampshmot', '+79991234567', 'Пн–Вс: 10:00–22:00');
        console.log('Добавлены контакты по умолчанию');
    }
}

/* ============================================================
   ФАЙЛЫ
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
        file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Только изображения'));
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
    if (!header) return res.status(401).json({ error: 'Нет токена' });
    try {
        req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Неверный токен' });
    }
}
function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для админа' });
    next();
}

/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email уже занят' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
                     .run(name, email, hash, 'user');
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user, token });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Заполните все поля' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ error: 'Неверный email или пароль' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at }, token });
});

app.get('/api/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Не найден' });
    res.json(user);
});

app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
    res.json(db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC').all());
});

/* ============================================================
   БРЕНДЫ
   ============================================================ */
app.get('/api/brands', (req, res) => {
    res.json(db.prepare('SELECT * FROM brands ORDER BY name ASC').all());
});

app.get('/api/brands/:id', (req, res) => {
    const b = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
    if (!b) return res.status(404).json({ error: 'Бренд не найден' });
    res.json(b);
});

app.post('/api/brands', authMiddleware, adminMiddleware, (req, res) => {
    const { name, description, logo } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    const r = db.prepare('INSERT INTO brands (name, description, logo) VALUES (?, ?, ?)')
                .run(name, description || '', logo || '');
    res.json(db.prepare('SELECT * FROM brands WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/brands/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { name, description, logo } = req.body;
    const existing = db.prepare('SELECT id FROM brands WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Бренд не найден' });
    db.prepare('UPDATE brands SET name = ?, description = ?, logo = ? WHERE id = ?')
      .run(name, description || '', logo || '', req.params.id);
    res.json(db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id));
});

app.delete('/api/brands/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Не найден' });
    res.json({ ok: true });
});

/* ============================================================
   ТОВАРЫ
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
    if (!p) return res.status(404).json({ error: 'Не найден' });
    res.json(enrichProduct(p));
});

app.post('/api/products', authMiddleware, adminMiddleware, (req, res) => {
    const { name, price, description, sizes, images, brand_id } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Название и цена обязательны' });
    if (!images || !images.length) return res.status(400).json({ error: 'Добавьте фото' });
    const r = db.prepare('INSERT INTO products (name, price, description, sizes, images, brand_id) VALUES (?, ?, ?, ?, ?, ?)')
                .run(name, price, description || '', JSON.stringify(sizes || ['ONE SIZE']), JSON.stringify(images), brand_id || null);
    res.json(enrichProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(r.lastInsertRowid)));
});

app.put('/api/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { name, price, description, sizes, images, brand_id } = req.body;
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найден' });
    db.prepare('UPDATE products SET name = ?, price = ?, description = ?, sizes = ?, images = ?, brand_id = ? WHERE id = ?')
      .run(name, price, description || '', JSON.stringify(sizes || ['ONE SIZE']), JSON.stringify(images || []), brand_id || null, req.params.id);
    res.json(enrichProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
});

app.delete('/api/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Не найден' });
    res.json({ ok: true });
});

/* ============================================================
   ЗАГРУЗКА
   ============================================================ */
app.post('/api/upload', authMiddleware, adminMiddleware, upload.array('photos', 20), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Файлы не загружены' });
    res.json({ urls: req.files.map(f => '/uploads/' + f.filename) });
});

/* ============================================================
   СЛАЙДЫ
   ============================================================ */
app.get('/api/slides', (req, res) => {
    res.json(db.prepare('SELECT * FROM slides ORDER BY id DESC').all());
});

app.post('/api/slides', authMiddleware, adminMiddleware, (req, res) => {
    const { img } = req.body;
    if (!img) return res.status(400).json({ error: 'URL обязателен' });
    const r = db.prepare('INSERT INTO slides (img) VALUES (?)').run(img);
    res.json(db.prepare('SELECT * FROM slides WHERE id = ?').get(r.lastInsertRowid));
});

app.delete('/api/slides/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM slides WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Не найден' });
    res.json({ ok: true });
});

/* ============================================================
   ЗАКАЗЫ (корзина)
   ============================================================ */
app.post('/api/orders', authMiddleware, (req, res) => {
    const { customer_name, phone, address, comment, items, total } = req.body;
    if (!customer_name || !phone || !address) return res.status(400).json({ error: 'Заполните имя, телефон и адрес' });
    if (!items || !items.length) return res.status(400).json({ error: 'Корзина пуста' });
    const r = db.prepare(`INSERT INTO orders (user_id, customer_name, phone, address, comment, items, total, status)
                          VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`)
                .run(req.user.id, customer_name, phone, address, comment || '', JSON.stringify(items), total || 0);
    res.json({ id: r.lastInsertRowid, ok: true });
});

app.get('/api/orders/my', authMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    rows.forEach(o => { try { o.items = JSON.parse(o.items || '[]'); } catch { o.items = []; } });
    res.json(rows);
});

app.get('/api/orders', authMiddleware, adminMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    rows.forEach(o => { try { o.items = JSON.parse(o.items || '[]'); } catch { o.items = []; } });
    res.json(rows);
});

app.put('/api/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Статус обязателен' });
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
});

/* ============================================================
   КОНТАКТЫ
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
   ОБРАБОТКА ОШИБОК (multer и прочие)
   ============================================================ */
app.use((err, req, res, next) => {
    if (err) {
        console.error(err);
        return res.status(400).json({ error: err.message || 'Ошибка сервера' });
    }
    next();
});

/* ============================================================
   SPA
   ============================================================ */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log('\nСервер запущен: http://localhost:' + PORT + '\n');
});
