import { db } from './db.js';
import { getSession, getSessionIdFromCookie, createSession, deleteSession } from './session.js';
import bcrypt from 'bcryptjs';

/**
 * Check if admin user exists (for initial setup detection)
 */
export function hasAdmin() {
  const admin = db.prepare('SELECT id FROM admins LIMIT 1').get();
  return !!admin;
}

/**
 * Create admin user (only during initial setup)
 */
export async function createAdmin(username, password) {
  if (hasAdmin()) {
    throw new Error('Admin already exists');
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  
  // Create session for new admin
  const sessionId = await createSession(result.lastInsertRowid);
  return { adminId: result.lastInsertRowid, sessionId };
}

/**
 * Login admin user
 */
export async function loginAdmin(username, password) {
  const admin = db.prepare('SELECT id, username, password_hash FROM admins WHERE username = ?').get(username);
  
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return null;
  }

  const sessionId = await createSession(admin.id);
  return { admin, sessionId };
}

/**
 * Get current admin from request
 */
export async function getCurrentAdmin(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getSessionIdFromCookie(cookieHeader);
  
  if (!sessionId) {
    return null;
  }

  const session = await getSession(sessionId);
  if (!session || !session.adminId) {
    return null;
  }

  const admin = db.prepare('SELECT id, username, password_hash, created_at FROM admins WHERE id = ?').get(session.adminId);
  return admin;
}

/**
 * Logout admin
 */
export async function logoutAdmin(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getSessionIdFromCookie(cookieHeader);
  
  if (sessionId) {
    await deleteSession(sessionId);
  }
}

/**
 * Require admin authentication (for page protection)
 */
export async function requireAdmin(request) {
  const admin = await getCurrentAdmin(request);
  if (!admin) {
    throw new Error('Authentication required');
  }
  return admin;
}

/**
 * Set session cookie
 */
export function setSessionCookie(sessionId) {
  return `sessionId=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 60}`;
}

/**
 * Clear session cookie
 */
export function clearSessionCookie() {
  return 'sessionId=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}
