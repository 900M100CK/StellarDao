import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import WalletConnect from './components/WalletConnect';
import { useAppContext } from './context/AppContext';
import { useFreighter } from './hooks/useFreighter';

export default function Layout() {
  const { walletAddress, isExtensionAvailable, isAdmin } = useAppContext();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toaster position="top-right" />
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4 md:space-x-8">
              <Link to="/" className="flex-shrink-0 flex items-center">
                <span className="font-bold text-lg md:text-xl text-blue-600">StellarDAO</span>
                <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-black rounded uppercase tracking-widest border border-yellow-200">Demo</span>
              </Link>
              <nav className="flex space-x-1 md:space-x-4 overflow-x-auto">
                <Link to="/" className="text-gray-700 hover:text-blue-600 px-2 md:px-3 py-2 rounded-md text-xs md:text-sm font-medium">Dashboard</Link>
                {walletAddress && (
                  <>
                    <Link to="/deposit" className="text-gray-700 hover:text-blue-600 px-2 md:px-3 py-2 rounded-md text-xs md:text-sm font-medium whitespace-nowrap">Deposit</Link>
                    <Link to="/create-proposal" className="text-gray-700 hover:text-blue-600 px-2 md:px-3 py-2 rounded-md text-xs md:text-sm font-medium whitespace-nowrap">Create Proposal</Link>
                    {isAdmin && (
                      <Link to="/admin/whitelist" className="text-purple-700 hover:text-purple-600 px-2 md:px-3 py-2 rounded-md text-xs md:text-sm font-bold whitespace-nowrap">Whitelist Admin</Link>
                    )}
                  </>
                )}
              </nav>
            </div>
            <div className="flex items-center ml-2">
              <WalletConnect />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isExtensionAvailable ? (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  Freighter Extension is required to use this application.{' '}
                  <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className="font-bold underline">
                    Download here
                  </a>
                </p>
              </div>
            </div>
          </div>
        ) : !walletAddress ? (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Please connect your Freighter wallet to use all features of the system.
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <Outlet />
      </main>

      <footer className="bg-white mt-auto py-6 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          © 2026 Stellar Club Treasury (Hackathon Demo).
        </div>
      </footer>
    </div>
  );
}
