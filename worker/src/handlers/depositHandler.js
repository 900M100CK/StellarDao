const { DatabaseUpdateError } = require('../utils/errors');
const { Long } = require('mongodb');

/**
 * Handles deposit events.
 * @param {import('mongodb').Db} db
 * @param {string} type Parsed event type
 * @param {object} data Parsed event data
 * @param {object} event Raw Horizon event
 */
async function handler(db, type, data, event) {
  const transactions = db.collection('transactions');
  const stats = db.collection('stats');

  try {
    if (type === 'deposit') {
      // 1. Idempotency check: prevent duplicate processing of the same transaction
      const existingTx = await transactions.findOne({ tx_hash: event.transaction_hash });
      if (existingTx) {
        return; 
      }

      await transactions.insertOne({
        from: data.from,
        amount: data.amount,
        timestamp: parseInt(data.timestamp),
        tx_hash: event.transaction_hash,
        type: 'deposit'
      });

      // 2. Safe balance update using MongoDB Long for BigInt compatibility
      await stats.updateOne(
        { key: 'treasury_balance' },
        { $inc: { value: Long.fromString(data.amount) } },
        { upsert: true }
      );
    }
  } catch (err) {
    throw new DatabaseUpdateError('Failed to record deposit', err);
  }
}

module.exports = handler;
