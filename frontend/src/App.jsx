import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import Dashboard from './pages/Dashboard';
import Deposit from './pages/Deposit';
import CreateProposal from './pages/CreateProposal';
import ProposalDetail from './pages/ProposalDetail';
import WhitelistManagement from './pages/WhitelistManagement';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="deposit" element={<Deposit />} />
          <Route path="create-proposal" element={<CreateProposal />} />
          <Route path="proposal/:id" element={<ProposalDetail />} />
          <Route path="admin/whitelist" element={<WhitelistManagement />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
