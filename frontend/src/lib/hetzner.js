// Hetzner Cloud DNS API
// Docs: https://docs.hetzner.cloud/reference/cloud#tag/zones
// Docs: https://docs.hetzner.cloud/reference/cloud#tag/zone-rrsets

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

export async function getZones(apiKey) {
  const data = await request(apiKey, '/zones');
  return data?.zones || [];
}

export async function getZone(apiKey, zoneId) {
  const data = await request(apiKey, `/zones/${zoneId}`);
  return data?.zone || null;
}

/**
 * Find zone for a given FQDN by matching longest suffix
 * e.g., for dyndns.bla.com.de: checks dyndns.bla.com.de, bla.com.de, com.de in order
 */
export async function findZoneForDomain(apiKey, fqdn) {
  const zones = await getZones(apiKey);
  
  // Split FQDN and progressively check longer suffixes (longest match first)
  const parts = fqdn.split('.');
  for (let i = 0; i < parts.length; i++) {
    const potentialZone = parts.slice(i).join('.');
    const zone = zones.find(z => z.name === potentialZone);
    if (zone) return zone;
  }
  
  return null;
}

/**
 * Get RRset (resource record set) for a given name and type within a zone
 */
export async function getRRset(apiKey, zoneId, name, type = 'A') {
  const data = await request(apiKey, `/zones/${zoneId}/rrsets?name=${encodeURIComponent(name)}&type=${type}`);
  return data?.rrsets?.[0] || null;
}

/**
 * Create an RRset (resource record set) in a zone
 */
export async function createRRset(apiKey, zoneId, name, type, value, ttl = 900) {
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

/**
 * Update an RRset (resource record set) in a zone via actions/set_records
 */
export async function updateRRset(apiKey, zoneId, name, type, value, ttl = 900) {
  // Call the set_records action - just fire and forget, no need to refetch
  await request(apiKey, `/zones/${zoneId}/rrsets/${encodeURIComponent(name)}/${type}/actions/set_records`, {
    method: 'POST',
    body: JSON.stringify({
      records: [{ value, comment: 'DynDNS managed' }],
    }),
  });
  
  // Return a minimal RRset-like object with the name we already know
  return { name };
}

/**
 * Ensure an RRset exists for a domain with an initial IP value
 * Creates or updates the RRset to the provided value
 * Returns zone info and RRset details for storage
 */
export async function ensureRRsetForDomain(apiKey, fqdn, value, type = 'A') {
  const zone = await findZoneForDomain(apiKey, fqdn);
  if (!zone) {
    throw new Error(`No matching zone found for domain "${fqdn}"`);
  }

  // Extract record name (@ if fqdn matches zone name exactly)
  const recordName = fqdn === zone.name ? '@' : fqdn.substring(0, fqdn.length - zone.name.length - 1);

  // Check if RRset already exists
  let rrset = await getRRset(apiKey, zone.id, recordName, type);

  if (!rrset) {
    // Create new RRset with provided value
    rrset = await createRRset(apiKey, zone.id, recordName, type, value);
  } else {
    // RRset exists, update it with provided value
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
    value,
  };
}

/**
 * Update a DynDNS RRset with new IP
 */
export async function updateDynDNSRRset(apiKey, zoneId, recordName, ip, type = 'A') {
  return await updateRRset(apiKey, zoneId, recordName, type, ip, 900);
}
