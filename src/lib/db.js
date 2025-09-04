// db.js
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer = null;
let isConnected = false;
let usingMemory = false;

/** Mask credentials & show host/db only in logs */
function safeUri(uri) {
  try {
    const u = new URL(uri);
    const host = u.host;
    const db = u.pathname.replace('/', '') || '';
    return `${host}${db ? '/' + db : ''}`;
  } catch {
    return '[invalid URI]';
  }
}

/** Connect helper with sensible timeouts */
async function tryConnect(uri) {
  if (!uri) throw new Error('No MongoDB URI provided.');
  if (process.env.MONGO_DEBUG === '1') mongoose.set('debug', true);

  // Mongoose v7+ usually needs no options, but these help with flaky local setups
  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 10,
  });

  isConnected = mongoose.connection.readyState === 1;
  return conn;
}

/**
 * Connect to MongoDB.
 * - Prefers explicit URI (env or argument)
 * - Falls back to ephemeral in-memory MongoDB
 */
export async function connectDB(
  inputUri = process.env.MONGO_URI || process.env.MONGODB_URI
) {
  // Already connected? Reuse it.
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return mongoose.connection;
  }

  // 1) Try the provided/ENV URI
  if (inputUri) {
    try {
      const conn = await tryConnect(inputUri);
      console.log(`Connected to MongoDB @ ${safeUri(inputUri)}`);
      usingMemory = false;
      return conn;
    } catch (err) {
      console.warn(
        'MongoDB connection failed. Reason:',
        err?.message || err
      );
      console.log(
        'Falling back to in-memory MongoDB (data is ephemeral for this process).'
      );
    }
  } else {
    console.log('No MongoDB URI provided; starting in-memory MongoDB.');
  }

  // 2) Start in-memory server as fallback
  memoryServer = await MongoMemoryServer.create(); // Option: { instance: { port: 27018 } }
  const memUri = memoryServer.getUri();
  const conn = await tryConnect(memUri);
  usingMemory = true;
  console.log('Connected to in-memory MongoDB.');
  return conn;
}

/** Graceful disconnect; also stops the memory server if used */
export async function disconnectDB() {
  try {
    await mongoose.disconnect();
  } catch (e) {
    console.error('MongoDB disconnection error:', e);
  } finally {
    isConnected = false;
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
      usingMemory = false;
    }
    console.log('Disconnected from MongoDB.');
  }
}

/** Quick status snapshot for debugging */
export function dbStatus() {
  return {
    connected: isConnected,
    usingMemory,
    host: usingMemory ? 'memory' : mongoose?.connection?.host || null,
    db: mongoose?.connection?.name || null,
    state: mongoose.connection.readyState, // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  };
}
