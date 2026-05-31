import { rpc, TransactionBuilder, Operation, nativeToScVal, scValToNative, Address, Account, xdr } from '@stellar/stellar-sdk';
import { loadAppConfig, getCachedAppConfig } from '../config/appConfig';
import { normalizePublicKey } from '../utils/stellar';

let server = null;

async function getRuntime() {
  const config = getCachedAppConfig() || (await loadAppConfig());
  if (!server) {
    server = new rpc.Server(config.rpcUrl);
  }
  return { config, server };
}

function toAddressScVal(pubKey) {
  const normalized = normalizePublicKey(pubKey);
  if (!normalized) {
    throw new Error('Invalid wallet address. Please reconnect Freighter.');
  }
  return Address.fromString(normalized).toScVal();
}

const TREASURY_ERRORS = {
  1: 'Contract has already been initialized.',
  2: 'Contract has not been initialized.',
  3: 'Wallet address is not in the whitelist. You need to be added by the Admin.',
  4: 'You do not have permission to perform this action.',
  5: 'Invalid voting deadline (must be in the future).',
  6: 'Proposal not found.',
  7: 'Voting period has ended.',
  8: 'You have already voted on this proposal.',
  9: 'Invalid proposal status for this action.',
  10: 'Only the Treasurer has permission to perform this action.',
};

