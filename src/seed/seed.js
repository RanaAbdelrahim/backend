// seeds/seed.v1.demoData.js
// Idempotent Mongo seed (v1) with verbose debugging

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import User from '../models/User.js';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import Notification from '../models/Notification.js';

// ---------- Debug helpers ----------
const DEBUG = process.env.SEED_DEBUG === '1' || process.env.SEED_DEBUG === 'true';
if (DEBUG) mongoose.set('debug', true);

function t() { return new Date().toISOString(); }
function hr() { return '—'.repeat(70); }
function timer(label) {
  const start = process.hrtime.bigint();
  return {
    end(msg = '') {
      const ns = Number(process.hrtime.bigint() - start);
      const ms = (ns / 1e6).toFixed(1);
      console.log(`[${t()}][${label}] ${msg} (${ms} ms)`);
    }
  };
}
function printErr(prefix, e) {
  console.error(`[ERR] ${prefix}:`, e?.message ?? e);
  if (e?.errors) {
    for (const [path, verr] of Object.entries(e.errors)) {
      console.error(` - Field "${path}": ${verr.message}`);
    }
  }
  if (e?.code === 11000) {
    console.error(' - Duplicate key error. Key pattern:', e.keyPattern, 'Key value:', e.keyValue);
  }
  if (DEBUG) console.error(e);
}

// ---------- Seed meta (tracks runs) ----------
const SeedMeta = mongoose.model(
  'SeedMeta',
  new mongoose.Schema({
    key: { type: String, unique: true },
    value: mongoose.Schema.Types.Mixed
  }, { collection: '_seed_meta' })
);

// ---------- Utilities ----------
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function seatId(r, c) { return `R${r}C${c}`; }

async function listCollections() {
  const cols = await mongoose.connection.db.listCollections().toArray();
  console.log(`[${t()}] Collections:`, cols.map(c => c.name).join(', ') || '(none)');
}

async function countAll() {
  const [u, e, b, n] = await Promise.all([
    User.estimatedDocumentCount(),
    Event.estimatedDocumentCount(),
    Booking.estimatedDocumentCount(),
    Notification.estimatedDocumentCount()
  ]);
  console.log(`[${t()}] Counts -> users:${u} events:${e} bookings:${b} notes:${n}`);
  return { u, e, b, n };
}

