# 🚀 Stellar Club Treasury (StellarDAO)
### Quản trị tài chính minh bạch cho các tổ chức tập thể trên Stellar/Soroban

![Stellar Club Treasury](https://img.shields.io/badge/Blockchain-Stellar-blue?style=for-the-badge&logo=stellar)
![Smart Contract](https://img.shields.io/badge/Soroban-Rust-orange?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Demo_Ready-green?style=for-the-badge)

## 🌟 Tầm nhìn (Vision)
Xây dựng một nền tảng quản trị tài chính phi tập trung, giúp các Câu lạc bộ (CLB) sinh viên và tổ chức tập thể loại bỏ rủi ro lạm dụng quỹ. Mọi quyết định chi tiêu đều phải thông qua sự **đồng thuận siêu đa số (>2/3)** và được thực thi tự động bởi Smart Contract trên mạng lưới Stellar.

---

## 📂 Cấu trúc dự án (Project Directory Structure)

Dự án bao gồm 4 thành phần chính được đẩy lên repository:

1. **`contract/`**: Smart Contract viết bằng Rust sử dụng Soroban SDK. Quản lý toàn bộ logic quỹ, đề xuất, biểu quyết, Whitelist, và phân phối phần thưởng uy tín.
2. **`frontend/`**: Ứng dụng React (Vite + TailwindCSS) tương tác với ví Freighter, cho phép người dùng nộp tiền, tạo đề xuất, biểu quyết, và quản trị Whitelist.
3. **`backend/`**: REST API server (Node.js/Express + MongoDB) đóng vai trò là cache/query layer giúp hiển thị dữ liệu nhanh chóng.
4. **`worker/`**: Daemon chạy ngầm đồng bộ hóa các sự kiện (Events) on-chain từ Stellar RPC về cơ sở dữ liệu MongoDB trong thời gian thực.

---

## ✨ Tính năng cốt lõi

*   **Nộp quỹ (Deposit):** Thành viên đóng góp quỹ trực tiếp vào Smart Contract.
*   **Biểu quyết (Voting):** Cơ chế bỏ phiếu on-chain minh bạch. Chỉ những đề xuất đạt >2/3 số phiếu thuận mới được phê duyệt.
*   **Thời gian khóa bảo vệ (Defensive Time-lock):** Sau khi được duyệt, tiền sẽ bị khóa trong một khoảng thời gian (Demo: 10s | Prod: 24h) để mọi thành viên có thể theo dõi trước khi thực thi rút tiền.
*   **Phân loại Ngân sách (Budget Logic):**
    *   **Low Budget (< 5M VNĐ / 200 USDC):** Rút tiền trực tiếp sau thời gian khóa.
    *   **High Budget (≥ 5M VNĐ / 200 USDC):** Bắt buộc chia nhỏ hạng mục và giải ngân theo từng đợt (Phased Withdrawal).
*   **Điểm uy tín (On-chain Reputation):** Tăng điểm uy tín cho người tạo đề xuất khi hoàn thành tốt nhiệm vụ, lưu trữ vĩnh viễn trên blockchain.
*   **Quản lý Whitelist (Whitelist Management):** Chỉ các thành viên nằm trong Whitelist mới có quyền nộp quỹ, tạo đề xuất, và bỏ phiếu.

---

## 🛠 Công nghệ sử dụng

*   **Smart Contract:** Rust, Soroban SDK
*   **Frontend:** React, Vite, TailwindCSS, `@stellar/freighter-api`, `@stellar/stellar-sdk`
*   **Backend & Worker:** Node.js, Express, MongoDB Atlas, `@stellar/stellar-sdk`
*   **Mạng thử nghiệm:** Stellar Testnet

---

## 📋 Kịch bản Demo (Scenario)

1.  **Khởi tạo:** Admin nộp 10 USDC vào quỹ CLB.
2.  **Đề xuất:** Một thành viên tạo đề xuất rút 3 USDC để mua văn phòng phẩm (Low budget).
3.  **Biểu quyết:** Các thành viên khác thực hiện bỏ phiếu "Đồng ý" qua ví Freighter.
4.  **Chốt kết quả:** Khi hết thời hạn, Admin bấm "Chốt kết quả" -> Trạng thái chuyển sang `Pending Execution`.
5.  **Thời gian khóa:** Đồng hồ đếm ngược 10 giây (Time-lock) bắt đầu chạy.
6.  **Thực thi:** Sau 10 giây, Thủ quỹ bấm "Thực thi rút tiền" -> Tiền được chuyển tự động từ Contract về ví người đề xuất.
7.  **Uy tín:** Admin xác nhận công việc hoàn thành -> Người đề xuất được cộng +1 điểm uy tín on-chain.

---

## 🚀 Hướng dẫn cài đặt nhanh

### 1. Cài đặt dependencies
Cài đặt packages cho tất cả các thành phần:
```bash
npm install
cd backend && npm install
cd ../worker && npm install
cd ../frontend && npm install
```

### 2. Setup môi trường Demo
Khởi tạo và deploy Smart Contract lên Testnet, tạo tài khoản demo và thiết lập các biến môi trường:
```bash
node scripts/setup-demo.js
```
*(Lưu ý: Yêu cầu kết nối mạng ổn định để thực hiện deploy lên Stellar Testnet).*

### 3. Chạy hệ thống (mở 3 terminal riêng biệt)
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

## ⚠️ Lưu ý kỹ thuật & Hotfixes (Technical Notes)

*   **Stellar SDK v15 Hotfix:** 
    Trong phiên bản `@stellar/stellar-sdk` mới nhất (v15+), hàm `toDefaultEd25519Xdr()` trong đối tượng `Address` đã bị loại bỏ. Hệ thống đã được nâng cấp sử dụng:
    ```javascript
    new Account(address, "0")
    ```
    để khởi tạo tài khoản ảo phục vụ cho việc giả lập giao dịch (`simulateTransaction`) mà không cần thông qua XDR cũ.
*   **Bảo mật Private Key:**
    Thư mục `demo/` chứa file `demo_wallets.json` lưu giữ Private Key của các tài khoản thử nghiệm đã được loại bỏ hoàn toàn trong `.gitignore` để tránh rò rỉ mã khóa lên GitHub.

---
*Dự án phát triển phục vụ Hackathon 2026. Một sản phẩm hướng tới sự minh bạch và tự động hóa trong quản lý tài chính cộng đồng.*
