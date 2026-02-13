const DTYPE_BYTES = {
  float32: 4,
  float16: 2,
  bfloat16: 2,
  float8: 1
};

function fmtBytes(numBytes) {
  const n = Number(numBytes);
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} GB`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)} KB`;
  return `${Math.round(n)} B`;
}

export function calculateMemoryAccounting({
  B,
  S,
  V,
  d_model,
  n_heads,
  n_blocks,
  d_ff,
  d_head,
  wt_dtype = "float32",
  ft_dtype = "float32",
  grad_dtype = undefined,
  use_amp = false
}) {
  const wtBytes = DTYPE_BYTES[wt_dtype] ?? 4;
  const ftBytes = DTYPE_BYTES[ft_dtype] ?? 4;
  const gradBytes = grad_dtype ? DTYPE_BYTES[grad_dtype] ?? wtBytes : wtBytes;

  const weights = {
    "token_embeddings [V, d]": V * d_model * wtBytes,
    "lm_head [d, V]": d_model * V * wtBytes,
    "final_ln gamma [d]": d_model * wtBytes
  };

  const perBlockWeights = {
    "ln1 gamma [d]": d_model * wtBytes,
    "ln2 gamma [d]": d_model * wtBytes,
    "W_q [d, d]": d_model * d_model * wtBytes,
    "W_k [d, d]": d_model * d_model * wtBytes,
    "W_v [d, d]": d_model * d_model * wtBytes,
    "W_o [d, d]": d_model * d_model * wtBytes,
    "swiglu_w1 [d, dff]": d_model * d_ff * wtBytes,
    "swiglu_w2 [dff, d]": d_ff * d_model * wtBytes,
    "swiglu_w3 [d, dff]": d_model * d_ff * wtBytes
  };

  const totalWeights =
    Object.values(weights).reduce((a, b) => a + b, 0) + n_blocks * Object.values(perBlockWeights).reduce((a, b) => a + b, 0);

  const fwdGlobal = {
    "input_indices [B, S]": B * S * 2,
    "embeddings [B, S, d]": B * S * d_model * ftBytes
  };

  const perBlockFwd = {
    "input to block (residual) [B, S, d]": B * S * d_model * ftBytes,
    "ln1 output [B, S, d]": B * S * d_model * ftBytes,
    "ln1 rstd [B, S, 1]": B * S * ftBytes,
    "QKV combined [B, S, 3d]": B * S * 3 * d_model * ftBytes,
    "Q [B, h, S, dh]": B * n_heads * S * d_head * ftBytes,
    "K [B, h, S, dh]": B * n_heads * S * d_head * ftBytes,
    "V [B, h, S, dh]": B * n_heads * S * d_head * ftBytes,
    "Q after RoPE [B, h, S, dh]": B * n_heads * S * d_head * ftBytes,
    "K after RoPE [B, h, S, dh]": B * n_heads * S * d_head * ftBytes,
    "QK^T / sqrt(dk) [B, h, S, S]": B * n_heads * S * S * ftBytes,
    "masked scores [B, h, S, S]": B * n_heads * S * S * ftBytes,
    "softmax adjusted [B, h, S, S]": B * n_heads * S * S * ftBytes,
    "softmax exp [B, h, S, S]": B * n_heads * S * S * ftBytes,
    "softmax output [B, h, S, S]": B * n_heads * S * S * ftBytes,
    "attn @ V [B, h, S, dh]": B * n_heads * S * d_head * ftBytes,
    "attn reshaped [B, S, d]": B * S * d_model * ftBytes,
    "O proj output [B, S, d]": B * S * d_model * ftBytes,
    "post-attn residual [B, S, d]": B * S * d_model * ftBytes,
    "ln2 output [B, S, d]": B * S * d_model * ftBytes,
    "ln2 rstd [B, S, 1]": B * S * ftBytes,
    "w1(x) [B, S, dff]": B * S * d_ff * ftBytes,
    "w3(x) [B, S, dff]": B * S * d_ff * ftBytes,
    "sigmoid(w1(x)) [B, S, dff]": B * S * d_ff * ftBytes,
    "silu(w1(x)) [B, S, dff]": B * S * d_ff * ftBytes,
    "silu * w3 [B, S, dff]": B * S * d_ff * ftBytes,
    "w2 output [B, S, d]": B * S * d_model * ftBytes
  };

  const fwdFinal = {
    "final_ln output [B, S, d]": B * S * d_model * ftBytes,
    "final_ln rstd [B, S, 1]": B * S * ftBytes,
    "lm_head logits [B, S, V]": B * S * V * ftBytes
  };

  const totalFwdActivations =
    Object.values(fwdGlobal).reduce((a, b) => a + b, 0) +
    n_blocks * Object.values(perBlockFwd).reduce((a, b) => a + b, 0) +
    Object.values(fwdFinal).reduce((a, b) => a + b, 0);

  let totalGradients = totalWeights;
  if (gradBytes !== wtBytes) {
    const gradWeights = {
      "token_embeddings [V, d]": V * d_model * gradBytes,
      "lm_head [d, V]": d_model * V * gradBytes,
      "final_ln gamma [d]": d_model * gradBytes
    };
    const gradPerBlock = {
      "ln1 gamma [d]": d_model * gradBytes,
      "ln2 gamma [d]": d_model * gradBytes,
      "W_q [d, d]": d_model * d_model * gradBytes,
      "W_k [d, d]": d_model * d_model * gradBytes,
      "W_v [d, d]": d_model * d_model * gradBytes,
      "W_o [d, d]": d_model * d_model * gradBytes,
      "swiglu_w1 [d, dff]": d_model * d_ff * gradBytes,
      "swiglu_w2 [dff, d]": d_ff * d_model * gradBytes,
      "swiglu_w3 [d, dff]": d_model * d_ff * gradBytes
    };
    totalGradients =
      Object.values(gradWeights).reduce((a, b) => a + b, 0) + n_blocks * Object.values(gradPerBlock).reduce((a, b) => a + b, 0);
  }

  let optimizerState;
  if (use_amp) {
    const paramCountGlobal = V * d_model + d_model * V + d_model;
    const paramCountPerBlock = 2 * d_model + 4 * d_model * d_model + 3 * d_model * d_ff;
    const totalParamCount = paramCountGlobal + n_blocks * paramCountPerBlock;
    optimizerState = 3 * totalParamCount * 4;
  } else {
    optimizerState = 2 * totalWeights;
  }

  const peakTraining = totalWeights + totalFwdActivations + totalGradients;
  const steadyState = totalWeights + optimizerState + totalGradients;
  const sSquaredTerms = n_blocks * B * n_heads * S * S * ftBytes * 5;

  const paramCountGlobal = V * d_model + d_model * V + d_model;
  const paramCountPerBlock = 2 * d_model + 4 * d_model * d_model + 3 * d_model * d_ff;
  const totalParams = paramCountGlobal + n_blocks * paramCountPerBlock;

  return {
    total_weights: fmtBytes(totalWeights),
    total_weights_raw: totalWeights,
    total_fwd_activations: fmtBytes(totalFwdActivations),
    total_fwd_activations_raw: totalFwdActivations,
    total_gradients: fmtBytes(totalGradients),
    total_gradients_raw: totalGradients,
    optimizer_state: fmtBytes(optimizerState),
    optimizer_state_raw: optimizerState,
    peak_training: fmtBytes(peakTraining),
    peak_training_raw: peakTraining,
    steady_state: fmtBytes(steadyState),
    steady_state_raw: steadyState,
    s_squared_memory: fmtBytes(sSquaredTerms),
    s_squared_raw: sSquaredTerms,
    per_block_fwd: fmtBytes(n_blocks * Object.values(perBlockFwd).reduce((a, b) => a + b, 0)),
    per_block_fwd_raw: Object.values(perBlockFwd).reduce((a, b) => a + b, 0),
    attention_matrices_per_block: fmtBytes(B * n_heads * S * S * ftBytes * 5),
    swiglu_per_block: fmtBytes(B * S * d_ff * ftBytes * 5),
    n_blocks,
    per_block_weights_detail: perBlockWeights,
    per_block_fwd_detail: perBlockFwd,
    total_params: totalParams,
    batch_size: B,
    seq_len: S
  };
}

