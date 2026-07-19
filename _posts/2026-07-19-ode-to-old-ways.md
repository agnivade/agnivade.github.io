---
layout: post
title: An ode to the old ways
categories: [personal]
tags: [ai, engineering, reflections, personal]
fullview: true
comments: true
---

When I was a kid in middle school (Class VI in the Indian education system), I can vividly remember learning about the "Five Generations of Computer". The first few generations were about vacuum tubes and transistors, then came the integrated circuit. The current generation was the fourth - the age of microprocessors. But there was a fifth generation - the age of Artificial Intelligence. At that time, it was just something to learn in a chapter. A piece of syllabus trivia to be memorized for an exam and forgotten. Not until recently did it dawn on me that what I had read about all those years back had actually become reality.

Suffice to say, it's about time to update the textbooks. The fifth generation is already here.

This post is not going to be about best practices for harnessing agentic coding, or how to sustainably use AI while still learning and growing as a software engineer. Enough has been written already (or maybe not). This is simply a nostalgic recollection on a Sunday afternoon on the old ways of software engineering. Or at least how I learned to appreciate my craft and the wisdom that I picked up along the way.

## Hand written code

When I was a junior engineer, my mentor once told me never to copy-paste code, even if it was from the same codebase or even if it was code I had written. He told me to always write every line by hand. It was valuable advice. The act of writing makes you think about those lines. When you write something by hand, you build up the context in your head; you become intimately familiar with the syntax. Not to memorize the syntax, but to appreciate the beauty of a programming language.

I want to refer to a few lines from https://priyankaupadhyai.substack.com/i/175949632/the-neuroscience-behind-handwriting, which I resonate with heavily:

> Handwriting activates circuits that integrate thought, movement, and emotion — the prefrontal cortex (attention and planning), the hippocampus (memory), and the insula (emotional awareness). The slower rhythm of pen against paper stabilizes the noise of the limbic system, re-engaging higher cognition.
>

> Psychologists call this embodied cognition: the idea that the body participates in thinking. Writing is not a by-product of thought; it is the reservoir for it.
>

> When we slow down and use paper to think, we force the brain to summarize, to prioritize, and to choose between various strands of thoughts. This act of choice, when we are thinking about our own thinking is in fact a kind of metacognition.
>

I'd like to think the same applies to the act of writing code as well. Although I don't know if any research has actually been done here.

Putting pen to paper, or in this case, finger to keyboard, forces you to think about the code. You write an initial version, then refactor it, iterate on it, and others look at it; this whole cycle repeats a few times. The tech world calls it code review. But to me, it’s just a way to share my artwork with fellow artists and ask what they see.

Some of my best years were spent when I was an active Go contributor. The PR review feedback from the Go team was some of the best I had seen in my entire career. Every line of comment, every piece of feedback taught me something new. I learned so much about the compiler, the runtime, and more importantly, how to write great Go code. A lot of that I’ve forgotten by now, but the essence of strong engineering discipline is something that I still carry with me today.

So I decided to do something unthinkable last week. I was tracking a memory leak, and I decided to do all of it in the old way - by hand. I struggled for a bit to find the right combination of params in `dlv` to suppress the log output. Then went ahead in the old way, setting breakpoints and looking at goroutine profiles and stack dumps till I found the bug.

It was slow, but I wasn’t chasing speed. I was chasing the lost feeling of satisfaction that one gets after cracking a problem.

## The firemen came last

I think instead of worrying about a future like 1984, we should be more concerned about a future like Fahrenheit 451. In 1984, they take the thing you love away from you. In Fahrenheit 451, you simply stop reaching for it, and one day you stop remembering why you ever did. In today’s age, with attention span at a premium, somewhere between endless doomscrolling and Fable 5, engineering is starting to lose a part of its soul.

Nobody is going to ban the debugger. We'll just stop opening it.

That's really why I spent an afternoon on a bug I could have closed in minutes. Less nostalgia, but more of a checkup. I wanted to know if I still missed it.

I did.
