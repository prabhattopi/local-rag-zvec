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
- **Local Storage:** `use-desktop-db` (IndexedDB Wrapper)

## 🛠️ Getting Started

### Prerequisites
Make sure you have Node.js 20+ installed.

### Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Create a `.env.local` file and add your API keys (optional, you can also configure this in the UI settings):
```env
NEXT_PUBLIC_GEMINI_API_KEY=your_key
NEXT_PUBLIC_OPENAI_API_KEY=your_key
# Add other keys as needed
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 How it Works (The Flow)

1. **Upload:** You upload a PDF, DOCX, or TXT file into a specific chat.
2. **Chunking & Embedding:** The file is instantly parsed, split into manageable chunks, and embedded into vectors using LangChain.
3. **Local Storage:** Those vectors are securely saved into a local Zvec database sitting right on your machine.
4. **Retrieval:** When you ask a question, the app searches your local Zvec database for the most relevant chunks.
5. **Generation:** The context is securely passed to your chosen LLM (Gemini, Claude, GPT) to generate a highly accurate, context-aware answer.

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.