// ---------- Main run ----------
export async function run({ ensureConnected = true } = {}) {
  const SEED_KEY = 'seed:v1:demoData';
  const FORCE = process.argv.includes('--force');

  console.log(hr());
  console.log(`[${t()}] Starting seed "${SEED_KEY}" (DEBUG=${DEBUG ? 'on' : 'off'}, FORCE=${FORCE})`);
  console.log(hr());

  // 1) Connection checks
  try {
    if (!process.env.MONGO_URI) {
      console.warn('[WARN] MONGO_URI is not set. connectDB() may read a default inside ../lib/db.js');
    } else {
      console.log(`[${t()}] MONGO_URI -> ${process.env.MONGO_URI}`);
    }
    if (ensureConnected && mongoose.connection.readyState === 0) {
      const tm = timer('connectDB');
      await connectDB(process.env.MONGO_URI);
      tm.end('connected');
    } else {
      console.log(`[${t()}] Existing mongoose readyState=${mongoose.connection.readyState}`);
    }
    console.log(`[${t()}] Connected host: ${mongoose.connection.host} | name: ${mongoose.connection.name}`);
  } catch (e) {
    printErr('DB connection failed', e);
    throw e;
  }

  // 2) Wait for indexes (helps surface unique/validation problems early)
  try {
    const tm = timer('ensureIndexes');
    await Promise.all([
      User.init(),
      Event.init(),
      Booking.init(),
      Notification.init(),
    ]);
    tm.end('models initialized');
  } catch (e) {
    printErr('Model init/index build', e);
    throw e;
  }

  // 3) Skip if already applied (unless --force)
  try {
    const meta = await SeedMeta.findOne({ key: SEED_KEY });
    if (meta && !FORCE) {
      console.log(`[${t()}] Seed already applied at ${meta?.value?.appliedAt}. Use --force to re-run.`);
      await countAll();
      return;
    }
  } catch (e) {
    printErr('Checking seed meta', e);
    // continue; not fatal
  }

  await listCollections();
  await countAll();

  // 4) Clear collections
  try {
    const tm = timer('clearCollections');
    console.log(`[${t()}] Clearing collections (User, Event, Booking, Notification)...`);
    await Promise.all([
      User.deleteMany({}),
      Event.deleteMany({}),
      Booking.deleteMany({}),
      Notification.deleteMany({})
    ]);
    tm.end('cleared');
    await countAll();
  } catch (e) {
    printErr('Clearing collections', e);
    throw e;
  }

  // 5) Seed users
  let admin;
  const users = [];
  try {
    const tm = timer('seedUsers');
    console.log(`[${t()}] Seeding users...`);

    admin = await User.create({
      name: 'Admin',
      email: 'admin@eventx.dev',
      password: 'Admin123!',
      role: 'admin',
      location: 'Colombo'
    });

    const interestsPool = ['Live Music', 'Innovation', 'EDM Music', 'Food Festivals', 'Tech', 'Art'];
    const locations = ['Colombo', 'Kandy', 'Galle', 'Jaffna', 'Matara', 'International'];

    for (let i = 1; i <= 80; i++) {
      const doc = {
        name: `User ${i}`,
        email: `user${i}@mail.com`,
        password: 'User1234!',
        role: 'user',
        age: 18 + (i % 35),
        gender: ['Male', 'Female', 'Other'][i % 3],
        location: rand(locations),
        interests: Array.from(new Set([rand(interestsPool), rand(interestsPool)]))
      };
      try {
        const u = await User.create(doc);
        users.push(u);
        if (DEBUG && i % 10 === 0) console.log(`[debug] created user ${i}: ${u.email}`);
      } catch (e) {
        printErr(`Creating user${i}`, e);
        throw e;
      }
    }
    tm.end(`users=${users.length}, admin=${admin?.email ?? 'N/A'}`);
    await countAll();
  } catch (e) {
    printErr('Seeding users', e);
    throw e;
  }

  // 6) Seed events
  const events = [];
  try {
    const tm = timer('seedEvents');
    console.log(`[${t()}] Seeding events...`);
    const base = new Date();
    const eventDefs = [
      { title: 'Colombo Music Festival 2025', venue: 'Viharamahadevi Open Air Theater, Colombo', price: 5000, popularity: 'High', tags: ['Music', 'Festival'] },
      { title: 'Galle Literary Fair', venue: 'Open Air Theater, Galle', price: 2000, popularity: 'Medium', tags: ['Books', 'Literature'] },
      { title: 'Rock & Roll Night', venue: 'Open Air Theater, Colombo', price: 3000, popularity: 'High', tags: ['Music', 'Rock'] },
      { title: 'Kandy Art Exhibition', venue: 'Kandy City Center', price: 1500, popularity: 'Low', tags: ['Art', 'Exhibition'] },
      { title: 'Sri Lanka Food Fest', venue: 'Galle Face Green', price: 2000, popularity: 'High', tags: ['Food'] },
      { title: 'Tech Lanka Expo 2025', venue: 'BMICH, Colombo', price: 1000, popularity: 'Very High', tags: ['Tech', 'Expo'] },
      { title: "New Year's Eve Fireworks", venue: 'Galle Face Green', price: 1500, popularity: 'High', tags: ['Fireworks'] },
      { title: 'Nightor Festival', venue: 'Negombo Beach', price: 2500, popularity: 'Medium', tags: ['Music'] },
      { title: 'Hyper Festival', venue: 'Colombo Port City', price: 3500, popularity: 'Very High', tags: ['EDM Music'] },
      { title: 'EDM Festival', venue: 'Sugathadasa Stadium', price: 4000, popularity: 'Very High', tags: ['EDM Music'] },
      { title: 'Matara Car Show', venue: 'Matara Grounds', price: 2500, popularity: 'Medium', tags: ['Cars'] },
      { title: 'Cricket Festival', venue: 'R. Premadasa Stadium', price: 3000, popularity: 'High', tags: ['Sports'] }
    ];

    for (let i = 0; i < eventDefs.length; i++) {
      const status = i % 3 === 0 ? 'upcoming' : i % 3 === 1 ? 'active' : 'closed';
      const rows = 10 + (i % 4);
      const cols = 12;
      const description = `Auto-seeded description for ${eventDefs[i].title}. A great experience with live performances and immersive effects.`;

      const ev = await Event.create({
        ...eventDefs[i],
        description,
        date: new Date(base.getTime() + (i + 1) * 86400000),
        time: '06.00PM - 10.30PM',
        status,
        seatMap: { rows, cols, reserved: [], sold: [] }
      });
      if (DEBUG) console.log(`[debug] created event ${i + 1}: ${ev.title}`);
      events.push(ev);
    }
    tm.end(`events=${events.length}`);
    await countAll();
  } catch (e) {
    printErr('Seeding events', e);
    throw e;
  }

  // 7) Pre-fill seats
  try {
    const tm = timer('prefillSeats');
    console.log(`[${t()}] Pre-filling reserved/sold seats...`);
    for (const ev of events) {
      const total = ev.seatMap.rows * ev.seatMap.cols;
      const targetSold = Math.floor(total * 0.25);
      const targetReserved = Math.floor(total * 0.10);
      const used = new Set();

      while (ev.seatMap.sold.length < targetSold) {
        const r = 1 + Math.floor(Math.random() * ev.seatMap.rows);
        const c = 1 + Math.floor(Math.random() * ev.seatMap.cols);
        const sid = seatId(r, c);
        if (!used.has(sid)) { used.add(sid); ev.seatMap.sold.push(sid); }
      }
      while (ev.seatMap.reserved.length < targetReserved) {
        const r = 1 + Math.floor(Math.random() * ev.seatMap.rows);
        const c = 1 + Math.floor(Math.random() * ev.seatMap.cols);
        const sid = seatId(r, c);
        if (!used.has(sid)) { used.add(sid); ev.seatMap.reserved.push(sid); }
      }
      await ev.save();
    }
    tm.end('seat maps updated');
    await countAll();
  } catch (e) {
    printErr('Pre-filling seats', e);
    throw e;
  }

  // 8) Bookings & notifications
  try {
    const tm = timer('seedBookingsNotifications');
    console.log(`[${t()}] Creating bookings & notifications...`);
    let created = 0;
    for (let i = 0; i < 120; i++) {
      const user = rand(users);
      const event = rand(events);
      // find an available seat
      let attempts = 0;
      let seat = null;
      while (attempts < 100 && !seat) {
        attempts++;
        const r = 1 + Math.floor(Math.random() * event.seatMap.rows);
        const c = 1 + Math.floor(Math.random() * event.seatMap.cols);
        const sid = seatId(r, c);
        if (!event.seatMap.sold.includes(sid) && !event.seatMap.reserved.includes(sid)) seat = sid;
      }
      if (!seat) continue;

      try {
        await Booking.create({
          user: user._id,
          event: event._id,
          seats: [seat],
          pricePaid: event.price,
          status: 'paid'
        });
        event.seatMap.sold.push(seat);
        await event.save();
        await Notification.create({
          user: user._id,
          message: `Your ticket for ${event.title} is confirmed`,
          link: `/events/${event._id}`
        });
        created++;
        if (DEBUG && created % 20 === 0) console.log(`[debug] created bookings so far: ${created}`);
      } catch (e) {
        printErr('Creating booking/notification', e);
        throw e;
      }
    }

    // Admin notifications
    const adminNotes = [
      'Paycheck released for artists @Wayo Event',
      'Total revenue has been transferred to bank',
      '@Alan Walker Event in 3 days',
      'Paycheck released for artists @Cyndarex Event'
    ];
    for (const msg of adminNotes) {
      await Notification.create({ user: admin._id, message: msg, link: '/admin' });
    }

    tm.end(`bookings created=${created}, admin notes=${adminNotes.length}`);
    await countAll();
  } catch (e) {
    printErr('Seeding bookings & notifications', e);
    throw e;
  }

  // 9) Mark applied
  try {
    const tm = timer('markApplied');
    await SeedMeta.updateOne(
      { key: SEED_KEY },
      { $set: { value: { appliedAt: new Date(), host: mongoose.connection.host, db: mongoose.connection.name } } },
      { upsert: true }
    );
    tm.end('seed meta upserted');
    console.log(`[${t()}] ✅ Seed completed and recorded: ${SEED_KEY}`);
  } catch (e) {
    printErr('Marking seed as applied', e);
    throw e;
  }
}

// Export the seedAll function to match the import in server.js
export const seedAll = run;

// --- CLI: node seeds/seed.v1.demoData.js [--force] ---
if (import.meta.url === `file://${process.argv[1]}`) {
  run({ ensureConnected: true })
    .then(() => mongoose.connection.close?.())
    .then(() => process.exit(0))
    .catch((e) => { printErr('Seed run failed (CLI)', e); process.exit(1); });
}
