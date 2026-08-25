'use server';

import { getZvecCollection } from '@/lib/zvec';
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as mammoth from 'mammoth';

export type Provider = 
  | 'gemini' 
  | 'openai' 
  | 'anthropic' 
  | 'groq' 
  | 'together' 
  | 'deepseek' 
  | 'fireworks' 
  | 'perplexity' 
  | 'cohere' 
  | 'mistral';

type Message = { id: string; role: 'user' | 'assistant'; content: string };

const GraphAnnotation = Annotation.Root({
  question: Annotation<string>(),
  chatHistory: Annotation<Message[]>(),
  context: Annotation<string>(),
  answer: Annotation<string>(),
});

// Utility to initialize embeddings
const getEmbeddings = (provider: Provider, apiKey: string) => {
  if (provider === 'openai') {
    return new OpenAIEmbeddings({ apiKey });
  }
  // Default to Google for everything else as embedding standard for this app
  return new GoogleGenerativeAIEmbeddings({
    apiKey: apiKey || process.env.GEMINI_API_KEY,
    model: "gemini-embedding-2", // latest gemini embedding model
  });
};

const getModel = (provider: Provider, apiKey: string, modelName?: string) => {
  if (provider === 'openai') {
    return new ChatOpenAI({ modelName: modelName || 'gpt-4o-mini', apiKey, temperature: 0 });
  } else if (provider === 'anthropic') {
    return new ChatAnthropic({ model: modelName || 'claude-3-haiku-20240307', apiKey, temperature: 0 });
  } else if (provider === 'groq') {
    return new ChatOpenAI({ 
      modelName: modelName || 'llama3-8b-8192', 
      apiKey, 
      configuration: { baseURL: 'https://api.groq.com/openai/v1' }, 
      temperature: 0 
    });
  } else if (provider === 'together') {
    return new ChatOpenAI({ 
      modelName: modelName || 'meta-llama/Llama-3-8b-chat-hf', 
      apiKey, 
      configuration: { baseURL: 'https://api.together.xyz/v1' }, 
      temperature: 0 
    });
  } else if (provider === 'deepseek') {
    return new ChatOpenAI({ 
      modelName: modelName || 'deepseek-chat', 
      apiKey, 
      configuration: { baseURL: 'https://api.deepseek.com/v1' }, 
      temperature: 0 
    });
  } else if (provider === 'fireworks') {
    return new ChatOpenAI({ 
      modelName: modelName || 'accounts/fireworks/models/llama-v3-8b-instruct', 
      apiKey, 
      configuration: { baseURL: 'https://api.fireworks.ai/inference/v1' }, 
      temperature: 0 
    });
  } else if (provider === 'perplexity') {
    return new ChatOpenAI({ 
      modelName: modelName || 'llama-3-sonar-small-32k-chat', 
      apiKey, 
      configuration: { baseURL: 'https://api.perplexity.ai' }, 
      temperature: 0 
    });
  }
  
  // Default to Gemini
  return new ChatGoogleGenerativeAI({
    model: modelName || "gemini-2.5-flash",
    apiKey: apiKey || process.env.GEMINI_API_KEY,
    temperature: 0,
  });
};

// ----------------------------------------------------------------------
// 1. Ingest Document Action
// ----------------------------------------------------------------------
export async function ingestDocument(formData: FormData, provider: Provider, apiKey: string, sessionId: string) {
  try {
    const file = formData.get('file') as File | null;
    if (!file) return { success: false, error: 'No file uploaded' };

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (file.name.endsWith('.pdf')) {
      // pdf-parse v2 uses a class-based approach
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      text = parsed.text;
    } else if (file.name.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString('utf-8'); // For txt and md
    }

    if (!text.trim()) return { success: false, error: 'File is empty' };

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunks = await textSplitter.createDocuments([text]);
    
    const embeddings = getEmbeddings(provider, apiKey);
    const collection = await getZvecCollection();

    // Batch generate embeddings
    const texts = chunks.map((c: any) => c.pageContent);
    const embeddedVectors = await embeddings.embedDocuments(texts);
    
    // Insert into Zvec
    const safeName = file.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const insertData = texts.map((t, i) => ({
      id: `${safeName}-${i}-${Date.now()}`,
      vectors: { embedding: embeddedVectors[i] },
      fields: { text: t, sessionId, fileName: file.name }
    }));
    
    collection.insertSync(insertData);

    return { success: true, chunks: texts.length };
  } catch (error: any) {
    console.error('Ingestion Error:', error);
    return { success: false, error: error.message };
  }
}

