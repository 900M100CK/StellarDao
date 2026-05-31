import React from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import { Wallet, WarningCircle } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

export default function WalletConnect() {
  const { walletAddress, network, connect } = useAppContext();

  const truncateAddress = (address) => {
    const addrStr = typeof address === 'string' ? address : (address?.toString() || "");
    if (addrStr.length < 10) return addrStr;
    return `${addrStr.slice(0, 5)}...${addrStr.slice(-4)}`;
  };

  const isTestnet = network === 'TESTNET';

  const handleConnect = async () => {
    try {
      await connect();
      toast.success('Wallet connected successfully!');
    } catch (e) {
      toast.error('Connection failed: ' + e.message);
    }
  };

  return (
    <div className="flex items-center">
      {walletAddress ? (
        <div className="flex flex-col items-end">
          <motion.div 
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100/80 rounded-full border border-slate-200"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="font-mono text-xs font-bold text-slate-700 tracking-tight">
              {truncateAddress(walletAddress)}
            </span>
          </motion.div>
          {!isTestnet && (
            <div className="flex items-center space-x-1 mt-1 text-[10px] text-rose-500 font-bold uppercase tracking-wider">
              <WarningCircle weight="bold" />
              <span>Switch to Testnet</span>
            </div>
          )}
        </div>
      ) : (
        <motion.button 
          whileHover={{ scale: 0.98, y: -1 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleConnect}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-full shadow-lg shadow-slate-900/20"
        >
          <Wallet weight="bold" />
          <span>Connect</span>
        </motion.button>
      )}
    </div>
  );
}
