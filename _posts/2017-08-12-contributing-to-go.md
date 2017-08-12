---
layout: post
title: How I landed my first contribution to Go
categories: [open-source, go]
tags: [go, golang]
fullview: true
comments: true
---

I have been writing open-source software in Go for quite some time now. And only recently, an opportunity came along, which allowed me to write Go code at work too. I happily shifted gears from being a free-time Go coder to full time coding in Go.

All was fine until the last GopherCon happened, where a [contributor's workshop](https://blog.golang.org/contributor-workshop) was held. Suddenly, seeing all these people committing code to Go gave me an itch to do something. And immediately within a few days, [Fransesc](https://github.com/campoy) did a wonderful [video](https://www.youtube.com/watch?v=DjZMKKfNVMc) on the steps to contribute to the Go project on his JustForFunc channel.

The urge was too much. With having an inkling of an idea on what to contribute, I atleast decided to download the source code and compile it. Thus began my journey to become a Go contributor !

I started reading the contribution guide and followed along the steps. Signing the CLA was bit of a struggle, because the instructions were slightly incorrect. Well, why not raise an issue and offer to fix it on my own ? That can well be my first CL ! Excited, I filed this [issue](https://github.com/golang/go/issues/21377). It turned out to be a classic n00b mistake. The issue was already fixed in tip, and I didn't even bother to look. Shame !

Anyways, now that everything was set, I was wading along aimlessly across the standard library. After writing continuous Go code for a few months at work, there were a few areas in the standard library which consistently came up as hotspots in the cpu profiles. One of them was the `fmt` package. I decided to look at the `fmt` package and see if something can be done. After an hour or so, something came out.

The `fmt_sbx` function in the `fmt/format.go` file, starts like this -

{% highlight go %}
func (f *fmt) fmt_sbx(s string, b []byte, digits string) {
	length := len(b)
	if b == nil {
		// No byte slice present. Assume string s should be encoded.
		length = len(s)
	}
{% endhighlight %}

It was clear that the len() call happened twice in case `b` was `nil`, whereas, if it was moved to the `else` part of the `if` condition, only one of them would happen. It was an extremely tiny thing. But it was something. Eventually, I decided to send a CL just to see what others will say about it.

Within a few minutes of my pushing the CL, [Ian](https://github.com/ianlancetaylor) gave a +2, and after that [Avelino](https://github.com/avelino) gave a +1. It was unbelievable !

And then things took a darker turn. [Dave](https://github.com/davecheney) gave a -1 and [Martin](https://github.com/martisch) also concurred. He actually took binary dumps of the code and examined that there was no difference in the generated assembly at all. Dave had already suspected that the compiler was smart enough to detect such an optimization and overall it was a net loss because the `else` condition hurt readability at no considerable gain in performance.

The CL had to be abandoned.

But I learnt a lot along the way, adding new tools like `benchstat` and `benchcmp` under my belt. Moreover, now I was comfortable with the whole process. So there was no harm in trying again. :sweat_smile:

A few days back, I found out that instead of doing an `fmt.Sprintf()` with strings, a string concat is a lot faster. I started searching for a victim, and it didn't take much time. It was the `archive/tar` package. The `formatPAXRecord` function in `archive/tar/strconv.go` has a line like this -

{% highlight go %}
size := len(k) + len(v) + padding
size += len(strconv.Itoa(size))
record := fmt.Sprintf("%d %s=%s\n", size, k, v)
{% endhighlight %}

On changing the last line to - `record := fmt.Sprint(size) + " " + k + "=" + v + "\n"`, I saw pretty significant improvements -

```
name             old time/op    new time/op    delta
FormatPAXRecord     683ns ± 2%     457ns ± 1%  -33.05%  (p=0.000 n=10+10)

name             old alloc/op   new alloc/op   delta
FormatPAXRecord      112B ± 0%       64B ± 0%  -42.86%  (p=0.000 n=10+10)

name             old allocs/op  new allocs/op  delta
FormatPAXRecord      8.00 ± 0%      6.00 ± 0%  -25.00%  (p=0.000 n=10+10)
```

The rest, as they say, is history :stuck_out_tongue_closed_eyes:. This time, [Joe](github.com/dsnet) reviewed it. And after some small improvements, it got merged ! Yay ! I was a Go contributor. From being an average open source contributor, I actually made a contribution to the Go programming language.

This is no way the end for me. I am starting to grasp the language much better and will keep sending CLs as and when I find things to do. Full marks to the Go team for tirelessly managing such a complex project so beautifully.

P.S. For reference -

This is my first CL which was rejected: https://go-review.googlesource.com/c/54952/

And this is the second CL which got merged: https://go-review.googlesource.com/c/55210/

