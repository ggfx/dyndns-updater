// Provider Registry and Loader
import hetzner from './hetzner.js';
import digitalocean from './digitalocean.js';

const providers = {
  hetzner,
  digitalocean,
};

/**
 * Get all available providers
 */
export function getProviders() {
  return Object.values(providers);
}

/**
 * Get a specific provider by name
 */
export function getProvider(name) {
  return providers[name];
}

/**
 * Get provider by name or throw error
 */
export function requireProvider(name) {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown provider: ${name}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

/**
 * Get list of providers for UI dropdown
 */
export function getProviderOptions() {
  return Object.values(providers).map(p => ({
    value: p.name,
    label: p.displayName,
  }));
}