export function calculateModelParams(vocab_size, d_model, num_heads, num_layers, d_ff) {
  void num_heads;
  const embParams = 2 * vocab_size * d_model;
  const finalLnParams = d_model;
  const perLayerParams = 2 * d_model + 4 * d_model * d_model + 3 * d_model * d_ff;
  const totalParams = embParams + finalLnParams + num_layers * perLayerParams;
  return {
    total: totalParams,
    embeddings: embParams,
    per_layer: perLayerParams,
    final_ln: finalLnParams,
    total_M: totalParams / 1e6
  };
}

export function calculateForwardFlops(batch_size, seq_len, vocab_size, d_model, num_heads, num_layers, d_ff) {
  const B = batch_size;
  const S = seq_len;
  const V = vocab_size;
  const d = d_model;
  const h = num_heads;
  const L = num_layers;
  const dff = d_ff;
  const dHead = d / h;

  const perLayerFlops =
    2 * B * S * d +
    2 * B * S * d * (3 * d) +
    8 * B * h * S * dHead +
    2 * B * h * S * S * dHead +
    3 * B * h * S * S +
    2 * B * h * S * S * dHead +
    2 * B * S * d * d +
    2 * B * S * d +
    2 * B * S * d * dff +
    2 * B * S * d * dff +
    3 * B * S * dff +
    2 * B * S * dff * d;

  const finalNormFlops = 2 * B * S * d;
  const lmHeadFlops = 2 * B * S * d * V;
  const totalForwardFlops = L * perLayerFlops + finalNormFlops + lmHeadFlops;

  return {
    total: totalForwardFlops,
    per_layer: perLayerFlops,
    lm_head: lmHeadFlops,
    attention_per_layer: 2 * B * h * S * S * dHead * 2 + 3 * B * h * S * S,
    ffn_per_layer: 2 * B * S * d * dff * 3 + 3 * B * S * dff,
    total_TFLOPs: totalForwardFlops / 1e12
  };
}

