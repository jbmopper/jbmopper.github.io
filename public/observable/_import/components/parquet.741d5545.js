import * as Arrow from "../../_npm/apache-arrow@21.1.0/63de76cd.js";
import * as Parquet from "../../_npm/parquet-wasm@0.8.0/f61cd6bc.js";

// FileAttachment.parquet() initializes parquet-wasm on every call, and calls that
// overlap each fetch and compile the 6.6 MB module again. Pages load several
// Parquet files at once, so share one initialization across all of them.
let parquetReady = null;

function initParquet() {
  if (!parquetReady) {
    parquetReady = Parquet.default(import.meta.resolve("../../_npm/parquet-wasm@0.8.0/esm/parquet_wasm_bg.wasm"));
    parquetReady.catch(() => {
      parquetReady = null;
    });
  }
  return parquetReady;
}

/**
 * Read a Parquet FileAttachment into an Arrow table.
 *
 * `columns` limits decoding to the named columns. Names missing from the file
 * are ignored, so callers can list every alias they might read.
 */
export async function readParquet(attachment, {columns} = {}) {
  const [buffer] = await Promise.all([attachment.arrayBuffer(), initParquet()]);
  if (!columns) return Arrow.tableFromIPC(Parquet.readParquet(new Uint8Array(buffer)).intoIPCStream());

  // readParquet ignores `columns`; ParquetFile.read honors them but throws on a
  // name the file doesn't have. Pinned to 0.8.0: 0.7.1's projected read writes
  // the full schema with only the projected data, which Arrow can't decode.
  const file = await Parquet.ParquetFile.fromFile(new Blob([buffer]));
  try {
    const available = new Set(Arrow.tableFromIPC(file.schema().intoIPCStream()).schema.fields.map((field) => field.name));
    const table = await file.read({columns: columns.filter((name) => available.has(name))});
    return Arrow.tableFromIPC(table.intoIPCStream());
  } finally {
    file.free();
  }
}
