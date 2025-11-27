# VoteChain

A secure, transparent, and hybrid voting application that combines the security of the Ethereum blockchain with a user-friendly Web2 authentication layer. This system ensures that while user authentication is handled centrally, all votes are cast and tallied directly on the blockchain, making them immutable and tamper-proof.

## Features

* **Hybrid Architecture:** Web2 login (MySQL + JWT) for access control combined with Web3 (Ethereum) for voting.
* **Role-Based Access:** * **Admin Portal:** Create elections, define timeframes, and add candidates.
    * **Voter Portal:** View active elections and cast votes securely.
* **Immutable Voting:** Votes are recorded as transactions on the Ethereum blockchain via Smart Contracts.
* **Real-Time Tallying:** Live election results fetched directly from the blockchain.
* **Secure Authentication:** JSON Web Tokens (JWT) used for session management.
* **Double-Vote Prevention:** Smart contracts ensure each wallet address can vote only once per election.

## Tech Stack

### Blockchain Layer
* **Solidity:** Smart Contract development.
* **Truffle:** Development framework for compiling and deploying contracts.
* **Ganache:** Local blockchain for testing.
* **Web3.js:** Library for interacting with the blockchain from the frontend.

### Backend (Authentication & DB)
* **Python (FastAPI):** REST API for user login and JWT generation.
* **MySQL:** Relational database for storing user credentials and roles.

### Frontend & Server
* **Node.js (Express):** Web server to serve static files and handle routing.
* **HTML/CSS/JS:** Responsive user interface.
* **Metamask:** Browser extension for wallet management and transaction signing.

## Images

