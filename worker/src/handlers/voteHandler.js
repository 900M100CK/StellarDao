const { DatabaseUpdateError } = require('../utils/errors');

/**
 * Handles voting events.
 * @param {import('mongodb').Db} db
 * @param {string} type Parsed event type
 * @param {object} data Parsed event data
 * @param {object} event Raw Horizon event
 */
async function handler(db, type, data, event) {
  const votes = db.collection('votes');

  try {
    if (type === 'vote_cast') {
      await votes.updateOne(
        { proposal_id: data.proposalId, voter: data.voter },
        {
          $set: {
            proposal_id: data.proposalId,
            voter: data.voter,
            choice: data.choice,
            timestamp: parseInt(data.timestamp),
            tx_hash: event.transaction_hash
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    throw new DatabaseUpdateError(`Failed to save vote for proposal ${data.proposalId} by ${data.voter}`, err);
  }
}

module.exports = handler;
