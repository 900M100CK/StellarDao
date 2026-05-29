const { Keypair, rpc, Networks, TransactionBuilder, Operation, Address, nativeToScVal } = require('@stellar/stellar-sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RPC_URL = process.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const networkPassphrase = Networks.TESTNET;

async function transferAdmin() {
  const newAdminAddress = 'GC6GKZAU7SOCYOSJIORSP5HFJTB5ANGIEOQXPKJ7D3NGGRLHAFHGTHVS';
  const walletsPath = path.join(__dirname, '../demo/demo_wallets.json');
  
  if (!fs.existsSync(walletsPath)) {
    console.error('demo_wallets.json not found. Please run setup-demo.js first.');
    return;
  }

  const secretsData = JSON.parse(fs.readFileSync(walletsPath, 'utf8'));
  const currentAdmin = Keypair.fromSecret(secretsData.secrets.admin);
  
  // Try to find contract ID from env or config files
  let contractId = process.env.VITE_CONTRACT_ID;
  if (!contractId) {
    const envDemo = fs.readFileSync(path.join(__dirname, '../.env.demo'), 'utf8');
    const match = envDemo.match(/VITE_CONTRACT_ID=(.+)/);
    if (match) contractId = match[1].trim();
  }

  if (!contractId) {
    console.error('Contract ID not found in environment or .env.demo');
    return;
  }

  console.log(`Current Admin: ${currentAdmin.publicKey()}`);
  console.log(`Contract ID: ${contractId}`);
  console.log(`Transferring to: ${newAdminAddress}...`);

  try {
    const account = await server.getAccount(currentAdmin.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: '500000',
      networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: 'transfer_admin',
          args: [
            Address.fromString(currentAdmin.publicKey()).toScVal(),
            Address.fromString(newAdminAddress).toScVal(),
          ],
        })
      )
      .setTimeout(300)
      .build();

    const preparedTx = await server.prepareTransaction(tx);
    preparedTx.sign(currentAdmin);
    
    const sendResult = await server.sendTransaction(preparedTx);
    
    if (sendResult.status === 'ERROR') {
      throw new Error(`Transaction error: ${JSON.stringify(sendResult)}`);
    }

    console.log('Transaction submitted. Hash:', sendResult.hash);
    console.log('Waiting for confirmation...');

    let status = sendResult.status;
    let attempts = 0;
    while (status === 'PENDING' && attempts < 20) {
      await new Promise(r => setTimeout(resolve, 3000));
      const res = await server.getTransaction(sendResult.hash);
      status = res.status;
      attempts++;
    }

    if (status === 'SUCCESS') {
      console.log('\n✅ Admin privileges successfully transferred on-chain!');
      console.log('Please restart your frontend to see the changes.');
    } else {
      console.error('Transfer failed or timed out.');
    }
  } catch (e) {
    console.error('Error during transfer:', e.message);
  }
}

transferAdmin();
