---
layout: post
title: Go faster with gogoproto
categories: [go]
tags: [go, golang, protobuf, protocol buffers]
fullview: true
comments: true
---

If you are using protocol buffers with Go and have reached a point where the serialization / deserialization has become a bottleneck in your application, fret not, you can still go faster with [gogoprotobuf](https://github.com/gogo/protobuf/).

I wasn't aware (until now !) of any such libraries which had perfect interoperability with the protocol buffer format, and still gave much better speed than using the usual protobuf Marshaler. I was so impressed after using the library that I had to blog about it.

The context of this began when some code of mine that used normal protobuf serialization started to show bottlenecks. The primary reason being the code was running on a raspberry pi with a single CPU. And the overall throughput that was desired was much lower than expected.

Now I knew about [capn'proto](https://capnproto.org/) and [flatbuffers](https://google.github.io/flatbuffers). I was considering what would be the best approach to take when I came across this [benchmark](https://github.com/alecthomas/go_serialization_benchmarks) and heard about [gogoprotobuf](https://github.com/gogo/protobuf/).

The concept of gogoproto was simple and appealing. They use custom extensions in the proto declaration which lead to better code generation tailor made for Go. Especially if you let go of some protocol buffer contracts like [nullable](https://godoc.org/github.com/gogo/protobuf/gogoproto), you can generate even faster code. In my case, all the fields of my message were required fields. So it seemed like something I could take advantage of.

My .proto declaration changed from

```protobuf
syntax = "proto3";
package mypackage;

// This is the message sent to the cloud server
message ClientMessage {
	string field1 = 1;
	string field2 = 2;
	int64 timestamp = 3;
}
```

to this

```protobuf
syntax = "proto2";
package mypackage;


import "github.com/gogo/protobuf/gogoproto/gogo.proto";

option (gogoproto.gostring_all) = true;
option (gogoproto.goproto_stringer_all) = false;
option (gogoproto.stringer_all) =  true;
option (gogoproto.marshaler_all) = true;
option (gogoproto.sizer_all) = true;
option (gogoproto.unmarshaler_all) = true;

// For tests
option (gogoproto.testgen_all) = true;
option (gogoproto.equal_all) = true;
option (gogoproto.populate_all) = true;

// This is the message sent to the cloud server
message ClientMessage {
	required string field1 = 1 [(gogoproto.nullable) = false];
	required string field2 = 2 [(gogoproto.nullable) = false];
	required int64 timestamp = 3 [(gogoproto.nullable) = false];
}
```

Yes, using gogoproto, you cannot use protocol buffer 3 because it does not support extensions. There is an active [issue](https://github.com/gogo/protobuf/issues/324) open which discusses this in further detail.

To generate the .pb.go file is not immediately straightforward. You have to set the proper proto_path, which took me some time to figure out.

`protoc -I=. -I=$GOPATH/src -I=$GOPATH/src/github.com/gogo/protobuf/protobuf --gogofaster_out=. message.proto`

Opened a PR [here](https://github.com/gogo/protobuf/pull/355) to clarify it.

Alright, time for some actual benchmarks and see if I get my money's worth.

```go
func BenchmarkProto(b *testing.B) {
	msg := "randomstring"
	now := time.Now().UTC().UnixNano()
	msg2 := "anotherstring"
	// wrap the msg in protobuf
	protoMsg := &ClientMessage{
		field1:    msg,
		field2:    msg2,
		timestamp: now,
	}

	for n := 0; n < b.N; n++ {
		_, err := proto.Marshal(protoMsg)
		if err != nil {
			b.Error(err)
		}
	}
}
```

Improvements seen across the board
```
name     old time/op    new time/op    delta
Proto-4     463ns ± 2%     101ns ± 1%  -78.09%  (p=0.008 n=5+5)

name     old alloc/op   new alloc/op   delta
Proto-4      264B ± 0%       32B ± 0%  -87.88%  (p=0.008 n=5+5)

name     old allocs/op  new allocs/op  delta
Proto-4      4.00 ± 0%      1.00 ± 0%  -75.00%  (p=0.008 n=5+5)
```

Lesser memory, more speed. Greater happiness. :smile: