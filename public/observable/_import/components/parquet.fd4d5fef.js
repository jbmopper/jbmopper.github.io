import * as Arrow from "../../_npm/apache-arrow@21.1.0/63de76cd.js";
import * as Parquet from "../../_npm/parquet-wasm@0.7.1/68d81b68.js";

// FileAttachment.parquet() initializes parquet-wasm on every call, and calls that
// overlap each fetch and compile the 6.6 MB module again. Pages load several
// Parquet files at once, so share one initialization across all of them.
let parquetReady = null;

function initParquet() {
  if (!parquetReady) {
    parquetReady = Parquet.default(import.meta.resolve("../../_npm/parquet-wasm@0.7.1/esm/parquet_wasm_bg.wasm"));
    parquetReady.catch(() => {
      parquetReady = null;
    });
  }
  return parquetReady;
}

function columnNames(bytes) {
  const schema = Parquet.readSchema(bytes);
  return Arrow.tableFromIPC(schema.intoIPCStream()).schema.fields.map((field) => field.name);
}

/**
 * Read a Parquet FileAttachment into an Arrow table.
 *
 * `columns` limits decoding to the named columns. Names missing from the file
 * are ignored, so callers can list every alias they might read.
 */
export async function readParquet(attachment, {columns} = {}) {
  const [buffer] = await Promise.all([attachment.arrayBuffer(), initParquet()]);
  const bytes = new Uint8Array(buffer);
  let options;
  if (columns) {
    const available = new Set(columnNames(bytes));
    options = {columns: columns.filter((name) => available.has(name))};
  }
  return Arrow.tableFromIPC(Parquet.readParquet(bytes, options).intoIPCStream());
}
