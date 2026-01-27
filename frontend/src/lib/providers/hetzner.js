// Hetzner Cloud DNS Provider
// Docs: https://docs.hetzner.cloud/reference/cloud#tag/zones

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';

async function request(apiKey, path, options = {}) {
  const response = await fetch(`${HETZNER_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hetzner API error ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) return null;
  return await response.json();
}

async function getZones(apiKey) {
  const data = await request(apiKey, '/zones');
  return data?.zones || [];
}

/**
 * Find zone for a given FQDN by matching longest suffix
 */
async function findZoneForDomain(apiKey, fqdn) {
  const zones = await getZones(apiKey);
  
  const parts = fqdn.split('.');
  for (let i = 0; i < parts.length; i++) {
    const potentialZone = parts.slice(i).join('.');
    const zone = zones.find(z => z.name === potentialZone);
    if (zone) return zone;
  }
  
  return null;
}

async function getRRset(apiKey, zoneId, name, type = 'A') {
  const data = await request(apiKey, `/zones/${zoneId}/rrsets?name=${encodeURIComponent(name)}&type=${type}`);
  return data?.rrsets?.[0] || null;
}

async function createRRset(apiKey, zoneId, name, type, value, ttl = 900) {
  const data = await request(apiKey, `/zones/${zoneId}/rrsets`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      type,
      ttl,
      records: [{ value, comment: 'DynDNS managed' }],
    }),
  });
  return data?.rrset;
}

async function updateRRset(apiKey, zoneId, name, type, value, ttl = 900) {
  await request(apiKey, `/zones/${zoneId}/rrsets/${encodeURIComponent(name)}/${type}/actions/set_records`, {
    method: 'POST',
    body: JSON.stringify({
      records: [{ value, comment: 'DynDNS managed' }],
    }),
  });
  
  return { name };
}

async function ensureRRsetForDomain(apiKey, fqdn, value, type = 'A') {
  const zone = await findZoneForDomain(apiKey, fqdn);
  if (!zone) {
    throw new Error(`No matching zone found for domain "${fqdn}"`);
  }

  const recordName = fqdn === zone.name ? '@' : fqdn.substring(0, fqdn.length - zone.name.length - 1);

  let rrset = await getRRset(apiKey, zone.id, recordName, type);

  if (!rrset) {
    rrset = await createRRset(apiKey, zone.id, recordName, type, value);
  } else {
    rrset = await updateRRset(apiKey, zone.id, recordName, type, value);
  }

  if (!rrset) {
    throw new Error('Failed to create or retrieve RRset from Hetzner API');
  }

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    recordName: rrset.name || recordName,
    rrsetName: rrset.name,
    recordId: null,
    value,
  };
}

async function updateDynDNSRRset(apiKey, zoneId, recordName, ip, type = 'A') {
  return await updateRRset(apiKey, zoneId, recordName, type, ip, 900);
}

// Provider interface
export default {
  name: 'hetzner',
  displayName: 'Hetzner Cloud DNS',
  apiKeyLabel: 'API Token',
  
  ensureRRsetForDomain,
  updateDynDNSRRset,
};
