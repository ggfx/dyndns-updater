import type { APIRoute } from 'astro';
import { getBasicAuth } from '../lib/session.js';
import { db } from '../lib/db.js';
import { updateDynDNSRRset } from '../lib/hetzner.js';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  const auth = getBasicAuth(authHeader);
  if (!auth) {
    return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="DynDNS"' } });
  }

  const { username, password } = auth;
  const user = db.prepare('SELECT * FROM dyndns_users WHERE username = ?').get(username);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const bcrypt = await import('bcryptjs');
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Extract IP from query param or auto-detect from headers
  const url = new URL(request.url);
  let clientIp = url.searchParams.get('myip') || '';

  if (!clientIp) {
    clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || request.headers.get('cf-connecting-ip')
      || request.headers.get('x-client-ip')
      || request.headers.get('fastly-client-ip')
      || request.headers.get('true-client-ip')
      || request.headers.get('x-cluster-client-ip')
      || request.headers.get('forwarded')
      || request.headers.get('via')
      || request.headers.get('remote-addr')
      || request.headers.get('remote_addr')
      || request.headers.get('client-ip')
      || request.headers.get('client_ip')
      || request.headers.get('x-forwarded')
      || request.headers.get('forwarded-for')
      || request.headers.get('forwarded-for-ip')
      || '';
  }

  if (!clientIp) {
    return new Response('No IP address provided or detected', { status: 400 });
  }

  // Extract hostname from query param (optional, update all if not specified)
  const hostname = url.searchParams.get('hostname');

  let domainsToUpdate = db.prepare('SELECT * FROM domains WHERE dyndns_user_id = ?').all(user.id);

  if (hostname) {
    domainsToUpdate = domainsToUpdate.filter(d => d.domain === hostname.toLowerCase());
    if (domainsToUpdate.length === 0) {
      return new Response(`Hostname "${hostname}" not found for this user`, { status: 404 });
    }
  }

  if (domainsToUpdate.length === 0) {
    return new Response('No domains configured', { status: 400 });
  }

  const messages: string[] = [];

  for (const domain of domainsToUpdate) {
    try {
      await updateDynDNSRRset(user.hetzner_api_key, String(domain.zone_id), domain.record_name, clientIp, 'A');
      db.prepare('INSERT INTO update_logs (dyndns_user_id, domain, ip, success, message) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, domain.domain, clientIp, 1, 'Updated');
      db.prepare('UPDATE domains SET last_ip = ?, last_updated = ? WHERE id = ?')
        .run(clientIp, new Date().toISOString(), domain.id);
      messages.push(`Updated ${domain.domain} to ${clientIp}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      db.prepare('INSERT INTO update_logs (dyndns_user_id, domain, ip, success, message) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, domain.domain, clientIp, 0, message);
      messages.push(`Failed ${domain.domain}: ${message}`);
    }
  }

  return new Response(messages.join('\n'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
};
