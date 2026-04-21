# dolphin_gpt

A private, ChatGPT-style assistant that runs **entirely on your own computer**. No cloud, no subscription, no data leaving your machine.

## What it does

- Chat with an AI model running locally on your computer
- Remembers facts about you across conversations (you control what it remembers)
- Save and reopen past chats
- Optional web search to answer questions about current events
- Drop in PDFs or text files and ask questions about them

## Before you start

You need to install three free programs. Each takes about two minutes.

### 1. Ollama — the engine that runs the AI

Download and install from **https://ollama.com/download** (Mac, Windows, and Linux are all supported). After installing, **open the Ollama app** — it runs quietly in the background (look for the icon in your menu bar on Mac or system tray on Windows).

### 2. Python (version 3.10 or newer)

- **Mac:** already installed. To confirm, open the **Terminal** app and type `python3 --version`. If you see a version number, you're done.
- **Windows:** download from **https://www.python.org/downloads/**. During install, **tick the box that says "Add Python to PATH"**.
- **Linux:** already installed on most distributions.

### 3. Node.js (version 20 or newer)

Download the **LTS** version from **https://nodejs.org**. Run the installer with default options.

## First-time setup

Open a terminal (on Mac: the **Terminal** app; on Windows: **Command Prompt** or **PowerShell**). Copy and paste each block one at a time.

### Step 1 — Download this app

```bash
git clone https://github.com/AljuCodes/dolphin_gpt.git
cd dolphin_gpt
```

### Step 2 — Install the backend

**Mac / Linux:**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

**Windows:**

```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### Step 3 — Install the frontend

```bash
cd frontend
npm install
cd ..
```

That's it. Setup is done. The first time you launch the app, it will download the AI model (about 3 GB) automatically — you'll see a progress bar.

## Running the app

### Mac / Linux

Double-click **`start.command`** in Finder, or from a terminal:

```bash
./start.command
```

### Windows

Double-click **`start.bat`**.

Either way, your browser should open **http://localhost:3000** after a few seconds. If it doesn't open on its own, go there manually.

**First launch only:** the launcher notices the AI model isn't on your machine and downloads it for you (about 3 GB). You'll see a progress bar in the launcher window. This only happens once — future launches start in seconds. If the download is interrupted, just run the launcher again; it resumes where it left off.

**To stop the app:** close the terminal window (Mac/Linux) or close both command windows (Windows).

## Everyday use

After the first-time setup, running the app is just: double-click the start script. That's the whole process.

## Troubleshooting

**"ollama: command not found" or the app won't respond**
Make sure Ollama is running. Open the Ollama app — you should see its icon in your menu bar (Mac) or system tray (Windows).

**"Port 3000 is already in use" or "Port 8000 is already in use"**
Another program is using the port. The simplest fix: restart your computer. Or find what's using it and close it.

**The first message takes 30 seconds to start responding**
Normal on first run — the model has to load into memory. Subsequent messages are fast.

**Web search doesn't return results**
The search uses DuckDuckGo, which occasionally rate-limits. Wait a minute and try again.

**Everything is slow**
The speed depends on your computer's RAM and CPU. The model needs about 4 GB of free RAM. If you have 8 GB total, close other apps while using this.

**I want to use a different model**
Any model from https://ollama.com/library will work. Create a file called `.env` inside the `backend` folder and put: `OLLAMA_MODEL=<model-name>`. Next time you launch, the app will download it automatically if it isn't already present.

**The model download failed or got stuck**
Cancel with Ctrl+C and run the launcher again — Ollama resumes partial downloads. If it keeps failing, check your internet connection or free up disk space (models need several GB).

## Your data

Everything stays on your computer. Chat history and memories are stored as plain JSON files in `backend/data/`. Delete that folder any time to wipe everything.

## License

MIT.
