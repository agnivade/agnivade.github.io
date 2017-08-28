---
layout: post
title: An adventure in trying to optimize math.Atan2 with Go assembly
categories: [go]
tags: [go, golang, assembly]
fullview: true
comments: true
---

This is a recount of an adventure where I experimented with some Go assembly coding in trying to optimize the math.Atan2 function. :smile:

## Some context

The reason for optimizing the math.Atan2 function is because my current work involves performing some math calculations. And the math.Atan2 call was in the hot path. Therefore, it was coming up as a hot spot in the cpu profiles. Now, usually, I don't look beyond trying to optimize what the standard library is already doing, but just for the heck of it, I tried to see if there are any ways in which the calculation can be done faster.

And that led me to this SO [link](https://stackoverflow.com/a/23097989). So, there seems to be an FMA operation which does a fused-multiply-add in a single step. That is very interesting. Then, looking into Go, I found that this is an open [issue](https://github.com/golang/go/issues/8037) which is yet to be implemented in the Go assembler. That means, the Go code is still doing normal multiply-add inside the `math.Atan2` call. This seemed like something that can be optimized. Atleast, it was worth a shot to see if there are considerable gains.

But that meant, I have to write an assembly module to be called from Go code.

## So it begins ...

I started to do some digging. The Go [documentation](https://golang.org/doc/asm#unsupported_opcodes) mentions how to add unsupported instructions in a Go assembly module. Essentially, you have to write the opcode for that instruction using a `BYTE` or `WORD` directive.

I wanted to start off with something simple. Found a couple of good links [here](https://goroutines.com/asm) and [here](https://www.manniwood.com/2016_07_03/fun_with_go_assembler.html). I won't go into the details of an assembly module. The first link explains it pretty well. This will be just about how I utilized the FMA instruction.

Anyway, so I copied the simple addition example and got it working. Here is the code for reference -

```
#include "textflag.h"

TEXT ·add(SB),NOSPLIT,$0
	MOVQ x+0(FP), BX
	MOVQ y+8(FP), BP
	ADDQ BP, BX
	MOVQ BX, ret+16(FP)
	RET
```

Note the `#include` directive. You need that. Otherwise, it does not recognize the `NOSPLIT` command.

Now, the next target was to convert this into adding `float64` variables. Now keep in mind, I am an average programmer whose last brush with assembly was in University in some sketchy course. The following might be simple to some of you but this was me -

<img src="http://leedshackspace.org.uk/wp-content/uploads/2014/05/i-have-no-idea-what-im-doing-dog.jpg" />

After some hit and trial and sifting through some Go code, I got to a working version.

```
TEXT ·add(SB),$0
	FMOVD x+0(FP), F0
	FMOVD F0, F1
	FMOVD y+8(FP), F0
	FADDD F1, F0
	FMOVD F0, F1
	FMOVD z+16(FP), F0
	FADDD F1, F0
	FMOVD F0, ret+24(FP)
	RET
```

Then I had a brilliant(totally IMO) idea. I could write a simple floating add in Go, do a `go tool compile -S`, get the generated assembly and copy that instead of handcoding it myself ! This was the result -

```
TEXT ·add(SB),$0
	MOVSD x+0(FP), X0
	MOVSD y+8(FP), X1
	ADDSD X1, X0
	MOVSD z+16(FP), X1
	ADDSD X1, X0
	MOVSD X0, ret+24(FP)
	RET
```

Alright, so far so good. Only thing remaining is to add the FMA instruction. Instead of adding the 3 numbers, we just need to multiply the first 2 and add it to the 3rd and return it.

Looking into the documentation, I found that there are several variants of FMA. Essentially there are 2 main categories, which deals with single precision and double precision values. And each category has 3 variants which do a permutation-combination of which arguments to choose, when doing the multiply-add. I went ahead with the double precision one because that's what we are dealing with here. These are the variants of it -

__VFMADD132PD__: Multiplies the two or four packed double-precision floating-point values from the first source operand to the two or four packed double-precision floating-point values in the third source operand, adds the infi-nite precision intermediate result to the two or four packed double-precision floating-point values in the second source operand, performs rounding and stores the resulting two or four packed double-precision floating-point values to the destination operand (first source operand).

__VFMADD213PD__: Multiplies the two or four packed double-precision floating-point values from the second source operand to the two or four packed double-precision floating-point values in the first source operand, adds the infi-nite precision intermediate result to the two or four packed double-precision floating-point values in the third source operand, performs rounding and stores the resulting two or four packed double-precision floating-point values to the destination operand (first source operand).

__VFMADD231PD__: Multiplies the two or four packed double-precision floating-point values from the second source to the two or four packed double-precision floating-point values in the third source operand, adds the infinite preci-sion intermediate result to the two or four packed double-precision floating-point values in the first source operand, performs rounding and stores the resulting two or four packed double-precision floating-point values to the destination operand (first source operand).

The explanations are copied from the intel reference manual. Basically, the `132`, `213`, `231` denotes the index of the operand on which the operations are being done. Why there is no `123` is beyond me. :confused: I selected the `213` variant because that's what felt intuitive to me - doing the addition with the last operand.

Ok, so now that I had selected the instruction, I needed to get the opcode for this. Believe it or not, I was stuck with this for a very long time. The intel reference manual and other sites all mention the opcode as `VEX.DDS.128.66.0F38.W1 A8 /r` and I have no clue what that is supposed to mean. The Go doc [link](https://golang.org/doc/asm#unsupported_opcodes) showed that the opcode for `EMMS` was `0F, 77`. So, maybe for VFMADD213PD, it was `0F, 38` ? That didn't work. And no variations of that worked. Finally, a breakthrough came with this [link](https://blog.klauspost.com/adding-unsupported-instructions-in-golang-assembler/).

I wrote a file containing this -
```
BITS 64

VFMADD213PD xmm0, xmm2, xmm3
```

Saved it as `test.asm`. Then after a `yasm test.asm` and `xxd test` - I got the holy grail - `C4E2E9A8C3`. Like I said, I have no idea how it is so different than what the documentation said, but I trudged on ahead.

Alright, so integrating it within the code. I got this -
```
// func fma(x, y, z) float64
TEXT ·fma(SB),NOSPLIT,$0
	MOVSD x+0(FP), X0
	MOVSD y+8(FP), X2
	MOVSD z+16(FP), X3
	// VFMADD213PD X0, X2, X3
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xC3
	MOVSD X0, ret+24(FP)
	RET
```

Perfect. Now I just need to write my own `atan2` implementation with the fma operations replaced with this asm call. I copied all of the code from the standard library for the `atan2` function, and replaced the multiply-additions with an fma call. The brunt of the calculation actually happens inside a `xatan` call.

Originally, a `xatan` function which does this -

{% highlight go %}
z := x * x
z = z * ((((P0*z+P1)*z+P2)*z+P3)*z + P4) / (((((z+Q0)*z+Q1)*z+Q2)*z+Q3)*z + Q4)
z = x*z + x
{% endhighlight %}

Then replacing it with my function, this is what I got -

{% highlight go %}
z := x * x
z = z * fma(fma(fma(fma(P0, z, P1), z, P2), z, P3), z, P4) / fma(fma(fma(fma((z+Q0), z, Q1), z, Q2), z, Q3), z, Q4)
z = fma(x,z,x)
{% endhighlight %}

Did some sanity checks to varify the correctness. Everything looked good. Now time to benchmark and get some sweet perf improvement !

And, here is what I saw -

```
go test -bench=. -benchmem
BenchmarkAtan2-4     100000000     23.6 ns/op     0 B/op   0 allocs/op
BenchmarkMyAtan2-4   30000000      53.4 ns/op     0 B/op   0 allocs/op
PASS
ok  	asm	4.051s
```

<img src="http://memegenerator.net/img/cache/instances/folder237/500x/55578237.jpg" width="250" />

The fma implementation is slower, much slower than the normal multiply-add. Trying to get deeper into it, I thought of benchmarking just the pure fma function with a normal native Go multiply-add. This was what I got -

```
go test -bench=. -benchmem
BenchmarkFMA-4                  1000000000    2.72 ns/op   0 B/op    0 allocs/op
BenchmarkNormalMultiplyAdd-4    2000000000    0.38 ns/op   0 B/op    0 allocs/op
PASS
ok  	asm	3.799s
```

I knew it. It was the assembly call overhead which was more than the gain I got from the fma calculation. Just to confirm this theory, I did another benchmark where I compared with an assembly implementation of a multiply-add.

```
go test -bench=. -benchmem -cpu=1
BenchmarkFma        1000000000      2.65 ns/op     0 B/op     0 allocs/op
BenchmarkAsmNormal  1000000000      2.66 ns/op     0 B/op     0 allocs/op
PASS
ok  	asm	5.866s
```

Yes, so it was clearly the function call overhead. That means if I implement the entire `xatan` function in assembly which has 9 fma calls. There might be a chance that the gain from fma calls is actually more than the loss from the assembly call overhead. Time to put the theory to test.

After a couple of hours of struggling, my full asm `xatan` implementation was complete. Note that there are 8 fma calls. The last one can also be converted to fma, but I was too eager to find out the results. If it did give any benefit, then it makes sense to optimize further. This was my final `xatan` implementation in assembly.

```
// func myxatan(x) float64
TEXT ·myxatan(SB),NOSPLIT,$0-16
	MOVSD   x+0(FP), X2
	MOVUPS  X2, X1
	MULSD   X2, X2
	MOVSD   $-8.750608600031904122785e-01, X0
	MOVSD   $-1.615753718733365076637e+01, X3
	// VFMADD213PD X0, X2, X3
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xC3
	MOVSD   $-7.500855792314704667340e+01, X3
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xC3
	MOVSD   $-1.228866684490136173410e+02, X3
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xC3
	MOVSD   $-6.485021904942025371773e+01, X3
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xC3
	MULSD   X2, X0 // storing numerator in X0
	MOVSD   $+2.485846490142306297962e+01, X3
	ADDSD   X2, X3
	MOVSD   $+1.650270098316988542046e+02, X4
	// VFMADD213PD X3, X2, X4
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xDC
	MOVSD   $+4.328810604912902668951e+02, X4 // Q2
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xDC
	MOVSD   $+4.853903996359136964868e+02, X4 // Q3
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xDC
	MOVSD   $+1.945506571482613964425e+02, X4 // Q4
	BYTE $0xC4; BYTE $0xE2; BYTE $0xE9; BYTE $0xA8; BYTE $0xDC
	DIVSD   X3, X0
	MULSD   X1, X0
	ADDSD   X0, X1
	MOVSD   X1, ret+8(FP)
	RET
```

This was the benchmark code -

{% highlight go %}
func BenchmarkMyAtan2(b *testing.B) {
	for n := 0; n < b.N; n++ {
		myatan2(-479, 123) // same code as standard library, with just the xatan function swapped to the one above
	}
}

func BenchmarkAtan2(b *testing.B) {
	for n := 0; n < b.N; n++ {
		math.Atan2(-479, 123)
	}
}
{% endhighlight %}

And results -
```
goos: linux
goarch: amd64
pkg: asm
BenchmarkMyAtan2-4    50000000    25.3 ns/op       0 B/op      0 allocs/op
BenchmarkAtan2-4      100000000   23.5 ns/op       0 B/op      0 allocs/op
PASS
ok  	asm	3.665s
```

Still slower, but much better this time. I came from 53.4 ns/op down to 25.3ns/op. Note that these are just results from one run. Ideally, good benchmarks should be run several times and viewed through the `benchstat` tool. But, the point here is that even after writing the entire `xatan` code in assembly with only one function call. It is just comparable enough with the normal `atan2` function. That is something not desirable. Until the gains are pretty big enough, it doesn't make sense to write and maintain an assembly module.

Maybe if someone implements the entire `atan2` function in assembly, we might actually see the asm implementation beat the native one. But still I don't think the gains will be great enough to warrant the cost of writing it in assembly. So until the time issue [8037](https://github.com/golang/go/issues/8037) is resolved, we will have to make do with whatever we got.

## And that's it !

It was fun to tinker with assembly code. I have much more respect for a compiler now. Sadly, all adventures do not end with a success story. Some adventures are just for the experience :wink:
