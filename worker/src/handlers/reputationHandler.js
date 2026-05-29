const { DatabaseUpdateError } = require('../utils/errors');

/**
 * Handles reputation update events.
 * @param {import('mongodb').Db} db
 * @param {string} type Parsed event type
 * @param {object} data Parsed event data
 * @param {object} event Raw Horizon event
 */
async function handler(db, type, data, event) {
  const members = db.collection('members');

  try {
    if (type === 'reputation_updated') {
      await members.updateOne(
        { address: data.member },
        {
          $set: {
            address: data.member,
            reputation_score: data.newScore,
            last_updated: parseInt(Date.now() / 1000)
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    throw new DatabaseUpdateError(`Failed to update reputation for member ${data.member}`, err);
  }
}

module.exports = handler;
