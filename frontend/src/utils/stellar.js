/** Normalize Freighter v6 responses ({ address }) or legacy string keys. */
export function normalizePublicKey(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== 'undefined' ? trimmed : null;
  }
  if (typeof value === 'object') {
    const key = value.address || value.publicKey || value.signerAddress;
    if (typeof key === 'string' && key.length > 0) return key;
  }
  return null;
}

export function getNetworkPassphrase() {
  const raw = import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
  return String(raw).replace(/^["']|["']$/g, '');
}

export function getContractId() {
  const id = import.meta.env.VITE_CONTRACT_ID;
  if (!id || String(id).trim() === '') {
    throw new Error(
      'VITE_CONTRACT_ID is not configured. Run `node scripts/setup-demo.js` then restart `npm run dev`.'
    );
  }
  return String(id).trim();
}
