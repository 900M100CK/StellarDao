let cached = null;

function fromViteEnv() {
  const contractId = import.meta.env.VITE_CONTRACT_ID;
  if (!contractId || String(contractId).trim() === '') {
    return null;
  }
  return {
    contractId: String(contractId).trim(),
    adminAddress: import.meta.env.VITE_ADMIN_ADDRESS || '',
    treasurerAddress: import.meta.env.VITE_TREASURER_ADDRESS || '',
    tokenAddress: import.meta.env.VITE_TOKEN_ADDRESS || '',
    rpcUrl: import.meta.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org',
    networkPassphrase: String(import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015').replace(
      /^["']|["']$/g,
      ''
    ),
    apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
    timeLockSeconds: Number(import.meta.env.VITE_TIME_LOCK_SECONDS || 60),
  };
}

/** Load config from Vite env or /app-config.json (works even if .env was not picked up). */
export async function loadAppConfig() {
  if (cached) return cached;

  const fromEnv = fromViteEnv();
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  const res = await fetch('/app-config.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      'Failed to load app configuration. Run `node scripts/setup-demo.js` from the Project folder, then `cd frontend && npm run dev`.'
    );
  }

  const json = await res.json();
  if (!json.contractId) {
    throw new Error('app-config.json is missing contractId. Run setup-demo again.');
  }

  cached = {
    contractId: json.contractId,
    adminAddress: json.adminAddress || '',
    treasurerAddress: json.treasurerAddress || '',
    tokenAddress: json.tokenAddress || '',
    rpcUrl: json.rpcUrl || 'https://soroban-testnet.stellar.org',
    networkPassphrase: json.networkPassphrase || 'Test SDF Network ; September 2015',
    apiUrl: json.apiUrl || 'http://localhost:3001/api',
    timeLockSeconds: Number(json.timeLockSeconds || 60),
  };
  return cached;
}

export function getCachedAppConfig() {
  return cached;
}
