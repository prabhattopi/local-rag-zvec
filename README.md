# Zvec Local RAG Workspace

A beautiful, fully local, and privacy-first Retrieval-Augmented Generation (RAG) application. Chat with your documents securely using your favorite AI models while keeping all your vector data stored entirely on your local machine using the lightning-fast Zvec database.

## 🌟 Features

- **100% Local Vector Database:** Your documents are embedded and stored locally using the open-source **Zvec** vector database. No third-party cloud vector storage is used, guaranteeing absolute privacy for your sensitive documents.
- **Multi-Model Support:** Seamlessly switch between the best LLMs on the market:
  - Google Gemini
  - OpenAI (GPT-4o, etc.)
  - Anthropic (Claude 3.5 Sonnet)
  - Groq & Together AI (Open-source models)
- **Per-Chat Context Isolation:** Just like ChatGPT, your uploaded files are strictly isolated to the specific chat you uploaded them in. 
- **Glassmorphic UI:** A stunning, modern, dark-mode interface built with TailwindCSS and Framer Motion for smooth micro-animations.
- **Local Chat History:** All your conversations are saved directly to a physical folder on your computer as a JSON file using the File System Access API.

## 🚀 Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Styling:** TailwindCSS v4 + Framer Motion
- **Vector Database:** `@zvec/zvec` (In-Memory / Local Disk)
- **RAG Orchestration:** LangGraph + LangChain
- **Document Parsing:** pdf-parse, mammoth (for docx)
- **Local Storage:** `use-desktop-db` (File System Access API)

## 🛠️ Getting Started

### Prerequisites
- **Node.js 20+** installed on your system.
- A modern web browser (Chrome/Edge recommended for File System Access API).

### Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Create a `.env.local` file and add your API keys:
```env
GEMINI_API_KEY=your_key
OPENAI_API_KEY=your_key
# Add other keys as needed
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🖥️ Usage Guide

1. **Connect Your Folder:** When you first open the app, click the **"Connect Folder"** button. This will ask you to select a folder on your computer where all your chat history will be securely saved as a JSON file.
2. **Upload Documents:** Inside any chat, click the **`+`** button next to the input box to upload your PDFs, DOCX, or TXT files. They will be embedded locally.
3. **Start Chatting:** Ask questions about your documents! The AI will read the context from your local Zvec database and give you precise answers.
4. **Custom Settings:** Click the gear icon (⚙️) to open settings. Here you can seamlessly switch between AI providers (Gemini, OpenAI, Mistral), enter your own API keys, or reconnect to a different local folder.

## 📖 How it Works (The Flow)

1. **Upload:** You upload a file into a specific chat.
2. **Chunking & Embedding:** The file is instantly parsed, split into manageable chunks, and embedded into vectors using LangChain.
3. **Local Storage:** Those vectors are securely saved into a local Zvec database sitting right on your machine.
4. **Retrieval:** When you ask a question, the app searches your local Zvec database for the most relevant chunks.
5. **Generation:** The context is securely passed to your chosen LLM to generate a highly accurate, context-aware answer.

## 💖 Support the Project
If you find this project useful and want to support its continuous development, please consider sponsoring me!

**[Sponsor Prabhat on GitHub](https://github.com/sponsors/prabhattopi)** ☕

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.
