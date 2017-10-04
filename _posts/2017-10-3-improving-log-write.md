---
layout: post
title: A small memory optimization for log-heavy applications
categories: [go]
tags: [go, golang, logging]
fullview: true
comments: true
---

Sometimes, I randomly browse through Go source code just to look for any patterns or best practices. I was doing that recently with the log package when I came across an interesting observation that I wanted to share.

Any call to `log.Print` or `log.Println` or any of its sister functions is actually a wrapper around the equivalent `S` call from the `fmt` package. The final output of that is then passed to an `Output` function, which is actually responsible for writing out the string to the underlying writer.

Here is some code to better explain what I'm talking about -

{% highlight go %}
// Print calls l.Output to print to the logger.
// Arguments are handled in the manner of fmt.Print.
func (l *Logger) Print(v ...interface{}) { l.Output(2, fmt.Sprint(v...)) }
// Println calls l.Output to print to the logger.
// Arguments are handled in the manner of fmt.Println.
func (l *Logger) Println(v ...interface{}) { l.Output(2, fmt.Sprintln(v...)) }
{% endhighlight %}


This means that if I just have one string to print, I can directly call the `Output` function and bypass this entire `Sprint`ing process.

Lets whip up some benchmarks and analyse exactly how much of an overhead is taken by the fmt call -
```
func BenchmarkLogger(b *testing.B) {
	logger := log.New(ioutil.Discard, "[INFO] ", log.LstdFlags)
	errmsg := "hi this is an error msg"
	for n := 0; n < b.N; n++ {
		logger.Println(errmsg)
	}
}
```

If we look into the cpu profile from this benchmark -

![profile-println]({{"/assets/marked.png" | absolute_url}})

Its hard to figure out what's going on. But the key takeaway here is that huge portion of the function calls circled in red is what's happening from the `Sprintln` call. If you zoom in to the attached svg [here]({{"/assets/profile001.svg" | absolute_url}}), you can see lot of time being spent on getting and putting back the buffer to the pool and some more time being spent on formatting the string.

Now, if we compare this to a benchmark by directly calling the `Output` function -

```
func BenchmarkLogger(b *testing.B) {
	logger := log.New(ioutil.Discard, "[INFO] ", log.LstdFlags)
	errmsg := "hi this is an error msg"
	for n := 0; n < b.N; n++ {
		logger.Output(1, errmsg) // 1 is the call depth used to print the source file and line number
	}
}
```

![profile-output]({{"/assets/profile002.png" | absolute_url}})

Bam. The entire portion due to the `SPrintln` call is gone.

Time to actually compare the 2 benchmarks and see how they perform.

{%highlight go%}
func BenchmarkLogger(b *testing.B) {
	logger := log.New(ioutil.Discard, "[INFO] ", log.LstdFlags)
	testData := []struct {
		test string
		data string
	}{
		{"short-str", "short string"},
		{"medium-str", "this can be a medium sized string"},
		{"long-str", "just to see how much difference a very long string makes"},
	}

	for _, item := range testData {
		b.Run(item.test, func(b *testing.B) {
			b.SetBytes(int64(len(item.data)))
			for n := 0; n < b.N; n++ {
				// logger.Println(str) // Switched between these lines to compare
				logger.Output(1, item.data)
			}
		})
	}
}
{%endhighlight%}


```
name                 old time/op    new time/op     delta
Logger/short-str-4   457ns ± 2%      289ns ± 0%   -36.76%  (p=0.016 n=5+4)
Logger/medium-str-4  465ns ± 0%      291ns ± 0%   -37.30%  (p=0.000 n=4+5)
Logger/long-str-4    471ns ± 1%      291ns ± 2%   -38.35%  (p=0.008 n=5+5)

name                 old speed      new speed       delta
Logger/short-str-4   26.3MB/s ± 2%   41.5MB/s ± 0%   +58.07%  (p=0.016 n=5+4)
Logger/medium-str-4  70.9MB/s ± 0%  113.1MB/s ± 1%   +59.40%  (p=0.016 n=4+5)
Logger/long-str-4    119MB/s ± 0%    192MB/s ± 2%   +62.14%  (p=0.008 n=5+5)

name                 old alloc/op   new alloc/op    delta
Logger/short-str-4   32.0B ± 0%       0.0B       -100.00%  (p=0.008 n=5+5)
Logger/medium-str-4  64.0B ± 0%       0.0B       -100.00%  (p=0.008 n=5+5)
Logger/long-str-4    80.0B ± 0%       0.0B       -100.00%  (p=0.008 n=5+5)

name                 old allocs/op  new allocs/op   delta
Logger/short-str-4   2.00 ± 0%       0.00       -100.00%  (p=0.008 n=5+5)
Logger/medium-str-4  2.00 ± 0%       0.00       -100.00%  (p=0.008 n=5+5)
Logger/long-str-4    2.00 ± 0%       0.00       -100.00%  (p=0.008 n=5+5)
```

More or less what was expected. It removes the allocations entirely by bypassing the fmt calls. So, the larger of a string you have, the more you save. And also, the time difference increases as the string size increases.

But as you might have already figured out, this is just optimizing a corner case. Some of the limitations of this approach are:

- It is only applicable when you just have a single string and directly printing that. The moment you move to creating a formatted string, you need to call `fmt.Sprintf` and you deal with the pp buffer pool again.

- It is only applicable when you are using the log package to write to an underlying writer. If you are calling the methods of the writer struct directly, then all of this is already taken care of.

- It hurts readability too. `logger.Println(msg)` is certainly much more readable and clear than `logger.Output(1, msg)`.

I only had a couple of cases like this in my code's hot path. And in top-level benchmarks, they don't have much of an impact. But in situations, where you have a write-heavy application and a whole lot of plain strings are being written, you might look into using this and see if it gives you any benefit.
