import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { contractService } from '../services/contractService';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowUpRight, 
  Wallet, 
  Users, 
  FileText, 
  CheckCircle, 
  Clock, 
  XCircle,
  CaretRight
} from '@phosphor-icons/react';

function getStatusKey(status) {
  if (!status) return 'unknown';
  if (Array.isArray(status)) {
    const variant = String(status[0] ?? '');
    return variant.replace(/([A-Z])/g, (m, p1, offset) => (offset > 0 ? '_' : '') + p1.toLowerCase());
  }
  if (typeof status === 'string') return status.toLowerCase();
  const key = Object.keys(status)[0];
  if (!key) return 'unknown';
  return key.replace(/([A-Z])/g, (m, p1, offset) => (offset > 0 ? '_' : '') + p1.toLowerCase()).replace(/^_/, '');
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
};

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
      <div className="flex flex-col justify-center items-center min-h-[50vh] space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin"></div>
        <p className="text-sm font-medium text-slate-400">Syncing with Soroban...</p>
      </div>
    );
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-12 gap-6"
    >
      {/* Hero Bento Block */}
      <motion.div variants={itemVariants} className="md:col-span-8 bento-card relative overflow-hidden flex flex-col justify-between">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-sky-400/20 to-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
        
        <div>
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Total Treasury Balance</p>
              <h1 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tighter">
                <span className="font-mono">{formatCurrency(balance)}</span>
              </h1>
            </div>
          </div>
          
          <div className="flex space-x-8 mt-12">
            <div className="flex flex-col">
              <span className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                <FileText weight="fill" className="mr-1" /> Active
              </span>
              <span className="text-3xl font-mono font-bold text-slate-800">{activeCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                <Users weight="fill" className="mr-1" /> Members
              </span>
              <span className="text-3xl font-mono font-bold text-slate-800">{memberCount || members.length}</span>
            </div>
          </div>
        </div>

        {walletAddress && (
          <div className="mt-8 flex space-x-3 relative z-10">
            <Link to="/create-proposal">
              <motion.button 
                whileHover={{ scale: 0.98 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 bg-slate-900 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-shadow flex items-center"
              >
                New Proposal <ArrowUpRight weight="bold" className="ml-2" />
              </motion.button>
            </Link>
          </div>
        )}
      </motion.div>

      {/* Profile/Members Bento Block */}
      <motion.div variants={itemVariants} className="md:col-span-4 flex flex-col gap-6">
        <div className="bento-card flex-1 flex flex-col">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center">
            <Wallet className="mr-2 text-lg" /> Your Profile
          </h3>
          {walletAddress ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-400 font-bold uppercase mb-1">Connected Address</p>
                <p className="text-sm font-mono font-medium text-slate-700 break-all">{walletAddress}</p>
              </div>
              <div className="flex items-center space-x-2">
                {members.includes(walletAddress) ? (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center">
                    <CheckCircle weight="fill" className="mr-1" /> Verified Member
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full flex items-center">
                    <Clock weight="fill" className="mr-1" /> Observer Mode
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-3">
                <Wallet size={24} />
              </div>
              <p className="text-sm font-medium text-slate-500">Connect wallet to view your DAO profile and reputation.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Proposals List Block */}
      <motion.div variants={itemVariants} className="md:col-span-12 mt-4">
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-6 px-2">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Recent Proposals</h2>
          <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-full mt-4 md:mt-0">
            {[
              { id: 'all', label: 'All' },
              { id: 'voting', label: 'Active' },
              { id: 'pending', label: 'Pending' },
              { id: 'history', label: 'History' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all
                  ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredProposals.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bento-card py-16 text-center"
              >
                <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-slate-500 font-medium">No proposals found for this filter.</p>
              </motion.div>
            ) : (
              filteredProposals.map(p => {
                const statusKey = getStatusKey(p.status);
                const deadline = Number(p.voting_deadline);
                const isExpired = Date.now() / 1000 > deadline;
                
                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                    key={p.id}
                  >
                    <Link to={`/proposal/${p.id}`} className="group block bento-card p-6 hover:shadow-float transition-all duration-300">
                      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="text-xs font-mono font-bold text-slate-400">#{p.id}</span>
                            <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase tracking-widest flex items-center
                              ${
                                statusKey === 'active' ? 'bg-sky-100 text-sky-700' :
                                statusKey === 'pending_execution' ? 'bg-amber-100 text-amber-700' :
                                statusKey === 'executed' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-rose-100 text-rose-700'
                              }`}>
                              {statusKey === 'active' && <Clock weight="bold" className="mr-1" />}
                              {statusKey === 'executed' && <CheckCircle weight="bold" className="mr-1" />}
                              {statusKey === 'rejected' && <XCircle weight="bold" className="mr-1" />}
                              {statusKey.replace('_', ' ')}
                            </span>
                          </div>
                          <h3 className="text-xl font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
                            {p.title || 'Untitled Proposal'}
                          </h3>
                        </div>

                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center w-full md:w-auto">
                          <span className="text-xl font-mono font-black text-slate-800">
                            {formatCurrency(Number(p.amount))}
                          </span>
                          
                          {statusKey === 'active' && (
                            <div className="text-right mt-2 md:mt-1">
                              <p className={`text-[10px] font-bold uppercase tracking-widest ${isExpired ? 'text-rose-500' : 'text-slate-400'}`}>
                                {isExpired ? 'Voting Closed' : `${Math.max(0, (deadline - Date.now() / 1000) / 3600).toFixed(1)}H Left`}
                              </p>
                            </div>
                          )}
                        </div>
                        
                        <div className="hidden md:flex items-center justify-center text-slate-300 group-hover:text-sky-500 group-hover:translate-x-1 transition-all">
                          <CaretRight weight="bold" size={20} />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </motion.div>

    </motion.div>
  );
}
