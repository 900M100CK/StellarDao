const { Keypair, rpc, Networks, TransactionBuilder, Operation, Address, nativeToScVal } = require('@stellar/stellar-sdk');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const networkPassphrase = Networks.TESTNET;

// Load config and wallets
const root = path.join(__dirname, '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/app-config.json'), 'utf8'));
const wallets = JSON.parse(fs.readFileSync(path.join(root, 'demo/demo_wallets.json'), 'utf8'));

const CONTRACT_ID = appConfig.contractId;
const DEPOSIT_AMOUNT = BigInt(2 * 10_000_000); // 2 USDC = 20,000,000 stroops

async function submitTx(secret) {
  const kp = Keypair.fromSecret(secret);
  const pub = kp.publicKey();
  
  console.log(`\nProcessing deposit for ${pub}...`);
  
  const account = await server.getAccount(pub);
  const builder = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase,
  });

  const args = [
    Address.fromString(pub).toScVal(),
    nativeToScVal(DEPOSIT_AMOUNT, { type: 'i128' })
  ];

  builder.addOperation(
    Operation.invokeContractFunction({
      contract: CONTRACT_ID,
      function: 'deposit',
      args,
    })
  );

  builder.setTimeout(60);
  let tx = builder.build();

  console.log('Preparing transaction (simulation + resource assembly)...');
  try {
    tx = await server.prepareTransaction(tx);
  } catch (simError) {
    throw new Error(`Transaction preparation failed: ${simError.message || simError}`);
  }
  
  tx.sign(kp);

  console.log('Submitting...');
  const res = await server.sendTransaction(tx);
  if (res.status === 'ERROR') {
    throw new Error(`Send failed: ${res.errorResultXdr}`);
  }

  let status = res.status;
  let attempts = 0;
  while ((status === 'PENDING' || status === 'NOT_FOUND') && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000));
    const getTx = await server.getTransaction(res.hash);
    status = getTx.status;
    attempts++;
  }

  if (status === 'SUCCESS') {
    console.log(`✅ Success! Hash: ${res.hash}`);
  } else {
    throw new Error(`Transaction failed with status: ${status}`);
  }
}

async function bulkDeposit() {
  console.log('=== BULK DEPOSIT 2 USDC FOR ALL MEMBERS ===');
  const secrets = Object.values(wallets.secrets);
  
  for (const secret of secrets) {
    try {
      await submitTx(secret);
    } catch (e) {
      console.error(`❌ Failed for account: ${e.message}`);
    }
  }
  console.log('\n=== DONE ===');
}

bulkDeposit().catch(console.error);
