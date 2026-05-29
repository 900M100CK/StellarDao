const { DatabaseUpdateError } = require('../utils/errors');

/**
 * Handles proposal-related events.
 * @param {import('mongodb').Db} db
 * @param {string} type Parsed event type
 * @param {object} data Parsed event data
 * @param {object} event Raw Horizon event
 */
async function handler(db, type, data, event) {
  const proposals = db.collection('proposals');

  try {
    switch (type) {
      case 'proposal_created':
        await proposals.updateOne(
          { proposal_id: data.proposalId },
          {
            $set: {
              proposal_id: data.proposalId,
              proposer: data.proposer,
              amount: data.amount,
              description_hash: data.descriptionHash,
              receipt_hash: data.receiptHash,
              voting_deadline: parseInt(data.votingDeadline),
              status: 'active',
              is_high_budget: data.isHighBudget,
              created_at: parseInt(Date.now() / 1000),
              tx_hash: event.transaction_hash
            }
          },
          { upsert: true }
        );
        break;

      case 'proposal_approved':
        await proposals.updateOne(
          { proposal_id: data.proposalId },
          {
            $set: {
              status: 'pending_execution',
              approved_at: parseInt(data.approvedAt),
              yes_votes: data.yesVotes
            }
          }
        );
        break;

      case 'proposal_rejected':
        await proposals.updateOne(
          { proposal_id: data.proposalId },
          {
            $set: {
              status: 'rejected',
              rejected_at: parseInt(data.rejectedAt),
              yes_votes: data.yesVotes
            }
          }
        );
        break;

      case 'withdrawal_executed':
        await proposals.updateOne(
          { proposal_id: data.proposalId },
          {
            $set: {
              status: 'executed',
              executed_at: parseInt(Date.now() / 1000)
            }
          }
        );
        break;

      case 'phase_withdrawal_executed':
        await proposals.updateOne(
          { proposal_id: data.proposalId, "sub_categories.name": data.name },
          {
            $set: {
              "sub_categories.$.withdrawn": true,
              "sub_categories.$.withdrawn_at": parseInt(Date.now() / 1000)
            }
          }
        );
        
        // Check if all sub_categories of this proposal are withdrawn
        const updatedProposal = await proposals.findOne({ proposal_id: data.proposalId });
        if (updatedProposal && updatedProposal.sub_categories) {
          const allWithdrawn = updatedProposal.sub_categories.every(cat => cat.withdrawn);
          if (allWithdrawn) {
            await proposals.updateOne(
              { proposal_id: data.proposalId },
              {
                $set: {
                  status: 'executed',
                  executed_at: parseInt(Date.now() / 1000)
                }
              }
            );
          }
        }
        break;

      case 'sub_categories_set':
        // data: { proposalId, categories: [{name, amount}] }
        // Enforce DEC-012: sub-categories are immutable after being set
        await proposals.updateOne(
          { 
            proposal_id: data.proposalId,
            sub_categories_locked: { $ne: true }
          },
          {
            $set: {
              sub_categories: data.categories.map(c => ({
                name: c.name,
                amount: c.amount.toString(),
                withdrawn: false
              })),
              sub_categories_locked: true
            }
          }
        );
        break;
    }
  } catch (err) {
    throw new DatabaseUpdateError(`Failed to update proposal ${data.proposalId}`, err);
  }
}

module.exports = handler;
