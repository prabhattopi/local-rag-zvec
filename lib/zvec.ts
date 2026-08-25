import { ZVecCreateAndOpen, ZVecOpen, ZVecCollectionSchema, ZVecDataType, ZVecCollection } from '@zvec/zvec';
import os from 'os';
import path from 'path';
import fs from 'fs';

const globalForZvec = globalThis as unknown as {
  zvecCollectionV2: ZVecCollection | null;
  dbPathV2: string | null;
};

/**
 * Initializes and returns a singleton instance of the Zvec Collection.
 * We store the DB in the tmp directory to avoid vercel filesystem issues,
 * though it works perfectly on local disk too.
 */
export async function getZvecCollection() {
  if (globalForZvec.zvecCollectionV2) return globalForZvec.zvecCollectionV2;
  
  // Create schema for gemini-embedding-2 (3072 dimensions)
  const schema = new ZVecCollectionSchema({
    name: "rag_collection",
    vectors: { name: "embedding", dataType: ZVecDataType.VECTOR_FP32, dimension: 3072 },
    fields: [
      { name: "text", dataType: ZVecDataType.STRING },
      { name: "sessionId", dataType: ZVecDataType.STRING },
      { name: "fileName", dataType: ZVecDataType.STRING }
    ]
  });

  // Use a unique folder per server instance to avoid any Windows OS locks from previous crashes
  const dbPath = globalForZvec.dbPathV2 || path.join(os.tmpdir(), `zvec_rag_db_v2_${Date.now()}`);
  globalForZvec.dbPathV2 = dbPath;
  
  try {
    if (fs.existsSync(dbPath)) {
      globalForZvec.zvecCollectionV2 = ZVecOpen(dbPath);
    } else {
      globalForZvec.zvecCollectionV2 = ZVecCreateAndOpen(dbPath, schema);
    }
  } catch (err: any) {
    throw err;
  }
  
  return globalForZvec.zvecCollectionV2;
}
