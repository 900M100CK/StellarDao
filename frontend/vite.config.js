import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(frontendDir, '..');

function loadMergedEnv(mode) {
  const fromParent = loadEnv(mode, projectRoot, 'VITE_');
  const fromFrontend = loadEnv(mode, frontendDir, 'VITE_');
  let merged = { ...fromParent, ...fromFrontend };

  const configPath = path.join(frontendDir, 'public', 'app-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      merged = {
        ...merged,
        VITE_CONTRACT_ID: json.contractId || merged.VITE_CONTRACT_ID,
        VITE_ADMIN_ADDRESS: json.adminAddress || merged.VITE_ADMIN_ADDRESS,
        VITE_TREASURER_ADDRESS: json.treasurerAddress || merged.VITE_TREASURER_ADDRESS,
        VITE_TOKEN_ADDRESS: json.tokenAddress || merged.VITE_TOKEN_ADDRESS,
        VITE_RPC_URL: json.rpcUrl || merged.VITE_RPC_URL,
        VITE_NETWORK_PASSPHRASE: json.networkPassphrase || merged.VITE_NETWORK_PASSPHRASE,
        VITE_API_URL: json.apiUrl || merged.VITE_API_URL,
        VITE_TIME_LOCK_SECONDS: String(json.timeLockSeconds ?? merged.VITE_TIME_LOCK_SECONDS ?? 60),
      };
    } catch {
      // ignore invalid json
    }
  }

  return merged;
}

export default defineConfig(({ mode }) => {
  const env = loadMergedEnv(mode);
  const define = {};

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('VITE_')) {
      define[`import.meta.env.${key}`] = JSON.stringify(value ?? '');
    }
  }

  return {
    root: frontendDir,
    envDir: frontendDir,
    plugins: [react()],
    define,
    server: {
      port: 5173,
      strictPort: false,
    },
  };
});
