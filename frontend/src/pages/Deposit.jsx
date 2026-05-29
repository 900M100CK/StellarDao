import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { contractService } from '../services/contractService';
import { normalizePublicKey } from '../utils/stellar';

export default function Deposit() {
  const { walletAddress, signTransaction, connect } = useAppContext();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Normalize address for internal logic
  const addr = normalizePublicKey(walletAddress);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!addr) {
      setError('Please connect your wallet before depositing.');
      return;
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount.');
      return;
    }

    try {
      setLoading(true);
      // Convert VND to Stroops. New rate: 1,000 VND = 1.0 XLM (10,000,000 stroops)
      // Equivalent: 1 VND = 10,000 stroops
      const stroops = BigInt(Math.round(amount)) * BigInt(10_000);
      await contractService.deposit(addr, signTransaction, stroops);
      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError(err.message || 'An error occurred during deposit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto bg-white rounded-xl shadow p-8 border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Deposit Funds</h2>
      
      {error && (
        <div className="mb-4 bg-red-50 text-red-700 p-3 rounded text-sm font-medium">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 bg-green-50 text-green-700 p-3 rounded text-sm font-medium">
          Deposit successful! Redirecting to home...
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Wallet
          </label>
          <div className="flex space-x-2">
            <input 
              type="text" 
              readOnly 
              value={addr || 'Wallet not connected'} 
              className="flex-1 bg-gray-50 border border-gray-300 text-gray-500 rounded-md p-2 text-sm"
            />
            {!addr && (
              <button 
                type="button"
                onClick={connect}
                className="bg-gray-800 text-white px-3 py-1 rounded text-sm font-bold hover:bg-black"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount (VND equivalent in USDC)
          </label>
          <div className="relative">
            <input 
              type="number" 
              required
              min="1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g., 500000"
              className="w-full border border-gray-300 rounded-md p-2 pl-4 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="absolute right-4 top-2 text-gray-400 font-medium">VND</span>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className={`w-full py-3 rounded-lg text-white font-bold text-lg transition
            ${loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {loading ? 'Processing...' : 'Confirm Deposit'}
        </button>
      </form>
    </div>
  );
}
