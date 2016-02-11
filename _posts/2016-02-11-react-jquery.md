---
layout: post
title: Mixing React and jQuery
categories: [react]
tags: [react]
fullview: true
comments: true
---

Recently, I was doing a client project and got a chance to build a site. I decided this would be the perfect opportunity for me to build it in React and sharpen my React skills. Adventure time !

The site was coming up nice and smooth. But being a hardcore jQuery guy, I couldn't resist myself from using jQuery here and there. The alternative was to spending more effort in reading React docs and implementing everything in React way. Well, you can guess what was about to happen.

I was stuck with this weird error -
```
Invariant Violation: ..... This probably means the DOM was unexpectedly mutated (e.g. by the browser).
```

A quick search gave me links to

*    <https://github.com/facebook/react/issues/997>
*    <http://stackoverflow.com/questions/27776780/react-js-invariant-violation-findcomponentroot>
*    <http://stackoverflow.com/questions/25026399/uncaught-error-invariant-violation-findcomponentroot-110-unable-to>

But none of these solved my issue. I just had a faint idea that it had to be something related to DOM manipulation and my intermixing of jQuery with React was the culprit.

After hours of playing cat and mouse with the bug, I finally located it. It was in these lines -

{% highlight javascript %}
$("#poPreviewContainer").empty();
POPreviewRendered = React.render(<POPreviewDialog
    poData={this.props.poData}
    document.getElementById('poPreviewContainer'));
{% endhighlight %}

Basically, there is a dialog that I am dynamically populating everytime with new data and putting it inside a div to be shown in the browser. Now, being the jQuery user that I am, I did a ```.empty()``` on the div and did a ```React.render``` to re-render the new dialog. And it turns out React does not like someone else to empty divs without telling it.

The solution was to use React specific function calls to empty the div.
{% highlight javascript %}
React.unmountComponentAtNode(document.getElementById('poPreviewContainer'));
{% endhighlight %}

A gentle reminder to those of you migrating from jQuery to React. Always think in React. And try to ditch jQuery completely. And if you can't, have a look at posts like these to help you out :)
