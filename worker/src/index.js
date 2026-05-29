const path = require('path');
// Load .env relative to this file's directory to ensure it's found when run from project root
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { rpc, scValToNative, xdr } = require('@stellar/stellar-sdk');
const { MongoClient } = require('mongodb');
const winston = require('winston');
const { parseContractEvents } = require('./eventParser');
const { AppError, SyncError } = require('./utils/errors');

// Handlers
const proposalHandler = require('./handlers/proposalHandler');
const voteHandler = require('./handlers/voteHandler');
const reputationHandler = require('./handlers/reputationHandler');
const depositHandler = require('./handlers/depositHandler');
const configHandler = require('./handlers/configHandler');

// Logging setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'worker.log' })
  ]
});

const {
  CONTRACT_ID,
  SOROBAN_RPC_URL,
  MONGODB_URI,
  NETWORK_PASSPHRASE,
  POLL_INTERVAL_MS = '5000'
} = process.env;

// Validate essential environment variables
if (!SOROBAN_RPC_URL) {
  logger.error('❌ SOROBAN_RPC_URL is not defined in environment variables!');
  process.exit(1);
}
if (!CONTRACT_ID) {
  logger.error('❌ CONTRACT_ID is not defined in environment variables!');
  process.exit(1);
}

const server = new rpc.Server(SOROBAN_RPC_URL);
let mongoClient;
let db;
let isRunning = true;

const handlerRegistry = {
  'proposal_created': proposalHandler,
  'proposal_approved': proposalHandler,
  'proposal_rejected': proposalHandler,
  'withdrawal_executed': proposalHandler,
  'phase_withdrawal_executed': proposalHandler,
  'sub_categories_set': proposalHandler,
  'vote_cast': voteHandler,
  'reputation_updated': reputationHandler,
  'deposit': depositHandler,
  'contract_initialized': configHandler
};

async function connectMongo() {
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('MongoDB connection error', { error: err.message });
    process.exit(1);
  }
}

async function getSyncState() {
  const syncMeta = db.collection('sync_meta');
  const doc = await syncMeta.findOne({ key: `sync_state_${CONTRACT_ID}` });
  return doc ? doc.value : { lastLedger: null, cursor: null };
}

async function saveSyncState(state) {
  const syncMeta = db.collection('sync_meta');
  await syncMeta.updateOne(
    { key: `sync_state_${CONTRACT_ID}` },
    { $set: { value: state, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function resolveInitialSyncState() {
  const saved = await getSyncState();
  if (saved.lastLedger) {
    return saved;
  }

  if (process.env.SYNC_START_LEDGER) {
    const ledger = parseInt(process.env.SYNC_START_LEDGER, 10);
    logger.info('No sync state; using SYNC_START_LEDGER for backfill', { lastLedger: ledger });
    return { lastLedger: ledger, cursor: null };
  }

  const lookback = parseInt(process.env.SYNC_LOOKBACK_LEDGERS || '200000', 10);
  const latest = await server.getLatestLedger();
  const lastLedger = Math.max(1, latest.sequence - lookback);
  logger.info('No sync state; backfilling from lookback window', { lastLedger, lookback });
  return { lastLedger, cursor: null };
}

async function startSync() {
  let { lastLedger, cursor } = await resolveInitialSyncState();

  logger.info('Starting Event Sync Worker', { contractId: CONTRACT_ID, lastLedger, cursor });
  let errorCount = 0;

  while (isRunning) {
    try {
      const requestParams = {
        startLedger: lastLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [CONTRACT_ID]
          }
        ],
        pagination: { limit: 50 }
      };
      if (cursor) {
        requestParams.pagination.cursor = cursor;
      }
      
      const response = await server.getEvents(requestParams);
      
      errorCount = 0; // reset on success

      if (response.events && response.events.length > 0) {
        for (const event of response.events) {
          logger.info('Processing contract event', { id: event.id, ledger: event.ledger });
          await handleEvent(event);
        }

        const lastEvent = response.events[response.events.length - 1];
        lastLedger = lastEvent.ledger;
        cursor = response.cursor ?? null;

        // Nếu page này ít hơn limit, nghĩa là đã "đuổi kịp" ledger hiện tại ở page này
        if (response.events.length < 50) {
          lastLedger = lastEvent.ledger + 1;
          cursor = null;
        }
        
        await saveSyncState({ lastLedger, cursor });

        // Nếu đã đuổi kịp hoàn toàn (không còn cursor), chờ interval
        if (!cursor) {
          await new Promise(resolve => setTimeout(resolve, parseInt(POLL_INTERVAL_MS)));
        }
      } else {
        // Không có event mới
        const latest = await server.getLatestLedger();
        if (!cursor && lastLedger < latest.sequence) {
          lastLedger = latest.sequence;
          await saveSyncState({ lastLedger, cursor: null });
        }
        await new Promise(resolve => setTimeout(resolve, parseInt(POLL_INTERVAL_MS)));
      }
    } catch (err) {
      errorCount++;
      const backoffMs = Math.min(30000, Math.pow(2, errorCount) * 1000);
      logger.error('Error in sync loop', { error: err.message, stack: err.stack, backoffMs });
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}

async function handleEvent(event) {
    const parsedEvent = parseContractEvents(event);
    if (!parsedEvent) return;

    const { type, data } = parsedEvent;
    logger.info('Parsed event', { type, data });

    const handler = handlerRegistry[type];
    if (!handler) {
        logger.warn(`No handler mapping found for event type: ${type}`);
        return;
    }

    try {
        await handler(db, type, data, { transaction_hash: event.txHash });
    } catch (err) {
        throw new SyncError(`Error in handler for type ${type}: ${err.message}`);
    }
}

async function gracefulShutdown() {
  logger.info('Shutting down gracefully...');
  isRunning = false;
  if (mongoClient) {
    await mongoClient.close();
    logger.info('MongoDB connection closed');
  }
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function startHeartbeat() {
  const updateHeartbeat = async () => {
    try {
      if (!db) return;
      await db.collection('stats').updateOne(
        { key: 'worker_heartbeat' },
        { $set: { last_ping: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      logger.error('Failed to update worker heartbeat', { error: err.message });
    }
  };

  // Update immediately and then every 15 seconds
  await updateHeartbeat();
  setInterval(updateHeartbeat, 15000);
}

async function main() {
  await connectMongo();
  await startHeartbeat();
  await startSync();
}

main().catch(err => {
  logger.error('Main process error', { error: err.message });
  process.exit(1);
});
