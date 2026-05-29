const { DatabaseUpdateError } = require('../utils/errors');

/**
 * Handles contract initialization events.
 * @param {import('mongodb').Db} db
 * @param {string} type Parsed event type
 * @param {object} data Parsed event data
 * @param {object} event Raw Horizon event
 */
async function handler(db, type, data, event) {
  const stats = db.collection('stats');
  const members = db.collection('members');

  try {
    if (type === 'contract_initialized') {
      const existing = await stats.findOne({ key: 'contract_config' });
      if (existing?.tx_hash === event.transaction_hash) {
        return;
      }
      
      const memberCount = data.whitelist ? data.whitelist.length : 0;

      await stats.updateOne(
        { key: 'contract_config' },
        {
          $set: {
            admin: data.admin,
            treasurer: data.treasurer,
            member_count: memberCount,
            initialized_at: parseInt(Date.now() / 1000),
            tx_hash: event.transaction_hash
          }
        },
        { upsert: true }
      );

      // Populate initial members with 0 reputation
      if (data.whitelist && data.whitelist.length > 0) {
        const memberOps = data.whitelist.map(address => ({
          updateOne: {
            filter: { address },
            update: {
              $set: {
                address,
                reputation_score: 0,
                last_updated: parseInt(Date.now() / 1000)
              }
            },
            upsert: true
          }
        }));
        await members.bulkWrite(memberOps);
      }
    }
  } catch (err) {
    throw new DatabaseUpdateError('Failed to initialize contract config and members in DB', err);
  }
}

module.exports = handler;
