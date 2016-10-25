---
layout: post
title: How to smoothen contours in OpenCV
categories: [scipy]
tags: [scipy, opencv]
fullview: true
comments: true
---

**Disclaimer**: I am in no way an expert in statistics, so much of the details is beyond me. This is just an explanation of my attempt to solve the problem I had.

---
Recently, I was working with some cool stuff in image processing. I had to extract some shapes after binarizing some images. The final task was to smoothen the contours extracted from the shapes to give it a better feel.

After researching around a bit, the task was clear. All I had to do was resample the points in the contours at regular intervals and draw a spline through the control points. But opencv had no native function to do this. So I had to resort to numpy. Now, another problem in numpy was the data representation. Though opencv uses numpy internally, you have to jump through a couple of hoops to get everything running along smoothly.

Without wasting further time, here's the code -

**Get the contours from the binary image**-
{% highlight python %}
import cv2

ret,thresh_img = cv2.threshold(
			img,
			127,
			255,
			cv2.THRESH_BINARY_INV)
contours, hierarchy = cv2.findContours(thresh_img,
			cv2.RETR_TREE,
			cv2.CHAIN_APPROX_SIMPLE)
{% endhighlight %}

**Now comes the numpy code to smoothen each contour**-
{% highlight python %}
import numpy
import cv2
from scipy.interpolate import splprep, splev

smoothened = []
for contour in contours:
    x,y = contour.T
    # Convert from numpy arrays to normal arrays
    x = x.tolist()[0]
    y = y.tolist()[0]
    # https://docs.scipy.org/doc/scipy-0.14.0/reference/generated/scipy.interpolate.splprep.html
    tck, u = splprep([x,y], u=None, s=1.0, per=1)
    # https://docs.scipy.org/doc/numpy-1.10.1/reference/generated/numpy.linspace.html
    u_new = numpy.linspace(u.min(), u.max(), 25)
    # https://docs.scipy.org/doc/scipy-0.14.0/reference/generated/scipy.interpolate.splev.html
    x_new, y_new = splev(u_new, tck, der=0)
    # Convert it back to numpy format for opencv to be able to display it
    res_array = [[[int(i[0]), int(i[1])]] for i in zip(x_new,y_new)]
    smoothened.append(numpy.asarray(res_array, dtype=numpy.int32))

# Overlay the smoothed contours on the original image
cv2.drawContours(original_img, smoothened, -1, (255,255,255), 2)
{% endhighlight %}

P.S.: Credit has to be given to this SO [answer](http://stackoverflow.com/a/31466013/1027058) which served as the starting point.

As you can see, data conversion is required to pass to `splprep`. And then again, when you are appending to the list to overlay on the image.

Hope you found it useful. If you have a better way to achieve the same result, please do not hesitate to let me know in the comments !

