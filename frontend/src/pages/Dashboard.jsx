import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export default function Dashboard() {
  const { walletAddress } = useAppContext();
  const [balance, setBalance] = useState('0');
  const [proposals, setProposals] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const fetchData = async () => {
    try {
      const [balRaw, propsRaw, membersRaw, cfg] = await Promise.all([
        contractService.query.getTreasuryBalance(),
        contractService.query.getAllProposals(),
        contractService.query.getWhitelist(),
        contractService.query.getConfig(),
      ]);
      setBalance(balRaw || '0');
      setProposals(Array.isArray(propsRaw) ? propsRaw : []);
      setMembers(Array.isArray(membersRaw) ? membersRaw : []);
      setMemberCount(cfg?.member_count ? Number(cfg.member_count) : 0);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (stroops) => {
    // 1 XLM = 10,000,000 stroops; display rate: 1 XLM = 1,000 VND => 1 VND = 10,000 stroops
    const vnd = Number(stroops) / 10_000;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(vnd);
  };

  const filteredProposals = proposals.filter(p => {
    const s = getStatusKey(p.status);
    if (activeTab === 'all') return true;
    if (activeTab === 'voting') return s === 'active';
    if (activeTab === 'pending') return s === 'pending_execution';
    if (activeTab === 'history') return s === 'executed' || s === 'rejected';
    return true;
  });

  const activeCount = proposals.filter(p => {
    const s = getStatusKey(p.status);
    return s === 'active' || s === 'pending_execution';
  }).length;

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">Fetching data from Stellar blockchain...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left/Center: Overview & Proposals */}
      <div className="lg:col-span-2 space-y-8">

        {/* 1. Treasury Overview Card */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-xl p-8 border border-blue-500/20 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"></path><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"></path></svg>
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-bold opacity-90">Club Treasury Overview</h2>
              {walletAddress && (
                <div className="flex space-x-3">
                  <Link to="/deposit" className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition backdrop-blur-sm border border-white/20">
                    + Deposit
                  </Link>
                  <Link to="/create-proposal" className="px-4 py-2 bg-white text-blue-600 hover:bg-blue-50 text-xs font-bold rounded-xl transition shadow-lg">
                    + Create Proposal
                  </Link>
                </div>
              )}
            </div>
            <div className="flex flex-col md:flex-row md:justify-between md:items-end">
              <div>
                <p className="text-sm opacity-70 mb-1 font-medium">Current Balance on Blockchain</p>
                <p className="text-5xl font-black tracking-tight">{formatCurrency(balance)}</p>
              </div>
              <div className="mt-6 md:mt-0 flex space-x-8 text-sm">
                <div className="flex flex-col items-end">
                  <span className="opacity-60 uppercase text-[10px] font-black tracking-widest">Active</span>
                  <span className="font-bold text-2xl">{activeCount}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="opacity-60 uppercase text-[10px] font-black tracking-widest">Members</span>
                  <span className="font-bold text-2xl">{memberCount || members.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Demo Rules Notice */}
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-start space-x-3 shadow-sm">
          <span className="text-2xl">💡</span>
          <div className="text-xs text-amber-900 leading-relaxed">
            <p className="font-bold mb-1">Hackathon Demo Settings:</p>
            <ul className="list-disc list-inside space-y-0.5 opacity-80">
              <li>Defensive Time-lock: <span className="font-bold">10 seconds</span> (Production: 24h).</li>
              <li>Large Budget Threshold: <span className="font-bold">5,000,000 VND</span> (Phased disbursement required).</li>
              <li>Voting Threshold: Requires <span className="font-bold">&gt; 2/3 of total members</span> in favor to pass.</li>
            </ul>
          </div>
        </div>

        {/* 2. Proposals List with Tabs */}
        <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
              <h2 className="text-lg font-bold text-gray-800">Proposals List</h2>
              <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-bold">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'voting', label: 'Voting' },
                  { id: 'pending', label: 'Pending Execution' },
                  { id: 'history', label: 'History' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-md transition ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {filteredProposals.length === 0 ? (
              <div className="p-10 text-center text-gray-500 italic">No proposals found in this category.</div>
            ) : (
              filteredProposals.map(p => {
                const statusKey = getStatusKey(p.status);
                const deadline = Number(p.voting_deadline);
                const isExpired = Date.now() / 1000 > deadline;
                return (
                  <Link to={`/proposal/${p.id}`} key={p.id} className="block p-6 hover:bg-gray-50 transition border-l-4 border-transparent hover:border-blue-500">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-md font-bold text-gray-900">{p.title || `Proposal #${p.id}`}</h3>
                        <p className="text-xs text-gray-400 mt-1">ID: {p.id} | By: {String(p.proposer).slice(0, 6)}...{String(p.proposer).slice(-4)}</p>
                      </div>
                      <span className={`px-3 py-1 text-xs font-black rounded-full uppercase tracking-tighter
                        ${
                          statusKey === 'active' ? 'bg-blue-100 text-blue-800' :
                          statusKey === 'pending_execution' ? 'bg-yellow-100 text-yellow-800' :
                          statusKey === 'executed' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {statusKey.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <span className="text-lg font-bold text-gray-800">{formatCurrency(Number(p.amount))}</span>
                      <div className="text-right">
                        {statusKey === 'active' && (
                          <div className="flex flex-col items-end">
                            <div className="w-32 h-1.5 bg-gray-200 rounded-full mb-1 overflow-hidden">
                              <div className="bg-blue-500 h-full" style={{ width: `${Math.min(100, (Number(p.yes_votes) / Math.max(memberCount, 1)) * 100)}%` }}></div>
                            </div>
                            <p className={`text-[10px] font-bold uppercase ${isExpired ? 'text-red-500' : 'text-blue-500'}`}>
                              {isExpired ? '⚠️ Awaiting tally' : `⏳ Expires in: ${Math.max(0, (deadline - Date.now() / 1000) / 3600).toFixed(1)} hours`}
                            </p>
                          </div>
                        )}
                        {statusKey === 'pending_execution' && (
                          <p className="text-[10px] text-yellow-600 font-bold uppercase animate-pulse">
                            🔒 Defensive Time-lock active
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Members */}
      <div className="space-y-8">

        {/* Member List */}
        <div className="bg-white rounded-xl shadow border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            👥 Whitelisted Members
            <span className="ml-2 text-sm font-normal text-gray-400">({members.length})</span>
          </h2>
          <div className="space-y-2">
            {members.slice(0, 8).map((addr, idx) => {
              const addrStr = String(addr);
              const isMe = addrStr === walletAddress;
              return (
                <div key={addrStr} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-gray-700 truncate">
                      {addrStr.slice(0, 8)}...{addrStr.slice(-6)}
                      {isMe && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">YOU</span>}
                    </p>
                  </div>
                </div>
              );
            })}
            {members.length === 0 && <p className="text-sm text-gray-500 italic">No members found.</p>}
            {members.length > 8 && (
              <p className="text-xs text-gray-400 text-center pt-2">+{members.length - 8} more members</p>
            )}
          </div>
        </div>

        {/* User Stats Card */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow p-6 text-white">
          <h3 className="font-bold mb-2 flex items-center">
            <span className="mr-2">👤</span> Your Profile
          </h3>
          {walletAddress ? (
            <div className="space-y-2">
              <p className="text-xs opacity-80 break-all">{walletAddress}</p>
              <div className="pt-2">
                <span className="text-xs opacity-70">Connected to Stellar {members.includes(walletAddress) ? '✅ Member' : '(not a member)'}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm opacity-80 italic">Please connect your wallet to view personal stats.</p>
          )}
        </div>

      </div>
    </div>
  );
}
