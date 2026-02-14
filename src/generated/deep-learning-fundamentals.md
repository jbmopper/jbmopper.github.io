---
title: "llm fundamentals"
toc: false
---

# Large Language Models and Deep Learning Fundamentals

## Table of Contents
1. [Introduction](#intro)
2. [Knowledge Gained (Learnings)](#learnings)
3. [Project Components](#project)
    1. Project Overview and Discussion
    2. [Architecture and Expected Performance Analysis](/projects/deep-learning-fundamentals/perf-expected/)
    3. [Benchmarks and Empirical Performance Analysis](/projects/deep-learning-fundamentals/perf-empirical/)
    4. [Nvidia CUDA Nsys Trace Analysis](/projects/deep-learning-fundamentals/nsys/)
    5. [Learning Parameter Sweeps](/projects/deep-learning-fundamentals/lr-sweep/)
    6. [Architectural Variations (Ablations)](/projects/deep-learning-fundamentals/ablations/)
4. Conclusions and Loose End


## Introduction <a id="intro"></a>

This project is an exercise intended to bring your humble author up to speed with the current state (give or take 6 months) of large language model fundamentals including not only their design and function, but also their implementation, tuning, benchmarking, profiling, and deployment.

To this end, the primary assginment from the [Stanford CS336 course](https://stanford-cs336.github.io/spring2025/) "Language Modeling from Scratch" was chosen as a launching point.  This [assignment](https://github.com/stanford-cs336/assignment1-basics/tree/main) is the course's eponymous from-scratch language model.  It is a "blank-sheet" exercise consisting primarily of unit tests which describe class and function interfaces and expected outputs; within these guardrails the student is expected to write all the code, utilizing only base PyTorch classes such as `nn.Module`.  In addition, exercises are suggested for profiling parts of the system, conducting parameter sweeps, and architecture variations/ablations.

What differs between this project and the assignment, and justify presenting it as a separate work, is, for one, this write-up, which is much more extensive and polished than the assignment submissions.  But more broadly that that, the work here encompasses significant efforts to understand and document the model architecture, calcluate expected performance, benchmark performance, and compare performance between the Apple Silicon/MPS implementation and the CUDA implementation run on RTX 4090 GPUs, among other elements discussed below.


## Knowledge Gained (Learnings) <a id="learnings"></a>

### Before

Prior to the project, you author's knowledge was not insubstantial.  Many years of probability, linear algebra, statistics, and econometrics provided a solid background to read and understand papers.  More recently, a distance learning certificate in Macnine Learning was completed.  This course was a stripped-down version of the [Cornell CS 4780 "Introduction to Machine Learning"](https://www.cs.cornell.edu/courses/cs4780/2021fa/) course which covered core topics in machine learning with a focus on multilayer perceptrons.

On the applied side, various CS courses had been taken, courses which used C++ and provided both basics of the subject as an undergrad, and an introduction to algorithms and complexity analysis at the graduate level.  Econometric work was usually done in STATA, with some Matlab sprinkled in.  Work experienced expanded the languages used to include Go/Golang (for concurrent scripting) and Python and Julia for data analysis.  The Machine Learning course provided a more structured introduction to NumPy, and there was plenty of command-line work at home and reading through Java and Javascript/React codebases on the job.

### After

Core goals were to gain familiarity with PyTorch and deep learning processing.  Ineed, given the open-ended nature of the assignment, early implementations that provided correct outputs as simple functions later had to be rewritten when the understanding of the role of the compute graph operating through the `nn.Parameter` class was achieved.  More broadly, a deeper understanding of Python's application of Object Orietned Programming, including things like the use of `@dataclass` and method resolution order and syntax quirks stemming from Python's interpreted design was gained.

Another goal achieved was a deep understanding of LLM architectures that can perhaps only be gained by implementing one.  The implementation included many current architectural practices such as a gated activation (SwiGLU) function, rotary positional embedding (RoPE), the attention mechanism itself, a byte-pair encoder, a somewhat outdated second-moment optimizer (AdamW), learning rate scheduler, and a nucleus/top-p sampling decoder.  Implementation built knowledge of points of practice regarding numerical stability (softmax, multinomial), efficient matrix operations (concatenating the QKV projection matrices), and the use of the `einx` package to enjoy the power and flexibility of a state-of-the-art Einstein Summation and contraction-path optimizer.

After the implementation from tokenizing through decoding was complete, the focus shifted to the nitty-gritty of practical engineering: performance estimation, benchmarking, hyperparameter sweeps utilizing the popular [wandb](https://wandb.ai) service, and of course, analyzing and communicating the results of this research, which was done using Marimo notebooks like this one.

### Papers Read and Other Resources

A side effect of the coding-first approach taken to this project was that the assignment writeup was ignored in favor of implementation, which led to researching primary sources.  Useful texbooks included Jurafsky and Martin's [Speech and Language Processing](https://web.stanford.edu/~jurafsky/slp3/ed3book_jan26.pdf) and Aggarwal's [Neural Networks and Deep Learning](https://link.springer.com/book/10.1007/978-3-319-94463-0).  Papers read included [Vaswani et al., 2017](https://arxiv.org/abs/1706.03762) of course, but also the [Su et al. 2023](https://arxiv.org/abs/1706.03762) RoPE paper, and most interestingly, [Elhage et al.'s](https://transformer-circuits.pub/2021/framework/index.html) 2021 analysis of information flow between attention heads and the residual stream.

The main downside to reading research is perhaps that it makes one want to do research.

### Notes on AI Assistant Use

This is a complex topic.  It's been a somewhat vertiginous time, with these systems rapidly improving in capability; while avoiding AI use was (and often still is) desireable when this project was began in the fall, by late winter the effective use of AI assistants was recognized as a necessary skill in itself.

The need to learn remains.  Certainly the primary and uncontested use of AI assistants is to replace the joys of pawing through reference documentation, conducting web searches for paradigmatic code, and the like.  But beyond that, lines must be drawn, and a few natural lines emerge.  The first was "campus rules".  Part of formal education is discovering when it would be beneficial to overall learning veolcity to discuss a problem with the study group, or go to office hours.  Such needs emerged with occasional issues, such as working through numerical stability issues or dealing with the tokenizer.

Other uses of AI were more questionable, but justifiable, especially in light of current transitions in practice.  One major example is the use of assistants to retrofit the model class with conditional logic to handle the architecture variations for the ablation phase.  There wasn't much learning to be had there.  Another is handling scripts and configuration files for deployments and runs.  More questionable is offloading fiddly parts of the analysis workbooks, but human attention budgeting forces prioritization, for example understanding the engineering of deep learning systems, rather than this year's graphing APIs.

So other core guidelines have emerged: one, most importantly, to be hands-on and aware when it comes to the things that ought to be learned.  Second, to be hands-on and aware for mission-critical parts of the system.  While one-off outputs and rote tasks can be offloaded to an assistant, code that needs to be performant and correct needs human attention.  And of course, the vision, quality, and communication of results are the responsibility of the human.


## Project Components <a id="project"></a>

### 1. Project Overview and Discussion

The following is an overview of the work done for the project, beginning with a more general discussion of the project and proceeding to the most substantial part of the analysis, the architecture analysis, performance predictions, and benchmark results.  These analyses can be found by following the cickable links that will open interactive notebooks of wonder and insight, which the reader is encouraged to enjoy.  The final two parts of the analysis, learning rate sweeps and ablations, are were conducted per the suggestion of the source assignment and are included for completeness.

Code for the project can be found [here]

#### The BPE Tokenizer

This is my tokenizer.  There are many like it, but this one is mine.  It's written in Python as a Python exercise.  It went through many iterations to reliably pass the time requirements of the unit tests, yet some advanced techniques like maintaining a priority queue of merge candidates were not implemented.

To expand the tokenziation skillset learned, the code was containerized (Docker) with a "slim" Python image and run on an AWS EC2 instance and the results stored in S3.  This required hands-on work with various aspects of AWS, including managing IAM permissions and going through the request process for a faster instance.

#### The Transformer

As mentioned above, this implementation was *from scratch* in the sense that no PyTorch "jellybean" classes like `nn.Linear` were used, rather the `nn.Module` class was subclassed directly and the required integrations and logic were implemented, which generally involved an `__init__()` function and a `forward()` function containing the meat of the logic.

#### The Training Loop

Implementation of the training loop was where core ideas about Pytorch's deep learning architecture solidified.  Specifically, the wiring of `nn.Parameter` classes into the compute graph, the the role of the `state_dict` in training and checkpointing, became clear.  A cosine-annealing learning rate scheduler with warmup and an AdamW second-moment optimizer were implemented.  Hopefully updated versions of the course can move on to Muon and add gradient checkpointing.

The implementation of the training loop also marked the beginning of adding coarse-grained benchmarks via `time.perf_counter()` and integration with WandB for monitoring various metrics during runs.

#### The Decoder

Implementation of the decoder drove home how the Transofrmer itself just outputs token probabilities, and sparked a strong interest in this less-glamourous but nonetheless fundamental part of LLM systems.  The decoder here is a simple top-p/nucleus sampler.  We should provide sample outputs, but the results of a 17-million parameter model trained on the "tinystories" dataset are about what one would expect.

### 2. Architecture and Expected Performance Analysis

An in-depth documentation of the architecture and memory and compute accounting was conducted.  The goal was to experiment with and visualize model parameter combinations on both Apple Silicon/MPS and the RTX 4090 (Ada Lovelace) systems.  Both systems have 24GB of RAM (unified or VRAM) but differ considerably in actual model size and throughput as the 4090 has superior memory bandwidth and supports bfloat16 and automatic mixed precision, as well as CUDA and `torch.compile()` via inductor.

Open notebook: [Architecture and Expected Performance](/projects/deep-learning-fundamentals/perf-expected/)

### 3. Benchmarks and Empirical Performance Analysis

Open notebook: [Empirical Benchmarks](/projects/deep-learning-fundamentals/perf-empirical/)

### 4. Nvidia CUDA Nsys Trace Analysis

Open notebook: [Nsys Timeline and Kernel Analysis](/projects/deep-learning-fundamentals/nsys/)

### 5. Learning Parameter Sweeps

Open notebook: [Learning Rate Sweep Analysis](/projects/deep-learning-fundamentals/lr-sweep/)

### 6. Architectural Variations (Ablations)

Open notebook: [Ablation Analysis](/projects/deep-learning-fundamentals/ablations/)

---

# llm fundamentals

This project page mirrors the notebook TOC and links to each technical section.

## TOC

- [Architecture and expected performance](/projects/deep-learning-fundamentals/perf-expected/)
- [Empirical benchmarks](/projects/deep-learning-fundamentals/perf-empirical/)
- [NSYS trace analysis](/projects/deep-learning-fundamentals/nsys/)
- [Learning-rate sweep analysis](/projects/deep-learning-fundamentals/lr-sweep/)
- [Ablation analysis](/projects/deep-learning-fundamentals/ablations/)
- [Data playground](/observable/data-playground/)

## Embed Endpoints

- `/embed/perf-expected.js` -> `renderPerfExpected`
- `/embed/perf-empirical.js` -> `renderPerfEmpirical`
- `/embed/nsys.js` -> `renderNsys`
- `/embed/lr-sweep.js` -> `renderLrSweep`
- `/embed/ablations.js` -> `renderAblations`
- `/embed/data-playground.js` -> `renderDataPlayground`
