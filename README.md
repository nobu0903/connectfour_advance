# 🎮 Web ConnectFour

A modern, interactive Connect Four game built for browsers — with local play, AI opponents, and real-time online matchmaking.

<!-- ここにスクリーンショットや動作しているGIF画像をドロップして挿入 -->

**Live Demo:** [https://web-connectfour.onrender.com](https://web-connectfour.onrender.com) *(coming soon)*

---

## 🚀 Features

- **Interactive UI** — Smooth disc-drop animations, win celebrations, and a polished game board built with custom assets.
- **Three Game Modes**
  - **Online Match** — Real-time multiplayer via WebSocket matchmaking
  - **Player vs Player** — Local two-player on the same device
  - **Player vs Computer** — Three difficulty levels powered by minimax with alpha-beta pruning
- **Accounts & Authentication** — Sign up / log in with JWT-secured sessions and bcrypt-hashed passwords.
- **Elo Rating System** — Ratings update after every online and computer match; leaderboard page ranks players.
- **Avatar Collection** — Unlock new avatars as your rating grows, with a collection screen and unlock celebrations.
- **Responsive Design** — Playable on desktop and mobile with a layout that adapts to screen size.

---

## 🛠️ Tech Stack

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white)

| Layer | Technologies |
|---|---|
| **Frontend** | Vanilla JavaScript (ES modules), HTML5, CSS3 |
| **Backend** | Node.js, Express |
| **Real-time** | WebSocket (`ws`) for matchmaking and live moves |
| **Database** | MongoDB + Mongoose |
| **Auth & Security** | JWT, bcryptjs, Helmet, CORS, express-rate-limit |

---

## 🧠 What I Learned & Challenges

- **Game Logic** — Implemented win-condition checking across vertical, horizontal, and both diagonal directions, and kept the board state consistent across local, AI, and online modes.
- **AI Opponent** — Built a minimax search with alpha-beta pruning for the computer player, with three depth levels so difficulty scales naturally.
- **State Management** — Centralized game state (current player, board array, mode, winner) in a dedicated module so UI updates and move validation stay in sync without race conditions.
- **Real-time Online Play** — Designed a WebSocket server with matchmaking queues, room management, and JWT-authenticated connections so two players can find and play each other reliably.
- **Rating & Progression** — Applied an Elo-style rating formula (with K-factor tuning for human vs. computer matches) and tied avatar unlocks to rating tiers to give players a sense of progression.

---

## 💻 Run Locally

```bash
git clone https://github.com/nobu0903/connectfour_advance.git
cd connectfour_advance/Web_ConnectFour
npm install
```

Create a `.env` file in `Web_ConnectFour/`:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
PORT=3000
```

Start the server:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** Online play, accounts, and the leaderboard require MongoDB. Local PvP and vs. Computer modes work without logging in.

---

## Project Structure

```
connectfour_advance/
├── Web_ConnectFour/       # Main application
│   ├── public/            # Frontend (HTML, CSS, JS, images)
│   ├── server.js          # Express + WebSocket server
│   ├── models/            # Mongoose user model
│   └── utils/             # Rating logic, server-side AI helper
└── errors/                # Bug tracking notes (development)
```
