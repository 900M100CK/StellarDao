import React, { createContext, useContext, useState, useEffect } from 'react';
import { useFreighter } from '../hooks/useFreighter';
import { normalizePublicKey } from '../utils/stellar';
import { getCachedAppConfig } from '../config/appConfig';
import { contractService } from '../services/contractService';

const AppContext = createContext();

function getApiUrl() {
  return getCachedAppConfig()?.apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
}

function getRoleAddresses() {
  const cfg = getCachedAppConfig();
  return {
    admin: cfg?.adminAddress || import.meta.env.VITE_ADMIN_ADDRESS,
    treasurer: cfg?.treasurerAddress || import.meta.env.VITE_TREASURER_ADDRESS,
  };
}

export function AppProvider({ children }) {
  const { address, network, isExtensionAvailable, connect, signTransaction, getNetwork } = useFreighter();
  
  const [walletAddress, setWalletAddress] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTreasurer, setIsTreasurer] = useState(false);
  const [userReputation, setUserReputation] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const addrStr = normalizePublicKey(address);
    if (addrStr) {
      setWalletAddress(addrStr);
      fetchUserData(addrStr);
    } else {
      setWalletAddress(null);
    }
  }, [address]);

  const fetchUserData = async (pubKey) => {
    try {
      setLoading(true);
      const addrStr = normalizePublicKey(pubKey);
      if (!addrStr) return;

      const { admin, treasurer } = getRoleAddresses();
      
      try {
        const reputation = await contractService.query.getMemberReputation(addrStr);
        setUserReputation(Number(reputation) || 0);
      } catch (err) {
        console.warn('Could not fetch reputation, user might not be a member yet', err);
        setUserReputation(0);
      }

      setIsAdmin(addrStr === admin);
      setIsTreasurer(addrStr === treasurer || addrStr === admin);
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      await connect();
      // useEffect will automatically call fetchUserData when the address from the hook changes
    } catch (e) {
      console.error("Connection failed:", e);
      throw e; // Let the component handle UI feedback
    }
  };

  return (
    <AppContext.Provider value={{
      walletAddress,
      network,
      isAdmin,
      isTreasurer,
      userReputation,
      loading,
      isExtensionAvailable,
      connect: handleConnect,
      signTransaction,
      getNetwork
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
