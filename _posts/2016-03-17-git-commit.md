---
layout: post
title: Enforcing git commit structure
categories: [git]
tags: [git]
fullview: true
comments: true
---

I love git. Through and through. I love its distributed nature and the immense power it gives to the user. For someone who likes to be in complete control over his code, this was the real deal.

Naturally, I also started to follow the best practices around using git. Two good posts in this regard that I like are

* <http://chris.beams.io/posts/git-commit/>
* <http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html>

A subject line, gap, then a nice body. Clean git commits. All nice and dandy.

But one thing was always nagging me at the back of my mind. If we are to enforce a process, there should be a way to automate this, and not have a newcomer memorize all the points before starting to make commits.

Git hooks to the rescue ! I had been planning to look into git hooks for some time but somehow didn't get the time. Well, this was the perfect time.

After a bit of meddling around, I found that git provides hooks to various stages of the commit lifecycle. All at client side. And some at server side too. And guess what, you can run a script to check the commit message and if you don't like it, you can choose to reject it. Time for some code :)

{% highlight bash %}
#!/bin/bash
cnt=0
while IFS='' read -r line || [[ -n "$line" ]]; do
  cnt=$((cnt+1))
  length=${#line}
  if [ $cnt -eq 1 ]; then
    # Checking if subject exceeds 50 characters
    if [ $length -gt 50 ]; then
      echo "Your subject line exceeds 50 characters."
      exit 1
    fi
    i=$(($length-1))
    last_char=${line:$i:1}
    # Last character must not have a punctuation
    if [[ ! $last_char =~ [0-9a-zA-Z] ]]; then
      echo "Last character of the subject line must not have punctuation."
      exit 1
    fi
  elif [ $cnt -eq 2 ]; then
    # Subject must be followed by a blank line
    if [ $length -ne 0 ]; then
      echo "Your subject line follows a non-empty line. Subject lines should always be followed by a blank line."
      exit 1
    fi
  else
    # Any line in body must not exceed 72 characters
    if [ $length -gt 72 ]; then
      echo "The line \"$line\" exceeds 72 characters."
      exit 1
    fi
  fi
done < "$1"
{% endhighlight %}

Here, I have just enforced a few basic rules which I feel should be followed by every repo. You can of course choose to modify or extend them.

Just put this code in a file called commit-msg. And drop it in the ```.git/hooks/``` folder of your repo. Don't forget to make it an executable. And you are done !

Proper gist link here - <https://gist.github.com/agnivade/67b42d664ece2d4210c7>


