import { createClient } from 'redis';
import crypto from 'crypto';

const SESSION_LIFETIME = 30 * 60; // 30 minutes in seconds

let redisClient;
const sessionStore = new Map(); // Fallback in-memory store

// Initialize Redis client
export async function initRedis() {
  if (redisClient) return redisClient;

  try {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err);
      redisClient = null; // Fall back to in-memory
    });

    await redisClient.connect();
    console.log('✓ Redis connected');
    return redisClient;
  } catch (error) {
    console.warn('Redis unavailable, using in-memory session store');
    redisClient = null;
    return null;
  }
}

// Create session for admin user
export async function createSession(adminId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionData = {
    adminId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  try {
    await initRedis();
    if (redisClient) {
      await redisClient.setEx(`session:${sessionId}`, SESSION_LIFETIME, JSON.stringify(sessionData));
    } else {
      sessionStore.set(sessionId, {
        ...sessionData,
        expiresAt: Date.now() + (SESSION_LIFETIME * 1000),
      });
    }
  } catch (error) {
    console.error('Session creation error:', error);
    // Fallback to in-memory
    sessionStore.set(sessionId, {
      ...sessionData,
      expiresAt: Date.now() + (SESSION_LIFETIME * 1000),
    });
  }

  return sessionId;
}

// Get session and refresh lifetime
export async function getSession(sessionId) {
  if (!sessionId) return null;

  try {
    if (redisClient) {
      const sessionData = await redisClient.get(`session:${sessionId}`);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        // Refresh session lifetime on activity
        session.lastActivity = Date.now();
        await redisClient.setEx(`session:${sessionId}`, SESSION_LIFETIME, JSON.stringify(session));
        return session;
      }
    } else {
      // In-memory store
      const session = sessionStore.get(sessionId);
      if (session && session.expiresAt > Date.now()) {
        // Refresh expiration
        session.lastActivity = Date.now();
        session.expiresAt = Date.now() + (SESSION_LIFETIME * 1000);
        return session;
      } else if (session) {
        // Expired
        sessionStore.delete(sessionId);
      }
    }
  } catch (error) {
    console.error('Session retrieval error:', error);
  }

  return null;
}

// Delete session (logout)
export async function deleteSession(sessionId) {
  if (!sessionId) return;

  try {
    if (redisClient) {
      await redisClient.del(`session:${sessionId}`);
    } else {
      sessionStore.delete(sessionId);
    }
  } catch (error) {
    console.error('Session deletion error:', error);
  }
}

// Helper to extract session ID from cookie header
export function getSessionIdFromCookie(cookieHeader) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith('sessionId='));
  
  if (sessionCookie) {
    return sessionCookie.split('=')[1];
  }

  return null;
}

// Helper to parse Basic Auth header
export function getBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    return { username, password };
  } catch (error) {
    return null;
  }
}
