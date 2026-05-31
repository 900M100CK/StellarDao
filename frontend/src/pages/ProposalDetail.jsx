import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { contractService } from '../services/contractService';

function getStatusKey(status) {
  if (!status) return 'unknown';
  // scValToNative returns contracttype enums as arrays: ["Active"], ["PendingExecution"], etc.
  if (Array.isArray(status)) {
    const variant = String(status[0] ?? '');
    return variant.replace(/([A-Z])/g, (m, p1, offset) => (offset > 0 ? '_' : '') + p1.toLowerCase());
  }
  // Fallback: plain string or { Active: null } object shape
  if (typeof status === 'string') return status.toLowerCase();
  const key = Object.keys(status)[0];
  if (!key) return 'unknown';
  return key.replace(/([A-Z])/g, (m, p1, offset) => (offset > 0 ? '_' : '') + p1.toLowerCase()).replace(/^_/, '');
}

export default function ProposalDetail() {
  const { id } = useParams();
  const { walletAddress, signTransaction, isAdmin, isTreasurer } = useAppContext();

  const [proposal, setProposal] = useState(null);
  const [subCategories, setSubCategories] = useState([]);
  const [memberCount, setMemberCount] = useState(5);
  const [hasVoted, setHasVoted] = useState(false);
  const [myVote, setMyVote] = useState(null); // 'Approve' | 'Reject' | null
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const [subCats, setSubCats] = useState([{ name: '', amount: '' }]);

  const fetchProposal = async () => {
    try {
      const addr = typeof walletAddress === 'string' ? walletAddress : walletAddress?.address;
      const queries = [
        contractService.query.getProposal(parseInt(id)),
        contractService.query.getSubCategories(parseInt(id)),
        contractService.query.getConfig(),
      ];
      // Check vote status on-chain if wallet is connected
      if (addr) {
        queries.push(contractService.query.getMyVote(parseInt(id), addr));
      }
      const [prop, subCatsRaw, cfg, voteChoice] = await Promise.all(queries);
      if (!prop) {
        setError('Proposal not found.');
        return;
      }
      setProposal(prop);
      setSubCategories(Array.isArray(subCatsRaw) ? subCatsRaw : []);
      if (cfg?.member_count) setMemberCount(Number(cfg.member_count));
      if (voteChoice !== undefined) {
        setMyVote(voteChoice);        // 'Approve', 'Reject', or null
        setHasVoted(voteChoice !== null);
      }
    } catch (err) {
      setError('Failed to load proposal data from blockchain.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposal();
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
      fetchProposal();
    }, 10000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading && !proposal) return <div className="text-center py-10 text-gray-500">Loading from blockchain...</div>;
  if (!proposal) return <div className="text-center py-10 text-red-500">{error || 'Proposal not found.'}</div>;

  const formatCurrency = (stroops) => {
    const vnd = Number(stroops) / 10_000;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(vnd);
  };

  const statusKey = getStatusKey(proposal.status);
  const votingDeadline = Number(proposal.voting_deadline);
  const approvedAt = proposal.approved_at !== null && proposal.approved_at !== undefined ? Number(proposal.approved_at) : null;
  const isExpired = now >= votingDeadline;
  const approveCount = Number(proposal.yes_votes) || 0;
  const rejectCount = Number(proposal.no_votes) || 0;
  const approvePercent = memberCount > 0 ? (approveCount / memberCount) * 100 : 0;
  const rejectPercent = memberCount > 0 ? (rejectCount / memberCount) * 100 : 0;

  const timeLockSeconds = Number(import.meta.env.VITE_TIME_LOCK_SECONDS || 60);
  const executionTime = approvedAt ? approvedAt + timeLockSeconds : 0;
  const isTimeLockActive = now < executionTime;

  const handleVote = async (choice) => {
    if (!walletAddress) return setError('Please connect your wallet.');
    try {
      setActionLoading('vote');
      await contractService.vote(walletAddress, signTransaction, proposal.id, choice);
      await fetchProposal();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleFinalize = async () => {
    try {
      setActionLoading('finalize');
      await contractService.finalizeVoting(walletAddress, signTransaction, proposal.id);
      await fetchProposal();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleWithdraw = async (index = 0) => {
    try {
      setActionLoading('withdraw');
      await contractService.executeWithdrawal(walletAddress, signTransaction, proposal.id, index);
      await fetchProposal();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleSetSubCategories = async (e) => {
    e.preventDefault();
    try {
      setActionLoading('subcats');
      const formattedCats = subCats.map(c => ({
        name: c.name,
        amount: Number(c.amount) * 10_000_000,
        withdrawn: false
      }));
      await contractService.setSubCategories(walletAddress, signTransaction, proposal.id, formattedCats);
      await fetchProposal();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleConfirmCompletion = async (subIndex = null) => {
    try {
      setActionLoading(`confirm_${subIndex}`);
      await contractService.confirmCompletion(walletAddress, signTransaction, proposal.id, subIndex);
      await fetchProposal();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg font-medium shadow-sm border border-red-200">{error}</div>}

      {/* Section 1: Info */}
      <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{proposal.title || `Proposal #${proposal.id}`}</h1>
          <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase
            ${
              statusKey === 'active' ? 'bg-blue-100 text-blue-800' :
              statusKey === 'pending_execution' ? 'bg-yellow-100 text-yellow-800' :
              statusKey === 'executed' ? 'bg-green-100 text-green-800' :
              'bg-red-100 text-red-800'
            }`}>
            {statusKey.replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div><span className="text-gray-500">Creator:</span> <span className="font-medium break-all">{String(proposal.proposer)}</span></div>
          <div><span className="text-gray-500">Amount:</span> <span className="font-bold text-blue-600">{formatCurrency(Number(proposal.amount))}</span></div>
          <div><span className="text-gray-500">Type:</span> <span className="font-medium">{proposal.is_high_budget ? 'Large Budget (Breakdown required)' : 'Small Budget'}</span></div>
          <div><span className="text-gray-500">Deadline:</span> <span className="font-medium">{new Date(votingDeadline * 1000).toLocaleString('en-US')}</span></div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg text-gray-700 whitespace-pre-wrap">
          {proposal.description || 'No description provided.'}
        </div>

        {proposal.receipt_url && (
          <div className="mt-4">
            <a href={proposal.receipt_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-sm font-medium">
              📎 View attached document / invoice
            </a>
          </div>
        )}
      </div>

      {/* Section 2: Voting Panel */}
      <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Voting Progress</h2>

        <div className="relative w-full bg-gray-200 rounded-full h-6 mb-2 flex overflow-hidden shadow-inner">
          <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${approvePercent}%` }}></div>
          <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${rejectPercent}%` }}></div>
          <div className="absolute top-0 bottom-0 border-l-2 border-white/50 w-0.5" style={{ left: '66.66%' }}>
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-black text-gray-400 whitespace-nowrap">QUORUM 2/3</span>
          </div>
        </div>
        <div className="flex justify-between text-sm text-gray-600 mb-6 pt-2">
          <span className="font-bold text-green-600">Approve: {approveCount}</span>
          <span className="text-gray-400 text-xs">Total members: {memberCount}</span>
          <span className="font-bold text-red-600">Reject: {rejectCount}</span>
        </div>

        {statusKey === 'active' && (
          <div className="text-center p-4 border rounded-lg bg-gray-50">
            {!isExpired ? (
              <>
                <p className="text-lg font-bold text-blue-600 mb-4">
                  ⏳ Remaining: {Math.max(0, (votingDeadline - now) / 3600).toFixed(1)} hours
                </p>
                {!walletAddress ? (
                  <p className="text-gray-500">Connect wallet to vote.</p>
                ) : hasVoted ? (
                  <div className="space-y-2">
                    <div className={`inline-flex items-center px-4 py-2 rounded-full font-bold text-sm
                      ${myVote === 'Approve' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`}>
                      {myVote === 'Approve' ? '✅ You voted: Approve' : '❌ You voted: Reject'}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Your vote is recorded on-chain and cannot be changed.</p>
                  </div>
                ) : (
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={() => handleVote(0)} disabled={actionLoading === 'vote'}
                      className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition disabled:opacity-50"
                    >
                      {actionLoading === 'vote' ? 'Signing...' : 'Approve ✅'}
                    </button>
                    <button
                      onClick={() => handleVote(1)} disabled={actionLoading === 'vote'}
                      className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition disabled:opacity-50"
                    >
                      {actionLoading === 'vote' ? 'Signing...' : 'Reject ❌'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-red-600 mb-4">⚠️ Voting period has ended</p>
                {hasVoted && (
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold mb-3
                    ${myVote === 'Approve' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {myVote === 'Approve' ? '✅ You voted: Approve' : '❌ You voted: Reject'}
                  </div>
                )}
                <div>
                  <button
                    onClick={handleFinalize} disabled={actionLoading === 'finalize'}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition"
                  >
                    {actionLoading === 'finalize' ? 'Processing...' : 'Finalize Voting Results'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 3: Time-lock & Execution */}
      {statusKey === 'pending_execution' && (
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Disbursement & Execution</h2>
          <div className="text-center p-4 border rounded-lg bg-gray-50">
            {isTimeLockActive ? (
              <p className="text-lg font-bold text-orange-600">
                🔒 Defensive time-lock active. Unlocks in: {executionTime - now} seconds
              </p>
            ) : (
              <>
                <p className="text-lg font-bold text-green-600 mb-4">🔓 Ready for disbursement</p>
                {isTreasurer ? (
                  !proposal.is_high_budget ? (
                    <button
                      onClick={() => handleWithdraw(0)} disabled={actionLoading === 'withdraw'}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:bg-gray-400"
                    >
                      {actionLoading === 'withdraw' ? 'Executing...' : 'Execute Withdrawal'}
                    </button>
                  ) : (
                    <p className="text-sm text-blue-600 font-medium">Large budget: Please withdraw by sub-categories below.</p>
                  )
                ) : (
                  <p className="text-sm text-gray-500">Only the Treasurer can execute withdrawals.</p>
                )}
                {proposal.is_high_budget && !proposal.sub_categories_locked && (
                  <p className="text-sm text-red-500 mt-2">Awaiting Admin sub-budget declaration before withdrawal.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Section 4: Sub-categories */}
      {(proposal.is_high_budget || statusKey === 'executed') && (
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Sub-budget Management & Confirmations</h2>

          {proposal.is_high_budget && statusKey === 'pending_execution' && !proposal.sub_categories_locked && isAdmin && (
            <form onSubmit={handleSetSubCategories} className="space-y-4 mb-6">
              <h3 className="font-medium text-gray-700">Admin: Declare disbursement categories</h3>
              {subCats.map((cat, idx) => (
                <div key={idx} className="flex space-x-2">
                  <input
                    type="text" placeholder="Category Name" required value={cat.name}
                    onChange={(e) => { const n = [...subCats]; n[idx].name = e.target.value; setSubCats(n); }}
                    className="flex-1 border p-2 rounded"
                  />
                  <input
                    type="number" placeholder="Amount (VND)" required value={cat.amount}
                    onChange={(e) => { const n = [...subCats]; n[idx].amount = e.target.value; setSubCats(n); }}
                    className="flex-1 border p-2 rounded"
                  />
                  {idx > 0 && <button type="button" onClick={() => setSubCats(subCats.filter((_, i) => i !== idx))} className="px-3 bg-red-100 text-red-600 rounded">X</button>}
                </div>
              ))}
              <div className="flex justify-between">
                <button type="button" onClick={() => setSubCats([...subCats, {name:'', amount:''}])} className="text-sm text-blue-600">+ Add Category</button>
                <button type="submit" disabled={actionLoading === 'subcats'} className="px-4 py-2 bg-gray-800 text-white rounded">Save & Lock Categories</button>
              </div>
            </form>
          )}

          {proposal.sub_categories_locked && subCategories.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-700">Category list (Locked):</h3>
              {subCategories.map((cat, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 border rounded">
                  <div>
                    <p className="font-bold">{cat.name}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(Number(cat.amount))}</p>
                  </div>
                  <div>
                    {cat.withdrawn ? (
                      <div className="flex space-x-2">
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Withdrawn</span>
                        {isAdmin && (
                          <button
                            onClick={() => handleConfirmCompletion(idx)}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded"
                          >Confirm Completion (+1 Rep)</button>
                        )}
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">Not disbursed</span>
                        {isTreasurer && !isTimeLockActive && (
                          <button
                            onClick={() => handleWithdraw(idx)}
                            disabled={actionLoading === 'withdraw'}
                            className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                          >Withdraw</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!proposal.is_high_budget && statusKey === 'executed' && isAdmin && (
            <div className="mt-4 p-4 border rounded bg-gray-50 text-center">
              <button
                onClick={() => handleConfirmCompletion(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded"
              >Confirm Completion (+1 Rep for Proposer)</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