export async function removeDocument(sessionId: string, fileName: string) {
  try {
    const collection = await getZvecCollection();
    // Delete vectors matching this specific file and session
    const status = collection.deleteByFilterSync(`sessionId = '${sessionId}' AND fileName = '${fileName}'`);
    return { success: true, status };
  } catch (error: any) {
    console.error('Removal Error:', error);
    return { success: false, error: error.message };
  }
}

// ----------------------------------------------------------------------
// 2. LangGraph Query Workflow Action
// ----------------------------------------------------------------------

export async function askQuestion(question: string, history: Message[], provider: Provider, apiKey: string, modelName: string | undefined, sessionId: string) {
  const collection = await getZvecCollection();
  
  // Define graph nodes
  const retrieveNode = async (state: typeof GraphAnnotation.State) => {
    const embeddings = getEmbeddings(provider, apiKey);
    const queryVector = await embeddings.embedQuery(state.question);
    
    let contextStr = "";
    try {
      // Search Zvec with metadata filtering
      const results = collection.querySync({ 
        fieldName: "embedding",
        vector: queryVector, 
        topk: 5,
        filter: `sessionId = '${sessionId}'`,
        outputFields: ["text"]
      });
      
      if (Array.isArray(results)) {
        contextStr = results.map((r: any) => r.fields?.text || '').join('\n\n');
      }
    } catch(e) {
      console.log('No documents indexed yet or search failed', e);
    }
    
    return { context: contextStr };
  };

  const generateNode = async (state: typeof GraphAnnotation.State) => {
    const model = getModel(provider, apiKey);
    const systemPrompt = `You are a helpful AI assistant. Use the following document context to answer the user's question accurately. 
    If the user asks a general question about the file (e.g., "what is this file", "summarize it"), please provide a summary of the context.
    If the context is empty or doesn't contain the answer to a specific question, you can use your general knowledge, but state that the uploaded documents didn't have the specific answer.
    
    Context from documents:
    ${state.context}
    `;

    const lcHistory = state.chatHistory.slice(0, -1).map(m => 
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    const messages = [
      new SystemMessage(systemPrompt),
      ...lcHistory,
      new HumanMessage(state.question)
    ];

    const response = await model.invoke(messages);
    return { answer: response.content as string };
  };

  // Build Graph
  const workflow = new StateGraph(GraphAnnotation)
    .addNode("retrieve", retrieveNode)
    .addNode("generate", generateNode)
    .addEdge(START, "retrieve")
    .addEdge("retrieve", "generate")
    .addEdge("generate", END);

  const app = workflow.compile();

  const initialState = {
    question,
    chatHistory: history,
    context: "",
    answer: ""
  };

  const finalState = await app.invoke(initialState);
  return finalState.answer;
}

// ----------------------------------------------------------------------
// 3. Generate Title Action
// ----------------------------------------------------------------------
export async function generateTitle(firstMessage: string, provider: Provider, apiKey: string, modelName?: string) {
  try {
    const model = getModel(provider, apiKey, modelName);
    const response = await model.invoke([
      new SystemMessage("You are a chat title generator. Generate a very short, concise title (2-4 words max) for a chat session based on the user's first prompt. Do not use quotes, punctuation, or generic words like 'chat'."),
      new HumanMessage(firstMessage)
    ]);
    return (response.content as string).trim();
  } catch (error) {
    console.error("Title generation failed:", error);
    return "New Chat";
  }
}
