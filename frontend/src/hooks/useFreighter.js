import { useState, useCallback, useEffect, useRef } from 'react';
import {
  isConnected as checkIsConnected,
  isAllowed,
  setAllowed,
  getAddress,
  signTransaction as freighterSignTransaction,
  getNetworkDetails,
  WatchWalletChanges,
} from '@stellar/freighter-api';
import { normalizePublicKey, getNetworkPassphrase } from '../utils/stellar';

export function useFreighter() {
  const [address, setAddress] = useState(null);
  const [network, setNetwork] = useState(null);
  const [error, setError] = useState(null);
  const [isExtensionAvailable, setIsExtensionAvailable] = useState(true); // Default true to avoid flash
  const watcherRef = useRef(null);

  const refreshNetwork = useCallback(async () => {
    try {
      const details = await getNetworkDetails();
      setNetwork(details);
      return details;
    } catch {
      return null;
    }
  }, []);

  // Update extension availability on mount and listen for account changes
  useEffect(() => {
    (async () => {
      const available = await checkIsConnected();
      setIsExtensionAvailable(!!available);
      
      if (available) {
        // Auto-connect if allowed
        try {
          if (await isAllowed()) {
            const res = await getAddress();
            // getAddress() returns { address: string }
            const publicKey = normalizePublicKey(res?.address || res);
            if (publicKey) {
              setAddress(publicKey);
              await refreshNetwork();
            }
          }
        } catch (e) {
          // ignore auto-connect errors
        }

        // Watch for account/network changes using WatchWalletChanges class
        try {
          const watcher = new WatchWalletChanges(5000);
          watcherRef.current = watcher;
          watcher.watch(({ address: newAddr, networkPassphrase: newPassphrase }) => {
            const publicKey = normalizePublicKey(newAddr);
            if (publicKey) {
              setAddress(publicKey);
              refreshNetwork();
            } else {
              setAddress(null);
            }
          });
        } catch (e) {
          console.warn("Failed to watch account changes:", e);
        }
      }
    })();

    return () => {
      if (watcherRef.current) {
        watcherRef.current.stop();
        watcherRef.current = null;
      }
    };
  }, [refreshNetwork]);

  const connect = useCallback(async () => {
    try {
      const connected = await checkIsConnected();
      setIsExtensionAvailable(!!connected);
      if (!connected) {
        throw new Error('Freighter extension not found. Please install it.');
      }

      // Always call setAllowed() if getAddress() returns empty, or try calling it first.
      let allowed = await isAllowed();
      if (!allowed) {
        await setAllowed();
        allowed = await isAllowed();
      }

      let res = await getAddress(); 
      console.log("Freighter raw address result:", res);
      
      // getAddress() returns { address: string } — extract the string
      let rawAddr = res?.address !== undefined ? res.address : res;

      // If allowed but still cannot get address, the wallet might be locked
      if (!rawAddr || rawAddr === '') {
        await setAllowed();
        res = await getAddress();
        rawAddr = res?.address !== undefined ? res.address : res;
      }

      const publicKey = normalizePublicKey(rawAddr);
      console.log("Freighter normalized public key:", publicKey);
      
      if (!publicKey) {
        if (rawAddr === '') {
          throw new Error('Your Freighter wallet is locked or not logged in. Please click the Freighter extension icon in your browser toolbar, enter your password to unlock the wallet, and try again.');
        }
        throw new Error('Failed to retrieve wallet address from Freighter. Please ensure you are logged in and have selected an account.');
      }

      setAddress(publicKey);
      await refreshNetwork();
      return publicKey;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [refreshNetwork]);

  const signTransaction = useCallback(async (txXdr, networkPassphrase) => {
    try {
      const passphrase = networkPassphrase || getNetworkPassphrase();
      // Freighter v3.1 signTransaction(xdr, opts) returns { signedTxXdr, signerAddress }
      const res = await freighterSignTransaction(txXdr, { networkPassphrase: passphrase });

      console.log("Freighter signTransaction raw result:", res);

      // Check for Freighter-reported error
      if (res?.error) {
        throw new Error(`Freighter rejected signing: ${res.error.message || res.error}`);
      }

      // Extract signedTxXdr (v3.1.0 field name)
      const signedXdr = typeof res === 'string'
        ? res
        : (res?.signedTxXdr || res?.signedTransaction || res?.signedTx);

      if (!signedXdr) {
        throw new Error('Freighter did not return a signed transaction. Please try again or check your wallet.');
      }
      return signedXdr;
    } catch (err) {
      console.error('Freighter signTransaction failed:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const getNetwork = useCallback(async () => refreshNetwork(), [refreshNetwork]);

  return {
    address,
    network,
    error,
    isExtensionAvailable,
    connect,
    signTransaction,
    getNetwork,
  };
}