export function calculateTrainingStepFlops(forwardFlops) {
  return {
    forward: forwardFlops,
    backward: forwardFlops * 2,
    total: forwardFlops * 3,
    total_TFLOPs: (forwardFlops * 3) / 1e12
  };
}

export function validateTrainingSpec(spec, ramBudgetGb) {
  if (typeof spec !== "object" || spec == null) {
    throw new TypeError("spec must be a dict of model parameters");
  }
  if (!(Number.isFinite(ramBudgetGb) && ramBudgetGb > 0)) {
    throw new Error("ram_budget_gb must be positive");
  }

  const required = ["B", "S", "V", "d_model", "n_heads", "n_blocks", "d_ff"];
  const missing = required.filter((key) => !(key in spec));
  if (missing.length > 0) {
    throw new Error(`Missing required keys: ${missing.join(", ")}`);
  }

  const B = Number(spec.B);
  const S = Number(spec.S);
  const V = Number(spec.V);
  const dModel = Number(spec.d_model);
  const nHeads = Number(spec.n_heads);
  const nBlocks = Number(spec.n_blocks);
  const dFf = Number(spec.d_ff);

  let dHead = spec.d_head == null ? null : Number(spec.d_head);
  if (dHead == null) {
    if (dModel % nHeads !== 0) {
      throw new Error(`d_model ${dModel} not divisible by n_heads ${nHeads}`);
    }
    dHead = dModel / nHeads;
  } else if (dHead * nHeads !== dModel) {
    throw new Error(`d_head ${dHead} * n_heads ${nHeads} != d_model ${dModel}`);
  }

  const wtDtype = spec.wt_dtype || "float32";
  const ftDtype = spec.ft_dtype || "float32";
  const gradDtype = spec.grad_dtype || wtDtype;
  const useAmp = Boolean(spec.use_amp);

  const memory = calculateMemoryAccounting({
    B,
    S,
    V,
    d_model: dModel,
    n_heads: nHeads,
    n_blocks: nBlocks,
    d_ff: dFf,
    d_head: dHead,
    wt_dtype: wtDtype,
    ft_dtype: ftDtype,
    grad_dtype: gradDtype,
    use_amp: useAmp
  });

  const headDimMultipleOf32 = dHead % 32 === 0;
  const dFfMultipleOf64 = dFf % 64 === 0;
  const budgetBytes = ramBudgetGb * 1e9;
  const fitsBudget = memory.peak_training_raw <= budgetBytes;

  const issues = [];
  if (!headDimMultipleOf32) issues.push(`d_head ${dHead} is not a multiple of 32`);
  if (!dFfMultipleOf64) issues.push(`d_ff ${dFf} is not a multiple of 64`);
  if (!fitsBudget) {
    issues.push(`peak training memory ${memory.peak_training} exceeds budget ${ramBudgetGb} GB`);
  }

  return {
    d_head: dHead,
    head_dim_multiple_of_32: headDimMultipleOf32,
    d_ff_multiple_of_64: dFfMultipleOf64,
    fits_budget: fitsBudget,
    peak_training: memory.peak_training,
    steady_state: memory.steady_state,
    peak_training_raw: memory.peak_training_raw,
    steady_state_raw: memory.steady_state_raw,
    ram_budget_gb: ramBudgetGb,
    issues
  };
}
