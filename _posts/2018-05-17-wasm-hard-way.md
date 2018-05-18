---
layout: post
title: Learn Web Assembly the hard way
categories: [wasm]
tags: [webassembly, wasm]
fullview: true
comments: true
---

I had experimented with web assembly before, but only upto running the "hello world" example. After reading a recent [post](https://developers.google.com/web/updates/2018/04/loading-wasm) on how to load wasm modules efficiently, I decided to jump into the gory details of web assembly and learn it the hard way.

What follows is a recount of that adventure.

For our demo, we will have the simplest possible function which will just return the number 42. And then go from easiest to the hardest level to run it. As a pre-requisite, you need to have the emscripten toolchain up and running. Please refer to - http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html for instructions.

### Level 0 :sunglasses:

Create a file hello.c:

```c
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
int fib() {
  return 42;
}
```

Compile it with `emcc hello.c -s WASM=1 -o hello.js`

The flag `WASM=1` is used to signal emscripten to generate wasm code. Otherwise, it generates asm.js code by default. Note that even if the output is set to `hello.js`, it will generate `hello.wasm` and `hello.js`. The .js file loads the .wasm file and sets up important environment stuff.

Then load this in an HTML file like:

```html
<html>
<head>
<script src="hello.js"></script>
<script>
Module.onRuntimeInitialized = function() {
  console.log(Module._fib())
}
</script>
</head>
</html>
```

Put all of these files in a folder and run a local web server.

Great, this completes level 0. But the js file is just a shim which sets up some stuff which we don't want. We want to load the .wasm file by ourselves and run that. Let's do that.

### Level 1 :godmode:

Let's try with the one mentioned here - https://developers.google.com/web/updates/2018/03/emscripting-a-c-library. Modify the HTML file to -

```html
<html>
<head>
<script>
(async function() {
  const imports = {
    env: {
      memory: new WebAssembly.Memory({initial: 1}),
      STACKTOP: 0,
    }
  };
  const {instance} = await WebAssembly.instantiateStreaming(fetch('hello.wasm'), imports);
  console.log(instance.exports._fib());
})();
</script>
</head>
</html>
```

We have a wonderfully cryptic error: `WebAssembly Instantiation: Import #5 module="global" error: module is not an object or function`

Some digging around in SO ([here](https://stackoverflow.com/questions/44097584/webassembly-linkerror-function-import-requires-a-callable) and [here](https://stackoverflow.com/questions/45295339/can-i-somehow-build-webassembly-code-without-the-emscripten-glue
)) led me to find that normally compiling with the `-s WASM=1` flag will add some other glue code along with the wasm code to interact with the javascript runtime. However, in our case it is not needed at all. We can remove it with `-s SIDE_MODULE=1`

Alright, so let's try - `emcc hello.c -s WASM=1 -s SIDE_MODULE=1 -o hello.js`and modify the code to as mentioned in the links.

```js
(async () => {
  const config = {
    env: {
        memoryBase: 0,
        tableBase: 0,
        memory: new WebAssembly.Memory({
            initial: 256,
        }),
        table: new WebAssembly.Table({
            initial: 0,
            element: 'anyfunc',
        }),
    }
  }
  const fetchPromise = fetch('hello.wasm');
  const {instance} = await WebAssembly.instantiateStreaming(fetchPromise, config);
  const result = instance.exports._fib();
  console.log(result);
})();
```

Still no luck. Same error.

Finally, after a couple of frustrating hours, a break came through this post - https://stackoverflow.com/questions/44346670/webassembly-link-error-import-object-field-dynamictop-ptr-is-not-a-number.

So it seems that an optimization flag greater than 0 is required. Otherwise even if you mention SIDE_MODULE, it does not remove the runtime.

Let's add that flag and run the command - `emcc hello.c -Os -s WASM=1 -s SIDE_MODULE=1 -o hello.wasm`

Note that in this case, we directly generate the .wasm file without any js shim.

This works !

### Level 2 :goberserk:

But we need to go deeper. Is there no way to compile to normal web assembly and still load the wasm file without the js shim ? Of course there was.

Digging a bit further, I got some more clarity from this page - https://github.com/kripken/emscripten/wiki/WebAssembly-Standalone. So either we use `-s SIDE_MODULE=1` to create a dynamic library, or we can pass `-Os` to remove the runtime. But in the latter case, we need to write our own loading code to use it. Strap on, this adventure is going to get bumpy.

Let's use the same code and compile without the `-s SIDE_MODULE=1` flag and see what error we get.

`Import #0 module="env" function="DYNAMICTOP_PTR" error: global import must be a number`.

By just making a guess, I understood that the env object must need a `DYNAMICTOP_PTR` field as a number. Let's add `DYNAMICTOP_PTR` as 0 in the `env` object and see what happens.

We have a new error - `WebAssembly Instantiation: Import #1 module="env" function="STACKTOP" error: global import must be a number`.

Ok, it looks like there are still more imports that need to be added. This was getting to be a whack-a-mole game. I remembered that there is a [WebAssembly Binary Toolkit](https://github.com/WebAssembly/wabt) which comprises of a suite of tools used to translate between wasm and wat format.

Let's try to convert our wasm file to wat and take a peek inside.

```
$wasm2wat hello.wasm  | head -30
(module
  (type (;0;) (func (param i32 i32 i32) (result i32)))
  (type (;1;) (func (param i32) (result i32)))
  (type (;2;) (func (param i32)))
  (type (;3;) (func (result i32)))
  (type (;4;) (func (param i32 i32) (result i32)))
  (type (;5;) (func (param i32 i32)))
  (type (;6;) (func))
  (type (;7;) (func (param i32 i32 i32 i32) (result i32)))
  (import "env" "DYNAMICTOP_PTR" (global (;0;) i32))
  (import "env" "STACKTOP" (global (;1;) i32))
  (import "env" "STACK_MAX" (global (;2;) i32))
  (import "env" "abort" (func (;0;) (type 2)))
  (import "env" "enlargeMemory" (func (;1;) (type 3)))
  (import "env" "getTotalMemory" (func (;2;) (type 3)))
  (import "env" "abortOnCannotGrowMemory" (func (;3;) (type 3)))
  (import "env" "___lock" (func (;4;) (type 2)))
  (import "env" "___syscall6" (func (;5;) (type 4)))
  (import "env" "___setErrNo" (func (;6;) (type 2)))
  (import "env" "___syscall140" (func (;7;) (type 4)))
  (import "env" "_emscripten_memcpy_big" (func (;8;) (type 0)))
  (import "env" "___syscall54" (func (;9;) (type 4)))
  (import "env" "___unlock" (func (;10;) (type 2)))
  (import "env" "___syscall146" (func (;11;) (type 4)))
  (import "env" "memory" (memory (;0;) 256 256))
  (import "env" "table" (table (;0;) 6 6 anyfunc))
  (import "env" "memoryBase" (global (;3;) i32))
  (import "env" "tableBase" (global (;4;) i32))
  (func (;12;) (type 1) (param i32) (result i32)
    (local i32)
```

Ah, so now we have a better picture. We can see that apart from `memory`, `table`, `memoryBase` and `tableBase` which we had added earlier, we have to include a whole lot of functions for this to work. Let's do that.

```js
(async () => {
  const config = {
    env: {
        DYNAMICTOP_PTR: 0,
        STACKTOP: 0,
        STACK_MAX: 0,
        abort: function() {},
        enlargeMemory: function() {},
        getTotalMemory: function() {},
        abortOnCannotGrowMemory: function() {},
        ___lock: function() {},
        ___syscall6: function() {},
        ___setErrNo: function() {},
        ___syscall140: function() {},
        _emscripten_memcpy_big: function() {},
        ___syscall54: function() {},
        ___unlock: function() {},
        ___syscall146: function() {},

        memory: new WebAssembly.Memory({initial: 256, maximum: 256}),
        table: new WebAssembly.Table({initial: 6, element: 'anyfunc', maximum: 6}),
        memoryBase: 0,
        tableBase: 0,
    }
  }
  const fetchPromise = fetch('hello.wasm');
  const {instance} = await WebAssembly.instantiateStreaming(fetchPromise, config);
  const result = instance.exports._fib();
  console.log(result);
})();
```

And voila ! This code works.

### Level 3 :trollface:

Now that I have come so far, I wanted to write the code in the wat (web assembly text) format itself to get the full experience. Turns out, the wat format is quite readable and easy to understand.

Decompiling the current `hello.wasm` with the same `wasm2wat` command as before, and scrolling to our fib function shows this -

```
(func (;19;) (type 3) (result i32)
  i32.const 42)
```

Not completely readable, but not very cryptic too. Web Assembly uses a stack architecture where values are put on the stack. When a function finishes execution, there is just a single value left on the stack, which becomes the return value of the function.

So this code seems like it is putting a constant 42 on the stack, which is finally returned.

Let's write a .wat file like -

```
(module
   (func $fib (result i32)
      i32.const 42
   )
   (export "fib" (func $fib))
)
```

And then compile it to .wasm with `wat2wasm hello.wat`

Now, our wasm file does not have any dependencies. So we can get rid of our import object altogether !

```js
(async () => {
  const fetchPromise = fetch('hello.wasm');
  const {instance} = await WebAssembly.instantiateStreaming(fetchPromise);
  const result = instance.exports.fib();
  console.log(result);
})();
```

Finally, we have the code which we want :relieved:. Since we are hand writing our wasm code, we have full control of everything, and therefore we don't need to go through extra hoops of js glue. This is certainly not something which you would want to do for production applications, but it is an interesting adventure to open the hood of web assembly and take a peek inside.
