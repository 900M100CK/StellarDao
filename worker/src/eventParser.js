const { scValToNative, xdr } = require('@stellar/stellar-sdk');
const { z } = require('zod');
const { EventParsingError } = require('./utils/errors');

// Zod Schemas for event data validation
const ProposalCreatedSchema = z.object({
  proposalId: z.number(),
  proposer: z.string(),
  amount: z.string(),
  descriptionHash: z.string(),
  receiptHash: z.string(),
  votingDeadline: z.string(),
  isHighBudget: z.boolean()
});

const VoteCastSchema = z.object({
  proposalId: z.number(),
  voter: z.string(),
  choice: z.any(), // Enum index or string depending on contract implementation
  timestamp: z.string()
});

const DepositSchema = z.object({
  from: z.string(),
  amount: z.string(),
  timestamp: z.string()
});

/** Decode ScVal from Soroban RPC (object) or Horizon SSE (base64 string). */
function scValFromEventField(field) {
  if (!field) return null;
  
  try {
    if (typeof field === 'string') {
      return scValToNative(xdr.ScVal.fromXDR(field, 'base64'));
    }
    // If it's already an object, it might be an xdr.ScVal or already native
    // We try to convert it if it looks like an XDR object (has switch method)
    if (field && typeof field.switch === 'function') {
      return scValToNative(field);
    }
    return field; // Assume already native or other type
  } catch (err) {
    // If it fails, return the field as is to avoid crashing the whole sync
    console.error('Warning: Failed to parse ScVal field:', err.message);
    return field;
  }
}

function toStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return String(v);
}

/**
 * Parses a Soroban contract event from Soroban RPC or Horizon SSE.
 * @param {object} event Contract event payload
 * @returns {object|null} Parsed event with type and data.
 */
function parseContractEvents(event) {
  try {
    const topics = event.topic.map((t) => scValFromEventField(t));
    const value = scValFromEventField(event.value);

    const category = toStr(topics[0]);
    const subType = toStr(topics[1]);

    let parsedData = null;
    let type = null;

    if (category === 'TREASURY') {
      if (subType === 'INIT') {
        type = 'contract_initialized';
        parsedData = { 
          admin: toStr(value[0]), 
          treasurer: toStr(value[1]), 
          whitelist: Array.isArray(value[2]) ? value[2].map(m => toStr(m)) : []
        };
      }
      if (subType === 'DEPOSIT') {
        type = 'deposit';
        parsedData = DepositSchema.parse({
          from: toStr(value[0]),
          amount: toStr(value[1]),
          timestamp: toStr(value[2])
        });
      }
      if (subType === 'WITHDRAW') {
        type = 'withdrawal_executed';
        parsedData = { proposalId: Number(value[0]), proposer: toStr(value[1]), amount: toStr(value[2]) };
      }
      if (subType === 'PHASE_WD') {
        type = 'phase_withdrawal_executed';
        parsedData = { proposalId: Number(value[0]), name: toStr(value[1]), amount: toStr(value[2]) };
      }
    }

    if (category === 'PROPOSAL') {
      if (subType === 'CREATED') {
        type = 'proposal_created';
        parsedData = ProposalCreatedSchema.parse({ 
          proposalId: Number(value[0]), 
          proposer: toStr(value[1]), 
          amount: toStr(value[2]),
          descriptionHash: toStr(value[3]),
          receiptHash: toStr(value[4]),
          votingDeadline: toStr(value[5]),
          isHighBudget: value[6]
        });
      }
      if (subType === 'VOTE') {
        type = 'vote_cast';
        parsedData = VoteCastSchema.parse({ 
          proposalId: Number(value[0]), 
          voter: toStr(value[1]), 
          choice: value[2],
          timestamp: toStr(value[3])
        });
      }
      if (subType === 'APPROVED') {
        type = 'proposal_approved';
        parsedData = { proposalId: Number(value[0]), yesVotes: toStr(value[1]), approvedAt: toStr(value[2]) };
      }
      if (subType === 'REJECTED') {
        type = 'proposal_rejected';
        parsedData = { proposalId: Number(value[0]), yesVotes: toStr(value[1]), rejectedAt: toStr(value[2]) };
      }
      if (subType === 'CATS_SET') {
        type = 'sub_categories_set';
        parsedData = { proposalId: Number(value[0]), categories: value[1] };
      }
    }

    if (category === 'REPUTATION') {
      if (subType === 'UPDATE') {
        type = 'reputation_updated';
        parsedData = { member: toStr(value[0]), newScore: value[1] };
      }
    }

    if (type && parsedData) {
      return { type, data: parsedData };
    }

    return null;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new EventParsingError('Validation failed for event data', err.errors);
    }
    throw new EventParsingError(`Error parsing event XDR: ${err.message}`);
  }
}

module.exports = { parseContractEvents };