function parseHostError(msg) {
  if (!msg) return 'Unknown error';

  const contractErrorMatch = msg.match(/Error\(Contract, #(\d+)\)/);
  if (contractErrorMatch) {
    const code = parseInt(contractErrorMatch[1], 10);
    return TREASURY_ERRORS[code] || `Contract error #${code}`;
  }

  if (msg.includes('resulting balance is not within the allowed range')) {
    return 'Insufficient XLM/Token balance to perform this transaction.';
  }

  if (msg.includes('HostError: Error{')) {
    const detailMatch = msg.match(/HostError: Error\{ (.+?) \}/);
    return detailMatch ? detailMatch[1] : msg;
  }

  return msg;
}

async function buildAndSubmitTransaction(address, signTransaction, functionName, args) {
  const { config, server: rpcServer } = await getRuntime();
  const sourceAddress = normalizePublicKey(address);

  if (!sourceAddress) {
    throw new Error('Invalid wallet address. Please reconnect Freighter.');
  }

  try {
    const account = await rpcServer.getAccount(sourceAddress);
    const builder = new TransactionBuilder(account, {
      fee: '500000', 
      networkPassphrase: config.networkPassphrase,
    });

    builder.addOperation(
      Operation.invokeContractFunction({
        contract: config.contractId,
        function: functionName,
        args,
      })
    );

    builder.setTimeout(300);

    let tx = builder.build();

    try {
      tx = await rpcServer.prepareTransaction(tx);
    } catch (simError) {
      console.error('Simulation failed:', simError);
      throw new Error(`Invalid transaction (Simulation failed): ${parseHostError(simError.message)}`);
    }

    const signedXdr = await signTransaction(tx.toXDR(), config.networkPassphrase);
    const signedTx = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);
    const sendResult = await rpcServer.sendTransaction(signedTx);

    if (sendResult.status === 'ERROR') {
      console.error('=== sendTransaction ERROR ===', JSON.stringify(sendResult, null, 2));
      let detail = 'Stellar network error or invalid transaction';
      
      try {
        const txResult = sendResult.errorResult;
        if (txResult) {
          const res = txResult.result();
          const resultCode = res.switch && typeof res.switch === 'function'
            ? res.switch().name
            : res.name || 'UNKNOWN';
          
          console.error('Decoded Transaction Result Code:', resultCode);

          const errorMap = {
            txInsufficientBalance: 'Insufficient XLM balance to pay fee and maintain account (Min 1 XLM).',
            txBadSeq: 'Invalid transaction sequence number (Sequence). Please refresh and try again.',
            txBadAuth: 'Invalid signature. Check Testnet network on Freighter wallet.',
            txTooLate: 'Transaction expired. Please try again.',
            txInternalError: 'Internal Stellar network error.',
            txInsufficientFee: 'Transaction fee is too low.',
          };

          detail = errorMap[resultCode] || `System error code: ${resultCode}`;
        }

        if (sendResult.diagnosticEvents?.length) {
          console.error('Diagnostic events:', sendResult.diagnosticEvents);
        }
      } catch (decodeError) {
        console.error('Failed to decode error result:', decodeError);
      }
      
      throw new Error(`Failed to send transaction: ${detail}`);
    }

    let status = sendResult.status;
    let getTxResponse = null;
    let attempts = 0;

    while ((status === 'PENDING' || status === 'NOT_FOUND') && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getTxResponse = await rpcServer.getTransaction(sendResult.hash);
      status = getTxResponse.status;
      attempts++;
    }

    if (status === 'SUCCESS') {
      return getTxResponse;
    }

    if (status === 'NOT_FOUND') {
      throw new Error('Transaction not found on the network. This could be due to RPC node latency or transaction cancellation due to low fee/changed balance.');
    }

    if (status === 'FAILED') {
      console.error('Transaction Failed detail:', getTxResponse);
      throw new Error('Transaction execution failed. Please check your Token/XLM balance or wallet permissions.');
    }

    throw new Error(`Transaction ended with unknown status: ${status}`);
  } catch (error) {
    console.error(`Error executing ${functionName}:`, error);
    throw error;
  }
}

export const contractService = {
  deposit: async (address, signTransaction, amount) => {
    const args = [toAddressScVal(address), nativeToScVal(BigInt(amount), { type: 'i128' })];
    return buildAndSubmitTransaction(address, signTransaction, 'deposit', args);
  },

  createProposal: async (address, signTransaction, amount, title, descHash, receiptHash, votingDeadline) => {
    const safeTitle = title || '';
    const safeDescHash = descHash || '';
    const safeReceiptHash = receiptHash || '';

    const args = [
      toAddressScVal(address),
      nativeToScVal(BigInt(amount), { type: 'i128' }),
      nativeToScVal(safeTitle, { type: 'string' }),
      nativeToScVal(safeDescHash, { type: 'string' }),
      nativeToScVal(safeReceiptHash, { type: 'string' }),
      nativeToScVal(BigInt(votingDeadline), { type: 'u64' }),
    ];
    return buildAndSubmitTransaction(address, signTransaction, 'create_proposal', args);
  },

  vote: async (address, signTransaction, proposalId, choiceIndex) => {
    const choiceVariant = choiceIndex === 0 ? 'Approve' : 'Reject';
    const choiceScVal = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(choiceVariant)]);
    const args = [
      toAddressScVal(address),
      nativeToScVal(Number(proposalId), { type: 'u32' }),  // contract: proposal_id: u32
      choiceScVal,
    ];
    return buildAndSubmitTransaction(address, signTransaction, 'vote', args);
  },

  finalizeVoting: async (address, signTransaction, proposalId) => {
    const args = [nativeToScVal(Number(proposalId), { type: 'u32' })];
    return buildAndSubmitTransaction(address, signTransaction, 'finalize_voting', args);
  },

  executeWithdrawal: async (address, signTransaction, proposalId, subCategoryIndex = 0) => {
    const args = [
      toAddressScVal(address),
      nativeToScVal(Number(proposalId), { type: 'u32' }),  // contract: proposal_id: u32
      nativeToScVal(Number(subCategoryIndex), { type: 'u32' }),
    ];
    return buildAndSubmitTransaction(address, signTransaction, 'execute_withdrawal', args);
  },

  setSubCategories: async (address, signTransaction, proposalId, categories) => {
    const scCategories = categories.map((cat) =>
      nativeToScVal({
        name: cat.name,
        amount: BigInt(cat.amount),
        withdrawn: cat.withdrawn,
      })
    );

    const args = [
      toAddressScVal(address),
      nativeToScVal(Number(proposalId), { type: 'u32' }),  // contract: proposal_id: u32
      nativeToScVal(scCategories),
    ];
    return buildAndSubmitTransaction(address, signTransaction, 'set_sub_categories', args);
  },

  confirmCompletion: async (address, signTransaction, proposalId, subCategoryIndex = null) => {
    const subCatScVal = subCategoryIndex !== null
      ? nativeToScVal(Number(subCategoryIndex), { type: 'u32' })
      : nativeToScVal(null);
    const args = [
      toAddressScVal(address),
      nativeToScVal(Number(proposalId), { type: 'u32' }),  // contract: proposal_id: u32
      subCatScVal,
    ];
    return buildAndSubmitTransaction(address, signTransaction, 'confirm_completion', args);
  },

  addMember: async (address, signTransaction, newMemberAddress) => {
    const args = [
      toAddressScVal(address),
      toAddressScVal(newMemberAddress),
    ];
    return buildAndSubmitTransaction(address, signTransaction, 'add_member', args);
  },

  transferAdmin: async (address, signTransaction, newAdminAddress) => {
    const args = [
      toAddressScVal(address),
      toAddressScVal(newAdminAddress),
    ];
    return buildAndSubmitTransaction(address, signTransaction, 'transfer_admin', args);
  },

  removeMember: async (address, signTransaction, memberAddress) => {
    const args = [
      toAddressScVal(address),
      toAddressScVal(memberAddress),
    ];
    return buildAndSubmitTransaction(address, signTransaction, 'remove_member', args);
  },

  query: {
    getConfig: async () => {
      const { config, server: rpcServer } = await getRuntime();
      // Use Account (stellar-sdk v15+): dummy source for simulation only — no signing needed.
      const dummySource = new Account(
        config.adminAddress || import.meta.env.VITE_ADMIN_ADDRESS,
        '0'
      );
      const tx = new TransactionBuilder(dummySource, {
        fee: '100',
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: config.contractId,
            function: 'get_config',
            args: [],
          })
        )
        .setTimeout(0)
        .build();

      const result = await rpcServer.simulateTransaction(tx);
      if (result.error) throw new Error(result.error);
      return scValToNative(result.result.retval);
    },

    getWhitelist: async () => {
      const { config, server: rpcServer } = await getRuntime();
      const dummySource = new Account(
        config.adminAddress || import.meta.env.VITE_ADMIN_ADDRESS,
        '0'
      );
      const tx = new TransactionBuilder(dummySource, {
        fee: '100',
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: config.contractId,
            function: 'get_whitelist',
            args: [],
          })
        )
        .setTimeout(0)
        .build();

      const result = await rpcServer.simulateTransaction(tx);
      if (result.error) throw new Error(result.error);
      return scValToNative(result.result.retval);
    },

    getMemberReputation: async (memberAddress) => {
      const { config, server: rpcServer } = await getRuntime();
      const dummySource = new Account(memberAddress, '0');
      const tx = new TransactionBuilder(dummySource, {
        fee: '100',
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: config.contractId,
            function: 'get_member_reputation',
            args: [toAddressScVal(memberAddress)],
          })
        )
        .setTimeout(0)
        .build();

      const result = await rpcServer.simulateTransaction(tx);
      if (result.error) throw new Error(result.error);
      return scValToNative(result.result.retval);
    },

    getProposal: async (proposalId) => {
      const { config, server: rpcServer } = await getRuntime();
      const dummySource = new Account(
        config.adminAddress || import.meta.env.VITE_ADMIN_ADDRESS,
        '0'
      );
      const tx = new TransactionBuilder(dummySource, {
        fee: '100',
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: config.contractId,
            function: 'get_proposal',
            args: [nativeToScVal(Number(proposalId), { type: 'u32' })],
          })
        )
        .setTimeout(0)
        .build();

      const result = await rpcServer.simulateTransaction(tx);
      if (result.error) throw new Error(result.error);
      return scValToNative(result.result.retval);
    },

    getAllProposals: async () => {
      const { config, server: rpcServer } = await getRuntime();
      const dummySource = new Account(
        config.adminAddress || import.meta.env.VITE_ADMIN_ADDRESS,
        '0'
      );
      const tx = new TransactionBuilder(dummySource, {
        fee: '100',
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: config.contractId,
            function: 'get_all_proposals',
            args: [],
          })
        )
        .setTimeout(0)
        .build();

      const result = await rpcServer.simulateTransaction(tx);
      if (result.error) throw new Error(result.error);
      return scValToNative(result.result.retval) || [];
    },

    getTreasuryBalance: async () => {
      const { config, server: rpcServer } = await getRuntime();
      const dummySource = new Account(
        config.adminAddress || import.meta.env.VITE_ADMIN_ADDRESS,
        '0'
      );
      const tx = new TransactionBuilder(dummySource, {
        fee: '100',
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: config.contractId,
            function: 'get_treasury_balance',
            args: [],
          })
        )
        .setTimeout(0)
        .build();

      const result = await rpcServer.simulateTransaction(tx);
      if (result.error) throw new Error(result.error);
      const raw = scValToNative(result.result.retval);
      return typeof raw === 'bigint' ? raw.toString() : String(raw || '0');
    },

    getSubCategories: async (proposalId) => {
      const { config, server: rpcServer } = await getRuntime();
      const dummySource = new Account(
        config.adminAddress || import.meta.env.VITE_ADMIN_ADDRESS,
        '0'
      );
      const tx = new TransactionBuilder(dummySource, {
        fee: '100',
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: config.contractId,
            function: 'get_sub_categories',
            args: [nativeToScVal(Number(proposalId), { type: 'u32' })],
          })
        )
        .setTimeout(0)
        .build();

      const result = await rpcServer.simulateTransaction(tx);
      if (result.error) throw new Error(result.error);
      return scValToNative(result.result.retval) || [];
    },

    // Check if a voter has already voted on a proposal by reading DataKey::Vote(proposal_id, voter)
    // from persistent ledger storage directly — no database needed.
    hasVoted: async (proposalId, voterAddress) => {
      const { config, server: rpcServer } = await getRuntime();
      try {
        const normalized = normalizePublicKey(voterAddress);
        if (!normalized) return false;

        // Build the DataKey::Vote(proposal_id, voter) ledger key
        // DataKey enum: Vote is variant index 1
        const voteKey = xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol('Vote'),
          nativeToScVal(Number(proposalId), { type: 'u32' }),
          Address.fromString(normalized).toScVal(),
        ]);

        const ledgerKey = xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(config.contractId).toScAddress(),
            key: voteKey,
            durability: xdr.ContractDataDurability.persistent(),
          })
        );

        const res = await rpcServer.getLedgerEntries(ledgerKey);
        return res.entries && res.entries.length > 0;
      } catch {
        return false;
      }
    },

    // Get the voter's choice: returns 'Approve', 'Reject', or null if not voted
    getMyVote: async (proposalId, voterAddress) => {
      const { config, server: rpcServer } = await getRuntime();
      try {
        const normalized = normalizePublicKey(voterAddress);
        if (!normalized) return null;

        const voteKey = xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol('Vote'),
          nativeToScVal(Number(proposalId), { type: 'u32' }),
          Address.fromString(normalized).toScVal(),
        ]);

        const ledgerKey = xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(config.contractId).toScAddress(),
            key: voteKey,
            durability: xdr.ContractDataDurability.persistent(),
          })
        );

        const res = await rpcServer.getLedgerEntries(ledgerKey);
        if (!res.entries || res.entries.length === 0) return null;
        const val = scValToNative(res.entries[0].val.contractData().val());
        // VoteChoice enum: { Approve: null } or { Reject: null }
        if (!val) return null;
        return Object.keys(val)[0]; // 'Approve' or 'Reject'
      } catch {
        return null;
      }
    },
  },
};
