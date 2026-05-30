# 🚀 Stellar Club Treasury (StellarDAO)
### Transparent Financial Governance for Collective Organizations on Stellar/Soroban

![Stellar Club Treasury](https://img.shields.io/badge/Blockchain-Stellar-blue?style=for-the-badge&logo=stellar)
![Smart Contract](https://img.shields.io/badge/Soroban-Rust-orange?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Demo_Ready-green?style=for-the-badge)

## 🌟 Vision
Build a decentralized financial governance platform that helps student clubs and collective organizations eliminate fund abuse risks. Every spending decision must pass through a **super-majority consensus (>2/3)** and is automatically executed by a Smart Contract on the Stellar network.

---

## 📂 Project Directory Structure

The project consists of 4 main components:

1. **`contract/`**: Smart Contract written in Rust using Soroban SDK. Manages all fund logic, proposals, voting, Whitelist, and reputation reward distribution.
2. **`frontend/`**: React application (Vite + TailwindCSS) interacting with Freighter wallet, allowing users to deposit, create proposals, vote, and manage the Whitelist.
3. **`backend/`**: REST API server (Node.js/Express + MongoDB) acting as a cache/query layer for fast data display.
4. **`worker/`**: Background daemon synchronizing on-chain events from Stellar RPC to MongoDB database in real-time.

---

## ✨ Core Features

*   **Deposit:** Members contribute funds directly to the Smart Contract.
*   **Voting:** Transparent on-chain voting mechanism. Only proposals reaching >2/3 "Yes" votes are approved.
*   **Defensive Time-lock:** After approval, funds are locked for a period (Demo: 10s | Prod: 24h) for all members to monitor before withdrawal execution.
*   **Budget Logic:**
    *   **Low Budget (< 200 USDC):** Direct withdrawal after the time-lock period.
    *   **High Budget (≥ 200 USDC):** Mandatory phased disbursement (Phased Withdrawal).
*   **On-chain Reputation:** Increases reputation points for proposal creators upon successful completion of tasks, stored permanently on the blockchain.
*   **Whitelist Management:** Only members in the Whitelist have the rights to deposit, create proposals, and vote.

---

## 🛠 Tech Stack

*   **Smart Contract:** Rust, Soroban SDK
*   **Frontend:** React, Vite, TailwindCSS, `@stellar/freighter-api`, `@stellar/stellar-sdk`
*   **Backend & Worker:** Node.js, Express, MongoDB Atlas, `@stellar/stellar-sdk`
*   **Network:** Stellar Testnet

---

## 📋 Demo Scenario

1.  **Initialize:** Admin deposits 10 USDC into the club treasury.
2.  **Proposal:** A member creates a proposal to withdraw 3 USDC for stationery (Low budget).
3.  **Voting:** Other members cast "Yes" votes via Freighter wallet.
4.  **Finalize Results:** After the deadline, Admin clicks "Finalize Results" -> Status changes to `Pending Execution`.
5.  **Time-lock:** A 10-second countdown (Time-lock) begins.
6.  **Execution:** After 10 seconds, Treasurer clicks "Execute Withdrawal" -> Funds are automatically transferred from the Contract to the proposer's wallet.
7.  **Reputation:** Admin confirms task completion -> Proposer receives +1 on-chain reputation point.

---

## 🚀 Quick Installation Guide

### 1. Install dependencies
Install packages for all components:
```bash
npm install
cd backend && npm install
cd ../worker && npm install
cd ../frontend && npm install
```

### 2. Demo Environment Setup
Initialize and deploy the Smart Contract to Testnet, create demo accounts, and set environment variables:
```bash
node scripts/setup-demo.js
```
*(Note: Requires a stable internet connection to deploy to Stellar Testnet).*

### 3. Run the system (Open 3 separate terminals)
*   **Terminal 1 (Backend):**
    ```bash
    cd backend && npm start
    ```
*   **Terminal 2 (Worker):**
    ```bash
    cd worker && npm start
    ```
*   **Terminal 3 (Frontend):**
    ```bash
    cd frontend && npm run dev
    ```

---

## ⚠️ Technical Notes & Hotfixes

*   **Stellar SDK v15 Hotfix:** 
    In the latest `@stellar/stellar-sdk` (v15+), the `toDefaultEd25519Xdr()` function in the `Address` object has been removed. The system has been upgraded to use:
    ```javascript
    new Account(address, "0")
    ```
    to initialize virtual accounts for transaction simulation (`simulateTransaction`) without needing the old XDR.
*   **Private Key Security:**
    The `demo/` directory contains the `demo_wallets.json` file which stores Private Keys for test accounts. This file has been completely excluded via `.gitignore` to prevent key leaks to GitHub.

---
*Project developed for Hackathon 2026. A product aimed at transparency and automation in community financial management.*
