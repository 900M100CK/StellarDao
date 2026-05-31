import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { contractService } from '../services/contractService';

export default function CreateProposal() {
  const { walletAddress, signTransaction } = useAppContext();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const defaultDate = new Date();
    defaultDate.setHours(defaultDate.getHours() + 2);
    const tzoffset = new Date().getTimezoneOffset() * 60000;
    const localISOTime = new Date(defaultDate - tzoffset).toISOString().slice(0, 16);
    setDeadline(localISOTime);
  }, []);

  const isHighBudget = Number(amount) >= 5_000_000;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const addr = typeof walletAddress === 'string' ? walletAddress : walletAddress?.address;
    if (!addr || addr === 'undefined') {
      return setError('Please connect a valid wallet.');
    }

    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (deadlineTimestamp <= now + 3600) {
      return setError('Voting deadline must be at least 1 hour in the future.');
    }

    try {
      setLoading(true);
      // Amount conversion: 1 VND = 10,000 stroops (1 XLM = 10,000,000 stroops, 1 XLM = 1,000 VND)
      const stroops = BigInt(Math.round(Number(amount))) * BigInt(10_000);
      await contractService.createProposal(
        addr,
        signTransaction,
        stroops,
        title,
        description,
        receiptUrl || '',
        deadlineTimestamp
      );
      navigate('/');
    } catch (err) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-8 border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Create New Proposal</h2>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 p-3 rounded text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title (Max 100 characters)</label>
          <input
            type="text" required maxLength={100} value={title} onChange={e => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Detailed description of spending purpose</label>
          <textarea
            required rows={4} value={description} onChange={e => setDescription(e.target.value)}
            data-gramm="false"
            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (VND)</label>
            <input
              type="number" required min="1000" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voting Deadline</label>
            <input
              type="datetime-local" required value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {amount && (
          <div className={`p-3 rounded-lg border ${isHighBudget ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
            <p className={`text-sm font-bold ${isHighBudget ? 'text-orange-700' : 'text-green-700'}`}>
              {isHighBudget ? '⚠️ Large Budget Proposal (Requires phased sub-budget approval)' : '✅ Small Budget Proposal (Direct disbursement)'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice/Document Link (Optional)</label>
          <input
            type="url" value={receiptUrl} onChange={e => setReceiptUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className={`w-full py-3 rounded-lg text-white font-bold text-lg transition
            ${loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {loading ? 'Submitting to Stellar...' : 'Sign and Create Proposal'}
        </button>
      </form>
    </div>
  );
}