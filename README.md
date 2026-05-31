# 🚀 Stellar Club Treasury (StellarDAO)
### Transparent On-Chain Financial Governance for Collective Organizations

![Stellar Club Treasury](https://img.shields.io/badge/Blockchain-Stellar-blue?style=for-the-badge&logo=stellar)
![Smart Contract](https://img.shields.io/badge/Soroban-Rust-orange?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-On--Chain_Only-blue?style=for-the-badge)
![License](https://img.shields.io/badge/Architecture-Decentralized-green?style=for-the-badge)

## 🌟 Vision
StellarDAO is a decentralized financial governance platform designed to eliminate fund abuse risks in student clubs and collective organizations. Every spending decision is recorded on-chain, requires a **super-majority consensus (>2/3)**, and is automatically executed by a Soroban Smart Contract.

**Architecture Note:** This version is **100% On-Chain**. We have removed all off-chain database dependencies (MongoDB) and intermediate APIs (Node.js backend) to ensure maximum transparency, data integrity, and decentralization.

---

## 📂 Project Directory Structure

The project is now streamlined into 2 main components:

1. **`contract/`**: The core logic written in Rust using Soroban SDK. It manages the entire lifecycle of proposals, voting, membership (Whitelist), and reputation.
2. **`frontend/`**: A React application (Vite + TailwindCSS) that communicates **directly** with the Stellar blockchain via RPC. It uses the Freighter wallet for secure transaction signing.

---

## ✨ Core Features

*   **Direct Deposit:** Members contribute funds directly to the Smart Contract.
*   **Decentralized Voting:** Fully transparent on-chain voting. Only proposals reaching >2/3 "Yes" votes are eligible for disbursement.
*   **Defensive Time-lock:** After approval, funds are subject to a time-lock (Demo: 10s | Prod: 24h) providing a window for member oversight before execution.
*   **Phased Budgeting:**
    *   **Low Budget:** Direct withdrawal after the time-lock.
    *   **High Budget:** Mandatory phased disbursement controlled by the Admin and Treasurer.
*   **On-chain Reputation:** Reward system that increments a proposer's reputation upon successful task completion, stored permanently on the ledger.
*   **Whitelist Membership:** Access control list managed by the Admin, ensuring only verified members can propose or vote.

---

## 🛠 Tech Stack

*   **Smart Contract:** Rust, Soroban SDK
*   **Frontend:** React 18, Vite, TailwindCSS
*   **Blockchain Interaction:** `@stellar/stellar-sdk` (v15+), `@stellar/freighter-api`
*   **Network:** Stellar Testnet

---

## 📋 High-Level Workflow

1.  **Proposal:** A member creates a spending proposal (Title, Description, Amount, Deadline) on-chain.
2.  **Voting:** Members sign "Approve" or "Reject" transactions via Freighter.
3.  **Finalization:** Once the deadline passes, anyone can trigger the result tally on the contract.
4.  **Disbursement:** After the defensive time-lock, the Treasurer executes the withdrawal, transferring funds directly from the contract to the proposer.
5.  **Audit & Reputation:** Admin confirms completion, granting the proposer a reputation point on the blockchain.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
*   [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli) installed.
*   [Freighter Wallet](https://www.freighter.app/) extension installed in your browser.
*   Node.js (v18+) and npm.

### 2. Installation
```bash
npm install
cd frontend && npm install
```

### 3. Deploy & Initialize (Automated)
We provide a script that handles contract compilation (release mode), deployment to Testnet, wallet generation, and contract initialization:
```bash
npm run setup-demo
```
*Note: This script will create a `demo/demo_wallets.json` file. Import these secret keys into Freighter to test different roles (Admin, Treasurer, Member).*

### 4. Run Frontend
```bash
npm run dev
```
Open `http://localhost:5173` to interact with your Treasury.

---

## ⚠️ Technical Highlights

*   **On-Chain State Sync:** Unlike traditional dApps that use a database cache, this app fetches all proposal details, vote counts, and member lists directly from the contract's persistent storage using `simulateTransaction` and `getLedgerEntries`.
*   **Stellar SDK v15 Integration:** Optimized for the latest SDK features, using the `Account` object for simulations to avoid deprecated XDR methods.
*   **No Centralized Point of Failure:** By removing the backend and worker, the system remains functional as long as the Stellar network is active.

---
*Developed for Hackathon 2026. Empowering communities through code.*
