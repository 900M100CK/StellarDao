import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import WalletConnect from './components/WalletConnect';
import { useAppContext } from './context/AppContext';
import { useFreighter } from './hooks/useFreighter';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  SquaresFour, 
  ArrowDownLeft, 
  PlusCircle, 
  ShieldCheck, 
  WarningCircle, 
  DownloadSimple 
} from '@phosphor-icons/react';

const NavLink = ({ to, icon: Icon, children }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link 
      to={to} 
      className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300
        ${isActive 
          ? 'bg-slate-900 text-white shadow-md' 
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
    >
      <Icon weight={isActive ? "bold" : "regular"} className="text-lg" />
      <span>{children}</span>
    </Link>
  );
};

export default function Layout() {
  const { walletAddress, isExtensionAvailable, isAdmin } = useAppContext();

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-slate-50">
      <Toaster 
        position="bottom-right" 
        toastOptions={{
          className: 'liquid-glass text-sm font-bold text-slate-800 rounded-2xl',
          duration: 4000,
        }} 
      />
      
      {/* Floating Dynamic Island Navbar */}
      <header className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="liquid-glass rounded-full px-2 py-2 flex items-center shadow-float pointer-events-auto max-w-full overflow-x-auto no-scrollbar"
        >
          <Link to="/" className="flex items-center pl-4 pr-6 space-x-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-500 shadow-sm flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
            <span className="font-bold text-slate-900 tracking-tight">StellarDAO</span>
            <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 text-[9px] font-black rounded uppercase tracking-widest ml-1">Demo</span>
          </Link>

          <nav className="hidden md:flex items-center space-x-1 border-l border-slate-200/50 pl-2 mr-6">
            <NavLink to="/" icon={SquaresFour}>Overview</NavLink>
            {walletAddress && (
              <>
                <NavLink to="/deposit" icon={ArrowDownLeft}>Deposit</NavLink>
                <NavLink to="/create-proposal" icon={PlusCircle}>Propose</NavLink>
                {isAdmin && (
                  <NavLink to="/admin/whitelist" icon={ShieldCheck}>Whitelist</NavLink>
                )}
              </>
            )}
          </nav>
          
          <div className="pl-2 border-l border-slate-200/50">
            <WalletConnect />
          </div>
        </motion.div>
      </header>

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 pt-32 pb-16">
        <AnimatePresence mode="wait">
          {!isExtensionAvailable && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <div className="bento-card border-rose-200 bg-rose-50/50 flex items-center p-6 space-x-4">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                  <DownloadSimple size={24} weight="bold" />
                </div>
                <div>
                  <h3 className="font-bold text-rose-900 text-lg">Freighter Required</h3>
                  <p className="text-rose-700 text-sm mt-1 max-w-2xl">
                    You need the Freighter browser extension to securely interact with the Stellar blockchain. 
                    <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className="ml-2 font-bold underline hover:text-rose-800 transition">
                      Download Extension &rarr;
                    </a>
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {isExtensionAvailable && !walletAddress && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <div className="bento-card border-amber-200 bg-amber-50/50 flex items-center p-6 space-x-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <WarningCircle size={24} weight="bold" />
                </div>
                <div>
                  <h3 className="font-bold text-amber-900 text-lg">Wallet Not Connected</h3>
                  <p className="text-amber-700 text-sm mt-1 max-w-2xl">
                    Please connect your Freighter wallet to view your reputation, vote on proposals, and manage funds.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="relative z-10">
          <Outlet />
        </div>
      </main>

      <footer className="w-full py-8 text-center text-xs font-medium text-slate-400">
        <p>Stellar Club Treasury &middot; Built on Soroban</p>
      </footer>
    </div>
  );
}
