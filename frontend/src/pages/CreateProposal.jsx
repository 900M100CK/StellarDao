import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAppContext } from '../context/AppContext';
import { contractService } from '../services/contractService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

  // Default deadline: now + 2 hours
  useEffect(() => {
    const defaultDate = new Date();
    defaultDate.setHours(defaultDate.getHours() + 2);
    // Format cho input type="datetime-local" (YYYY-MM-DDThh:mm)
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(defaultDate - tzoffset)).toISOString().slice(0, 16);
    setDeadline(localISOTime);
  }, []);

  const isHighBudget = Number(amount) >= 5000000;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const addr =
      typeof walletAddress === 'string' ? walletAddress : walletAddress?.address;
    if (!addr || addr === 'undefined') {
      return setError('Please connect a valid wallet.');
    }

    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    
    // Validate > now + 1 hour (3600 seconds)
    if (deadlineTimestamp <= now + 3600) {
      return setError('Voting deadline must be at least 1 hour in the future.');
    }

    try {
      setLoading(true);

      // 1. Post metadata to Backend (API will generate hash)
      const metadataPayload = {
        title,
        description,
        receipt_urls: receiptUrl ? [receiptUrl] : []
      };

      const metaRes = await axios.post(`${API_URL}/proposals/metadata`, metadataPayload);
      const { description_hash, receipt_hash = '' } = metaRes.data;

      // 2. Submit on-chain transaction
      // New rate: 1,000 VND = 1.0 XLM (10,000,000 stroops)
      // Equivalent: 1 VND = 10,000 stroops
      const stroops = BigInt(Math.round(Number(amount))) * BigInt(10_000);
      
      try {
        await contractService.createProposal(
          addr,
          signTransaction,
          stroops,
          description_hash,
          receipt_hash,
          deadlineTimestamp
        );
        navigate('/');
      } catch (txError) {
        // Rollback metadata if tx fails
        await axios.delete(`${API_URL}/proposals/metadata/${description_hash}/${receipt_hash}`);
        throw new Error('Transaction failed. Proposal creation cancelled.');
      }
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
          {loading ? 'Submitting transaction...' : 'Sign and Create Proposal'}
        </button>
      </form>
    </div>
  );
}