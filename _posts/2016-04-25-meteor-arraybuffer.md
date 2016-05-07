---
layout: post
title: Passing array buffer to Meteor gridFS
categories: [meteor]
tags: [meteor, gridfs, arraybuffer, mongodb]
fullview: true
comments: true
---

MongoDB has a document size limit of [16MB](https://docs.mongodb.org/manual/reference/limits/#BSON-Document-Size). To store larger file sizes, it is recommended to use GridFS.

Now, if you are a meteor user, you can very easily use the [Meteor Collection-FS](https://github.com/CollectionFS/Meteor-CollectionFS) package to store and upload **files**. But it is slightly different when you actually want to store an object of size larger than 16MB which is not a file. Usually, these scenarios will come in the server side when you generate a large content and want to store that.

I was doing something like this -

{% highlight javascript %}
//Collection initialisation
var Store = new FS.Store.GridFS("fileuploads");

FileUploads = new FS.Collection("fileuploads", {
  stores: [Store]
});

var buffer = new Buffer(JSON.stringify(jsonObj));
FileUploads.insert(buffer);
{% endhighlight %}

I found myself stuck with this error when I tried to use the insert function with the generated data.

```
DataMan constructor requires a type argument when passed a Buffer
```

This is actually a mistake in the documentation here - <https://github.com/CollectionFS/Meteor-CollectionFS#initiate-the-upload> which says the insert function accepts a Buffer object at the server side. It doesn't. It accepts a file object with its data set as a buffer object along with a mime type.

Here is how to get it done-

{% highlight javascript %}
var buffer = new Buffer(JSON.stringify(jsonObj));
var newFile = new FS.File();
newFile.attachData(buffer, {type: 'application/javascript'});
FileUploads.insert(newFile)
{% endhighlight %}

Now this will work :)

But we are not done yet !

How are we going to read the data back, if we are doing it at the client side ?

{% highlight javascript %}
var fs = FileUploads.findOne({_id: fileId});
$.ajax({
  url: fs.url(),
  type: "GET",
  dataType: "binary",
  processData: false,
  success: function(data){
    var reader = new FileReader();
    reader.onload = function (event) {
      // event.target.result contains your data .. TADA!
      // console.log(event.target.result)
    };
    reader.onerror = function (event) {
      console.error(event.target.error);
    };
    reader.readAsBinaryString(new Blob([ data ],
      { type: 'application/octet-stream' }));
  }
});
{% endhighlight %}

Any comments and feedback is most appreciated
