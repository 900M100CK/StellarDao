import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useAppContext } from '../context/AppContext';
import { contractService } from '../services/contractService';

export default function WhitelistManagement() {
  const { isAdmin, walletAddress, signTransaction } = useAppContext();
  const [whitelist, setWhitelist] = useState([]);
  const [newMemberAddress, setNewMemberAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchWhitelist();
    }
  }, [isAdmin]);

  const fetchWhitelist = async () => {
    setFetching(true);
    try {
      const members = await contractService.query.getWhitelist();
      setWhitelist(members || []);
    } catch (err) {
      console.error('Error fetching whitelist:', err);
      toast.error('Failed to load whitelist from blockchain.');
    } finally {
      setFetching(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-8 text-center mt-12">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
        <p className="text-gray-400">Only the Admin can access the Whitelist Management page.</p>
      </div>
    );
  }

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberAddress || newMemberAddress.length < 56) {
      toast.error('Invalid Stellar address.');
      return;
    }

    if (whitelist.includes(newMemberAddress.trim())) {
      toast.error('Member is already in the whitelist.');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Adding member to blockchain...');

    try {
      await contractService.addMember(walletAddress, signTransaction, newMemberAddress.trim());
      toast.success('Successfully added member!', { id: toastId });
      setNewMemberAddress('');
      fetchWhitelist(); // Refresh list
    } catch (err) {
      console.error('Error adding member:', err);
      toast.error(err.message || 'Failed to add member.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberAddr) => {
    if (!window.confirm(`Are you sure you want to remove ${memberAddr.substring(0, 8)}... from the whitelist?`)) {
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Removing member from blockchain...');

    try {
      await contractService.removeMember(walletAddress, signTransaction, memberAddr);
      toast.success('Member removed successfully.', { id: toastId });
      fetchWhitelist(); // Refresh list
    } catch (err) {
      console.error('Error removing member:', err);
      toast.error(err.message || 'Failed to remove member.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Whitelist Management</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Add Member Form */}
          <div className="md:col-span-1">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Add New Member</h3>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Stellar Address (G...)
                </label>
                <input
                  type="text"
                  value={newMemberAddress}
                  onChange={(e) => setNewMemberAddress(e.target.value)}
                  placeholder="G..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !newMemberAddress}
                className={`w-full py-2 px-4 rounded-lg font-bold text-white text-sm transition-all ${
                  loading || !newMemberAddress
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? 'Processing...' : 'Add Member'}
              </button>
            </form>
          </div>

          {/* Member List */}
          <div className="md:col-span-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex justify-between items-center">
              Current Members
              <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                {whitelist.length}
              </span>
            </h3>
            
            {fetching ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-sm">Fetching members from blockchain...</p>
              </div>
            ) : whitelist.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <p className="text-gray-500 text-sm">No members in whitelist.</p>
              </div>
            ) : (
              <div className="overflow-hidden border border-gray-200 rounded-xl">
                <ul className="divide-y divide-gray-200">
                  {whitelist.map((member, index) => (
                    <li key={member} className="px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-mono text-gray-900 truncate">
                            {member}
                          </p>
                          <p className="text-[10px] text-gray-500 flex items-center">
                            <span className="mr-1">Verified Member</span>
                            {member === walletAddress && (
                              <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 rounded-md font-bold uppercase tracking-tighter">You</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member)}
                        disabled={loading}
                        className="ml-4 text-red-600 hover:text-red-800 text-xs font-bold p-2 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                        title="Remove member"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-bold text-blue-800">Admin Tip</h3>
            <div className="mt-1 text-sm text-blue-700">
              <p>Adding or removing members updates the total member count used for voting quorums (&gt;2/3). All changes are recorded on the Stellar blockchain.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
