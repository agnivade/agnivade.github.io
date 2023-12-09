---
layout: post
title: An adventure with whisper, wasi, and wazero
categories: [wasi]
tags: [wasm, wasi, whisper]
fullview: true
comments: true
---

### Introduction

It all started after I came across this brilliant article: [https://yklcs.com/blog/universal-libs-with-wasm](https://yklcs.com/blog/universal-libs-with-wasm). At my day job, we use the [whisper](https://github.com/ggerganov/whisper.cpp) library to transcribe audio calls and generate subtitles. Since our stack is entirely Go based, we use the CGo [API](https://github.com/ggerganov/whisper.cpp/tree/master/bindings/go) to interact with it. However, after reading the article, I had a desperate urge to see whether the same can be done here as well!

The idea was to compile the whisper library to a WASI build, and then load the binary via [wazero](https://github.com/tetratelabs/wazero) and then use it. 100% pure Go.

Bear in mind that there isn't an overall benefit to this exercise. The CGo code can compile to much better native code which can use AVX/AVX2 and SSE3 instruction sets. But all code in the wasm binary has to go via the wasm runtime which is still very primitive. So this exercise was purely to scratch an itch to answer the question - Can it be done?

### Changing emscripten to generate wasi

I was fairly relieved to see that wasm support is already there in whisper: [https://github.com/ggerganov/whisper.cpp/tree/master/examples/whisper.wasm](https://github.com/ggerganov/whisper.cpp/tree/master/examples/whisper.wasm). That made my starting point a lot easier. All that was needed was to switch from wasm to wasi and then my job would be done! Wishful thinking, obviously.

The first roadblock was that wazero still doesn't have thread [support](https://github.com/tetratelabs/wazero/issues/1737). So I would need to compile whisper without pthreads. That wasn't too hard. And then the next step was to target a wasi build instead of wasm. Emscripten, by default, will build a binary that's meant to be run on the browser. To make it work in a wasi environment, a separate set of flags needed to be passed.

After a bit of trawling through the docs, I came up with this set of changes:

```diff
diff --git a/CMakeLists.txt b/CMakeLists.txt
index b6d8aac..504c4d2 100644
--- a/CMakeLists.txt
+++ b/CMakeLists.txt
@@ -338,8 +338,8 @@ else()
         endif()
     else()
         if (EMSCRIPTEN)
-            set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS}   -pthread")
-            set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -pthread")
+            set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS}   ")
+            set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ")
         else()
             if(NOT WHISPER_NO_AVX)
                 set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -mavx")
diff --git a/examples/whisper.wasm/CMakeLists.txt b/examples/whisper.wasm/CMakeLists.txt
index 75e5a8d..95fef9d 100644
--- a/examples/whisper.wasm/CMakeLists.txt
+++ b/examples/whisper.wasm/CMakeLists.txt
@@ -30,12 +30,14 @@ endif()

 set_target_properties(${TARGET} PROPERTIES LINK_FLAGS " \
     --bind \
-    -s USE_PTHREADS=1 \
-    -s PTHREAD_POOL_SIZE_STRICT=0 \
+    -g \
+    --no-entry \
+    -s STANDALONE_WASM \
+    -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
     -s INITIAL_MEMORY=2000MB \
     -s TOTAL_MEMORY=2000MB \
     -s FORCE_FILESYSTEM=1 \
-    -s EXPORTED_RUNTIME_METHODS=\"['print', 'printErr', 'ccall', 'cwrap']\" \
+    -s EXPORTED_RUNTIME_METHODS=\"['out', 'err', 'ccall', 'cwrap']\" \
     ${EXTRA_FLAGS} \
     ")
```

This got me a binary that I could load via wazero.

### Getting wazero to play with whisper

However, the struggle was just beginning. Now I could load the binary, but was running into this error while trying to initialize the module.

```
func[wasi_snapshot_preview1.fd_seek]: signature mismatch
```

GitHub search led me to [https://github.com/tetratelabs/wazero/issues/1461](https://github.com/tetratelabs/wazero/issues/1461) which pointed to some incompatiblity issue with my generated binary. At that time, I didn't fully understand what was going on, so I just started to generate stub APIs to make the error go away.

One can easily override any import function in the binary with the [FunctionExporter](https://pkg.go.dev/github.com/tetratelabs/wazero@v1.1.0/imports/wasi_snapshot_preview1#FunctionExporter) interface.

For example:

```go
snpBuilder.NewFunctionBuilder().WithFunc(func(ctx context.Context, p1, p2, p3, p4, p5 int32) int32 {
  log.Printf("fd_seek called-: %d %d %d %d %d", p1, p2, p3, p4, p5)
  return 0
}).Export("fd_seek")
```

This just turned into a whack-a-mole game where every time I stubbed one function, it failed in another one. Until I realized that stubbing out syscalls like this isn't actually going to work. I need them to make file access and other internal functionality work. I actually need to fix the signature mismatch from within the binary itself.

I reached out to the author of embind: [https://github.com/jerbob92/wazero-emscripten-embind/issues/24](https://github.com/jerbob92/wazero-emscripten-embind/issues/24) who pointed out to me that it could be due to running an older version of emscripten. And voila! That fixed it.

### Getting file access to be working

Now the binary was loading fine, and the module was also instantiating. The problem was loading the model file. Bear in mind that wasi file system access works through a syscall layer which needs to be implemented by the compiler. Turns out that emscripten only has partial support for that. And I specifically needed `openat` to work. Luckily though, the same author of embind sent a PR which does what I needed: https://github.com/jerbob92/wazero-emscripten-embind/issues/24!

So then it was time to build emscripten locally. And after a while of setting up llvm and other dependencies, I finally got that branch to build. And then used the newly compiled emscripten to compile a new binary. And finally, I was able to load files!

### The last hurdle

As always, there's a boss level in any exercise which takes multiple tries until you break through. This was no different. The last problem here was figuring out the emscripten way to access Go code from C++.

As I mentioned before, emscripten assumes that you are working in a JS environment. Everything is written assuming you are passing JS objects. It gets very tricky trying to make that code work in Go. The first problem I faced was trying to pass the audio data. On the Go side, I had a `[]float32` slice after decoding the .wav file, but the C++ code assumed a `Float32Array` which has properties like `length` and `constructor`. This is the full [file](https://github.com/ggerganov/whisper.cpp/blob/master/examples/whisper.wasm/emscripten.cpp), but the relevant code is:

```cpp
std::vector<float> pcmf32;
const int n = audio["length"].as<int>();

emscripten::val heap = emscripten::val::module_property("HEAPU8");
emscripten::val memory = heap["buffer"];

pcmf32.resize(n);

emscripten::val memoryView = audio["constructor"].new_(memory, reinterpret_cast<uintptr_t>(pcmf32.data()), n);
memoryView.call<void>("set", audio);
```

So what it's basically doing is, getting the length of the audio. And then allocating some memory within the webassembly memory which is the same size as the audio. And finally copying over the audio data to the memory.

Now getting that to work in Go is not without its challenges because essentially you have to mock the runtime into thinking that it's working with JS, whereas it's not. But finally, again with a bit of support at https://github.com/jerbob92/wazero-emscripten-embind/pull/25, everything came together at last!

Full repo is here: [https://github.com/agnivade/whisper-wasi](https://github.com/agnivade/whisper-wasi). Ignore the poor code quality.

### Results

```
system_info: n_threads = 1 / 1 | AVX = 0 | AVX2 = 0 | AVX512 = 0 | FMA = 0 | NEON = 0 | ARM_FMA = 0 | METAL = 0 | F16C = 0 | FP16_VA = 0 | WASM_SIMD = 1 | BLAS = 0 | SSE3 = 0 | SSSE3 = 0 | VSX = 0 | CUDA = 0 | COREML = 0 | OPENVINO = 0 |
operator(): processing 176000 samples, 11.0 sec, 1 threads, 1 processors, lang = en, task = transcribe ...

[00:00:00.000 --> 00:00:10.500]   And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.

whisper_print_timings:     load time =     5.00 ms
whisper_print_timings:     fallbacks =   0 p /   0 h
whisper_print_timings:      mel time =     1.00 ms
whisper_print_timings:   sample time =    51.00 ms /     1 runs (   51.00 ms per run)
whisper_print_timings:   encode time =     1.00 ms /     1 runs (    1.00 ms per run)
whisper_print_timings:   decode time =    25.00 ms /    25 runs (    1.00 ms per run)
whisper_print_timings:   batchd time =     1.00 ms /     3 runs (    0.33 ms per run)
whisper_print_timings:   prompt time =     0.00 ms /     1 runs (    0.00 ms per run)
whisper_print_timings:    total time =   160.00 ms
2023/12/05 12:09:19 /home/agniva/play/agnivade/whisperwasmserve/main.go:125: Processing returned: 0. Time Taken 1m36.880706434s
```

As you can see, there's no AVX or SSE support. Just WASM_SIMD. I was curious to run the same file in a single threaded CGo env to see how much of a difference it made:

```
system_info: n_threads = 1 / 8 | AVX = 1 | AVX2 = 1 | AVX512 = 0 | FMA = 1 | NEON = 0 | ARM_FMA = 0 | METAL = 0 | F16C = 1 | FP16_VA = 0 | WASM_SIMD = 0 | BLAS = 0 | SSE3 = 1 | SSSE3 = 1 | VSX = 0 | CUDA = 0 | COREML = 0 | OPENVINO = 0 |

Loading "/home/agniva/play/whisper.cpp/bindings/go/samples/jfk.wav"
  ...processing "/home/agniva/play/whisper.cpp/bindings/go/samples/jfk.wav"
time taken: 17.219505214s

whisper_print_timings:     load time =   473.24 ms
whisper_print_timings:     fallbacks =   0 p /   0 h
whisper_print_timings:      mel time =    33.56 ms
whisper_print_timings:   sample time =    19.98 ms /     1 runs (   19.98 ms per run)
whisper_print_timings:   encode time = 16281.79 ms /     1 runs (16281.79 ms per run)
whisper_print_timings:   decode time =   883.71 ms /    30 runs (   29.46 ms per run)
whisper_print_timings:   batchd time =     0.00 ms /     1 runs (    0.00 ms per run)
whisper_print_timings:   prompt time =     0.00 ms /     1 runs (    0.00 ms per run)
whisper_print_timings:    total time = 17219.53 ms
[    0s->    8s]  And so, my fellow Americans, ask not what your country can do for you.
[    8s->   11s]  Ask what you can do for your country.
```

17s vs 90s. The difference is clear. This is a very CPU intensive job. So not taking advantage of native hardware instructions will only get you so far.

Nevertheless, the exercise was still successful. I was able to answer my question. Yes, it can be done. However, the road is bumpy. Support is still very sketchy and though work is being done, it'll take some time till it matures.

But the idea is worth exploring further, and I'm sure there'll be a lot of other exciting applications of this concept in the near future. For example, now you can easily use Rust code in your Go project. Or even vice-versa! Any language can be used by any other language as long as it can target the WASI environment.

Hopefully, this post was helpful. I'm curious to know what other applications people come up with. Feel free to shoot me an email or comment in the post.
