# Arc AI Backend

Backend service for **Arc AI Demo** — handles AI chat, deposit monitoring, and credit management on Arc Network.

## ✨ Features

- Listens for USDC deposits on Arc Testnet
- Automatically grants credits after deposit (one-time per wallet)
- AI chat API powered by Minimax M2.7 (via NVIDIA)
- SQLite database for users, deposits, and chat history
- Supports quick transfer commands from frontend

## 🛠️ Tech Stack

- **Framework**: Express.js
- **Database**: SQLite
- **Blockchain**: Viem + Arc Testnet
- **AI**: NVIDIA API + Minimax M2.7

## 🚀 How to Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/zhenweisi/arc-ai-backend.git

# 2. Enter the folder
cd arc-ai-backend

# 3. Install dependencies
npm install
```
## Create environment file:
Copy example (if available) or create .env manually

## Edit .env file and add your keys:
PRIVATE_KEY=your_private_key_here
NVIDIA_API_KEY=your_nvidia_api_key_here

## Start the server:

```bash
node server.js
```
## Backend will run on: http://localhost:3001

##  Related Project

Frontend: https://github.com/zhenweisi/arc-ai-demo

 Made with  using Arc Network








