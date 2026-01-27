// DigitalOcean DNS Provider
// Docs: https://docs.digitalocean.com/reference/api/digitalocean/#tag/Domain-Records

const DIGITALOCEAN_API_BASE = 'https://api.digitalocean.com/v2';

async function request(apiKey, path, options = {}) {
  const response = await fetch(`${DIGITALOCEAN_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DigitalOcean API error ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) return null;
  return await response.json();
}

async function getDomains(apiKey) {
  const data = await request(apiKey, '/domains');
  return data?.domains || [];
}

/**
 * Find domain for a given FQDN by matching longest suffix
 */
async function findDomainForFqdn(apiKey, fqdn) {
  const domains = await getDomains(apiKey);
  
  const parts = fqdn.split('.');
  for (let i = 0; i < parts.length; i++) {
    const potentialDomain = parts.slice(i).join('.');
    const domain = domains.find(d => d.name === potentialDomain);
    if (domain) return domain;
  }
  
  return null;
}

async function getRecords(apiKey, domainName) {
  const data = await request(apiKey, `/domains/${domainName}/records?type=A`);
  return data?.domain_records || [];
}

async function findRecord(apiKey, domainName, name, type = 'A') {
  const records = await getRecords(apiKey, domainName);
  return records.find(r => r.name === name && r.type === type);
}

async function createRecord(apiKey, domainName, name, type, value, ttl = 900) {
  const data = await request(apiKey, `/domains/${domainName}/records`, {
    method: 'POST',
    body: JSON.stringify({
      type,
      name,
      data: value,
      ttl,
    }),
  });
  
  return data?.domain_record;
}

async function updateRecord(apiKey, domainName, recordId, value, ttl = 900) {
  const data = await request(apiKey, `/domains/${domainName}/records/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify({
      data: value,
      ttl,
    }),
  });
  
  return data?.domain_record;
}

async function ensureRRsetForDomain(apiKey, fqdn, value, type = 'A') {
  const domain = await findDomainForFqdn(apiKey, fqdn);
  if (!domain) {
    throw new Error(`No matching domain found for FQDN "${fqdn}"`);
  }

  // Extract record name (empty string if fqdn matches domain name exactly)
  const recordName = fqdn === domain.name ? '' : fqdn.substring(0, fqdn.length - domain.name.length - 1);

  let record = await findRecord(apiKey, domain.name, recordName, type);

  if (!record) {
    // Create new record
    record = await createRecord(apiKey, domain.name, recordName, type, value);
  } else {
    // Update existing record
    record = await updateRecord(apiKey, domain.name, record.id, value);
  }

  if (!record) {
    throw new Error('Failed to create or retrieve record from DigitalOcean API');
  }

  return {
    zoneId: domain.name,
    zoneName: domain.name,
    recordName: recordName || '@',
    recordId: record.id,
    value,
  };
}

async function updateDynDNSRRset(apiKey, domainName, recordIdentifier, ip, type = 'A') {
  // recordIdentifier can be either numeric record_id (from DB) or record name
  let recordId;
  
  // If recordIdentifier is numeric (handle both "123" and "123.0" from SQLite), use it directly as record_id
  const numericMatch = String(recordIdentifier).match(/^(\d+)(\.0)?$/);
  if (numericMatch) {
    recordId = parseInt(numericMatch[1], 10);
  } else {
    // Otherwise, treat it as record name and look it up
    const normalizedName = recordIdentifier === '@' ? '' : recordIdentifier;
    const record = await findRecord(apiKey, domainName, normalizedName, type);
    if (!record) {
      throw new Error(`Record "${recordIdentifier}" not found in domain "${domainName}"`);
    }
    recordId = record.id;
  }

  return await updateRecord(apiKey, domainName, recordId, ip);
}

// Provider interface
export default {
  name: 'digitalocean',
  displayName: 'DigitalOcean DNS',
  apiKeyLabel: 'API Token',
  
  ensureRRsetForDomain,
  updateDynDNSRRset,
};
