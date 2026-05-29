import React from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';

export default function WalletConnect() {
  const { walletAddress, network, connect } = useAppContext();

  const truncateAddress = (address) => {
    // Ensure address is a string before slicing
    const addrStr = typeof address === 'string' ? address : (address?.toString() || "");
    
    if (addrStr.length < 10) return addrStr;
    return `${addrStr.slice(0, 6)}...${addrStr.slice(-4)}`;
  };

  const isTestnet = network === 'TESTNET';

  const handleConnect = async () => {
    try {
      await connect();
      toast.success('Wallet connected successfully!');
    } catch (e) {
      toast.error('Wallet connection failed: ' + e.message);
    }
  };

  return (
    <div className="flex items-center space-x-4">
      {walletAddress ? (
        <div className="flex flex-col items-end">
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium text-sm">
              {truncateAddress(walletAddress)}
            </span>
          </div>
          {!isTestnet && (
            <span className="text-xs text-red-500 font-bold mt-1">
              Please switch to Stellar Testnet
            </span>
          )}
        </div>
      ) : (
        <button 
          onClick={handleConnect}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition"
        >
          Connect Freighter
        </button>
      )}
    </div>
  );
}
