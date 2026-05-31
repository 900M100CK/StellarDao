const { Keypair, rpc, Networks } = require('@stellar/stellar-sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const networkPassphrase = Networks.TESTNET;

const stellarEnv = {
  ...process.env,
  STELLAR_NETWORK_PASSPHRASE: networkPassphrase,
  STELLAR_RPC_URL: RPC_URL,
};

function runStellar(cmd) {
  return execSync(cmd, { env: stellarEnv, encoding: 'utf8' }).trim();
}

async function fundAccount(publicKey) {
  try {
    console.log(`Funding ${publicKey} via Friendbot...`);
    const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
    if (!res.ok) throw new Error(`Friendbot failed with status ${res.status}`);
    console.log(`Funded ${publicKey} successfully.`);
  } catch (e) {
    console.error('Funding failed, waiting 5s and trying again...', e.message);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
    if (!res.ok) throw new Error(`Friendbot retry failed with status ${res.status}`);
    console.log(`Funded ${publicKey} successfully on retry.`);
  }
}

async function findContractInitLedger(contractId) {
  const latest = await server.getLatestLedger();
  const lookback = 5000;
  const startLedger = Math.max(1, latest.sequence - lookback);
  const res = await server.getEvents({
    startLedger,
    filters: [{ type: 'contract', contractIds: [contractId] }],
    pagination: { limit: 200 },
  });
  if (!res.events?.length) {
    return Math.max(1, latest.sequence - 500);
  }
  const minLedger = Math.min(...res.events.map((e) => e.ledger));
  return Math.max(1, minLedger - 1);
}

function writeEnvFiles({ contractId, publicKeys, nativeTokenAddress, syncStartLedger }) {
  const root = path.join(__dirname, '..');

  const envDemo = `VITE_CONTRACT_ID=${contractId}
VITE_ADMIN_ADDRESS=${publicKeys.admin}
VITE_TREASURER_ADDRESS=${publicKeys.treasurer}
VITE_TOKEN_ADDRESS=${nativeTokenAddress}
VITE_STRICT_MODE=false
VITE_RPC_URL=${RPC_URL}
VITE_NETWORK_PASSPHRASE="${networkPassphrase}"
VITE_TIME_LOCK_SECONDS=10`;

  fs.writeFileSync(path.join(root, '.env.demo'), envDemo);

  const frontendEnv = `${envDemo}
`;
  fs.writeFileSync(path.join(root, 'frontend', '.env'), frontendEnv);

  const appConfig = {
    contractId,
    adminAddress: publicKeys.admin,
    treasurerAddress: publicKeys.treasurer,
    tokenAddress: nativeTokenAddress,
    rpcUrl: RPC_URL,
    networkPassphrase,
    timeLockSeconds: 10,
  };
  fs.writeFileSync(
    path.join(root, 'frontend', 'public', 'app-config.json'),
    JSON.stringify(appConfig, null, 2)
  );

  console.log('\nSynced env files: .env.demo, frontend/.env, frontend/public/app-config.json');
  console.log('SYNC_START_LEDGER:', syncStartLedger);
}

async function setupDemo() {
  console.log('=== STELLAR TREASURY DEMO SETUP ===');

  const admin = Keypair.random();
  const treasurer = Keypair.random();
  const member1 = Keypair.random();
  const member2 = Keypair.random();
  const member3 = Keypair.random();

  const wallets = {
    admin: admin.secret(),
    treasurer: treasurer.secret(),
    member1: member1.secret(),
    member2: member2.secret(),
    member3: member3.secret(),
  };

  const publicKeys = {
    admin: admin.publicKey(),
    treasurer: treasurer.publicKey(),
    member1: member1.publicKey(),
    member2: member2.publicKey(),
    member3: member3.publicKey(),
  };

  console.log('Generated Wallets:');
  console.table(publicKeys);

  fs.writeFileSync(
    path.join(__dirname, '../demo/demo_wallets.json'),
    JSON.stringify({ publicKeys, secrets: wallets }, null, 2)
  );

  await fundAccount(admin.publicKey());
  await fundAccount(treasurer.publicKey());
  await fundAccount(member1.publicKey());
  await fundAccount(member2.publicKey());
  await fundAccount(member3.publicKey());

  const wasmPath = path.join(__dirname, '../contract/target/wasm32v1-none/release/stellar_treasury.wasm');
  if (!fs.existsSync(wasmPath)) {
    console.error("WASM not found! Run 'cd contract && stellar contract build' first.");
    process.exit(1);
  }

  console.log('\nDeploying contract...');
  let contractId;
  try {
    contractId = runStellar(
      `stellar contract deploy --wasm "${wasmPath}" --source ${admin.secret()} --network testnet`
    );
    console.log('Contract deployed! ID:', contractId);
  } catch (e) {
    console.error('Failed to deploy contract:', e.stdout || e.message);
    process.exit(1);
  }

  console.log('\nResolving native SAC (USDC demo token)...');
  let nativeTokenAddress;
  try {
    nativeTokenAddress = runStellar('stellar contract id asset --asset native --network testnet');
    console.log('Native SAC Address:', nativeTokenAddress);
  } catch (e) {
    console.error('Failed to get native SAC:', e.message);
    nativeTokenAddress = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
  }

  console.log('\nInitializing contract...');
  const whitelist = `["${publicKeys.admin}","${publicKeys.treasurer}","${publicKeys.member1}","${publicKeys.member2}","${publicKeys.member3}"]`;
  const whitelistPath = path.join(__dirname, '../temp_whitelist.json');
  fs.writeFileSync(whitelistPath, whitelist);

  // Ngưỡng Ngân sách lớn: 5,000,000 VNĐ. 
  // Với tỷ lệ mới 1 VNĐ = 10,000 stroops, 5M VNĐ = 50,000,000,000 stroops (5,000 XLM)
  // Điều này cho phép test tính năng High Budget trên Testnet (vốn cấp 10,000 XLM)
  const thresholdStroops = "50000000000"; 
  const initCmd = `stellar contract invoke --id ${contractId} --source ${admin.secret()} --network testnet -- initialize --admin ${publicKeys.admin} --treasurer ${publicKeys.treasurer} --token_address ${nativeTokenAddress} --time_lock_seconds 10 --budget_threshold_usdc ${thresholdStroops} --member_whitelist-file-path "${whitelistPath}"`;

  try {
    runStellar(initCmd);
    console.log('Contract initialized successfully!');
  } catch (e) {
    console.error('Failed to initialize contract:', e.stdout || e.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(whitelistPath)) fs.unlinkSync(whitelistPath);
  }

  const syncStartLedger = await findContractInitLedger(contractId);
  writeEnvFiles({ contractId, publicKeys, nativeTokenAddress, syncStartLedger });

  console.log('\n=== SETUP COMPLETE ===');
  console.log('Contract ID:', contractId);
  console.log('Import demo/demo_wallets.json secrets into Freighter (Testnet).');
  console.log('Follow demo/scenario.md');
}

setupDemo().catch((err) => {
  console.error(err);
  process.exit(1);
});
