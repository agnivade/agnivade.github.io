---
layout: post
title: Running JS Promises in series
categories: [javascript]
tags: [javascript, promises, node]
fullview: true
comments: true
---


After having read the absolutely wonderful [exploring ES6](http://exploringjs.com/es6/index.html), I wanted to use my newly acquired ES6 skills in a new project. And promises were always the crown jewel of esoteric topics to me (after monads of course :P).

Finally a new project came along, and I excitedly sat down to apply all my knowledge into practice. I started nice and easy, moved on to `Promise.all()` to load multiple promises in parallel, but then a use case cropped up, where I had to load promises in series. No sweat, just head over to SO, and look up the answer. Surely, I am not the only one here with this requirement. Sadly, most of the answers pointed to using [async](http://npmjs.com/package/async) and other similar libraries. Nevertheless, I did get an [answer](http://stackoverflow.com/a/33741475/1027058) which just used plain ES6 code to do that. Aww yiss ! Problemo solved.

I couldn't declare the functions in an array like the example. Because I had a single function. I modified the code a bit to adjust for my usecase. This was how it came out -
{% highlight javascript %}
'use strict';
const load = require('request');

let myAsyncFuncs = [
  computeFn(1),
  computeFn(2),
  computeFn(3)
];

function computeFn(val) {
  return new Promise((resolve, reject) => {
    console.log(val);
    // I have used load() but this can be any async call
    load('http://exploringjs.com/es6/ch_promises.html', (err, resp, body) => {
      if (err) {
        return reject(err);
      }
      console.log("resolved")
      resolve(val);
    });
  });
}

myAsyncFuncs.reduce((prev, curr) => {
  console.log("returned one promise");
  return prev.then(curr);
}, Promise.resolve(0))
.then((result) => {
  console.log("At the end of everything");
})
.catch(err => {
  console.error(err);
});
{% endhighlight %}


Not so fast. As you can guess, it didn't work out. This was the output I got -

{% highlight bash %}
1
2
3
returned one promise
returned one promise
returned one promise
At the end of everything
resolved
resolved
resolved
{% endhighlight %}

The promises were all getting pre-executed and didn't wait for the previous promise to finish. What is going on ? After some more time, got [this](https://pouchdb.com/2015/05/18/we-have-a-problem-with-promises.html) (Advanced mistake #3: promises vs promise factories).

Aha ! So the promise will start to execute immediately on instantiation. And will resolve only when called. So all I had to do was delay the execution of the promise until the previous promise was finished. `bind` to the rescue !

{% highlight javascript %}
'use strict';
const load = require('request');

let myAsyncFuncs = [
  computeFn.bind(null, 1),
  computeFn.bind(null, 2),
  computeFn.bind(null, 3)
];

function computeFn(val) {
  return new Promise((resolve, reject) => {
    console.log(val);
    // I have used load() but this can be any async call
    load('http://exploringjs.com/es6/ch_promises.html', (err, resp, body) => {
      if (err) {
        return reject(err);
      }
      console.log("resolved")
      resolve(val);
    });
  });
}

myAsyncFuncs.reduce((prev, curr) => {
  console.log("returned one promise");
  return prev.then(curr);
}, Promise.resolve(0))
.then((result) => {
  console.log("At the end of everything");
})
.catch(err => {
  console.error(err);
});
{% endhighlight %}

And now -

{% highlight bash %}
returned one promise
returned one promise
returned one promise
1
resolved
2
resolved
3
resolved
At the end of everything
{% endhighlight %}

Finally :)

Conclusion - If you want to execute promises in series, dont create promises which start executing. Delay their execution untill the previous promise has finished.



