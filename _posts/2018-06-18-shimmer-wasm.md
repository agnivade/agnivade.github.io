---
layout: post
title: Experiments with image manipulation in WASM using Go
categories: [wasm]
tags: [webassembly, wasm, golang, go]
fullview: true
comments: true
---

The Go master branch recently finished a working prototype implementation of WebAssembly. And being a WASM enthusiast, I naturally wanted to take it out for a spin.

In this post, I will be writing down my thoughts on a weekend experiment I did with manipulating images in Go. The demo just takes an input image from the browser, and applies various image transformations like brightness, contrast, hue, saturation etc. and then dumps it back to the browser. This tests 2 things - plain CPU bound execution which is what the image transformation should be doing, and moving data to and fro between JS and Go land.

### Callbacks

It should be clarified how to communicate with Go from JS land. It is not the usual way we do in emscripten; which is to expose a function and call that function from JS. In Go, interop with JS is done through callbacks. In your Go code, you set up callbacks which can be invoked from JS. These are mainly event handlers to which you want your Go code to be executed against.

It looks something like this -

```go
js.NewEventCallback(js.PreventDefault, func(ev js.Value) {
	// handle event
})
```

There is a pattern here - as your application grows, it becomes a list callback handlers to DOM events. I look at it like url handlers of a REST app.

To arrange it, I declare all of my callbacks as methods of my main struct and attach them in a single place. Kind of similar to how you will declare the url handlers in different files and setup all of your routes in a single place.

```go
// Setup callbacks
s.setupOnImgLoadCb()
js.Global.Get("document").
	Call("getElementById", "sourceImg").
	Call("addEventListener", "load", s.onImgLoadCb)

s.setupBrightnessCb()
js.Global.Get("document").
	Call("getElementById", "brightness").
	Call("addEventListener", "change", s.brightnessCb)

s.setupContrastCb()
js.Global.Get("document").
	Call("getElementById", "contrast").
	Call("addEventListener", "change", s.contrastCb)
```

And then in a separate file, write your callback code -

```go
func (s *Shimmer) setupHueCb() {
	s.hueCb = js.NewEventCallback(js.PreventDefault, func(ev js.Value) {
		// quick return if no source image is yet uploaded
		if s.sourceImg == nil {
			return
		}
		delta := ev.Get("target").Get("value").Int()
		start := time.Now()
		res := adjust.Hue(s.sourceImg, delta)
		s.updateImage(res, start)
	})
}
```

### Implementation

My primary gripe is the way image data is being passed around from Go land to the browser land.

While uploading the image, I am setting the `src` attribute to the base64 encoded format of the entire image. That value goes to Go code, which then decodes it back to binary, applies the transformation and then encodes it back to base64 and sets the `src` attribute of the target image.

This makes the DOM incredibly heavy and requires passing a huge string from Go to JS. Possibly, if SharedArrayBuffer support lands in WASM, this might improve. I am also looking into setting pixels directly in a canvas and see if that gives any benefit. Even shaving off this base64 conversion should buy us some time. (Other ideas will be very appreciated :grin:)

### Performance

For a JPEG image of size 100KB, the time it takes for it to apply the transformation is around 180-190ms. The time increases with the size of the image. This is using Chrome 65. (FF has been giving me some errors which I didnt have time to investigate into :sweat_smile:).

![timings]({{"/assets/wasm1.png" | relative_url}})

Performance snapshots show something similar.

![perf]({{"/assets/wasm2.png" | relative_url}})

The heap can be quite huge. A heap snapshot resulted in about 1GB size.

### Finishing thoughts

The complete repo is here - [github.com/agnivade/shimmer](https://github.com/agnivade/shimmer). Feel free to poke around it. Just a reminder that I wrote it in one day, so obviously there are things that can be improved. I will be looking into those next.

P.S. - Slight note that image transformations are not applied on top of another. i.e. if you change the brightness and then change hue, the resulting image will just change hue from the original base image. This is a TODO item for now.
