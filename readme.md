# Trivia Quest

![Example](./example.png)

## About

A trivia quiz web application.

## Getting Started

### Docker Build

To add new question categories or banks to the database, you only need to create/add a new JSONL to question_bank/ and run the build command. The files in the question bank are imported on docker build. 

If you need a template, just add any question from the WebApp and export it to get the format.

```bash
docker compose up -d --build
```

### Python Local Server

```bash
python -m http.server 8000
```
Then open your browser to http://localhost:8000/

Or use the helper scripts:

```powershell
# Start server (builds database automatically)
.\start-server.ps1

# Custom port
.\start-server.ps1 -Port 3000

# Custom title
.\start-server.ps1 -Title "My Trivia Game"

# Skip database rebuild (use existing)
.\start-server.ps1 -SkipDB
```

```bash
# Start server (builds database automatically)
./start-server.sh

# Custom port
./start-server.sh 3000

# Custom title
./start-server.sh --title "My Trivia Game"

# Skip database rebuild (use existing)
./start-server.sh --skip-db
```
Then open your browser to http://localhost:8080/

