---
layout: post
title: Taking the new Go error values proposal for a spin
categories: [errors]
tags: [errors, stack trace, golang, go]
fullview: true
comments: true
---

__UPDATE July 1, 2019__: The proposal has changed since the blog post was written. Stack traces have been omitted. Now, only the `Unwrap`, `Is` and `As` functions are kept. Also the `%w` format verb can be used to wrap errors. More information [here](https://github.com/golang/go/issues/29934#issuecomment-489682919).

__Original article follows:__

There is a new error values [proposal](https://go.googlesource.com/proposal/+/master/design/29934-error-values.md#stack-frames) for the Go programming language which enhances the `errors` and `fmt` packages, adding ability to wrap errors and embed stack traces, amongst other changes. The changes are now available in the master branch and undergoing the [feedback process](https://blog.golang.org/go2-here-we-come).

I wanted to give it a spin and see how does it address some of the issues I've had while using errors. For posterity, I am using the master branch at `go version devel +e96c4ace9c Mon Mar 18 10:50:57 2019 +0530 linux/amd64`.

### Stack Traces

Adding context to an error is good. But it does not add any value to the message when I need to find where the error is coming from and fix it. It does not matter if the message is `error getting users: no rows found` or `no rows found`, if I don't know the line number of the error's origin. And in a big codebase, it is an extremely uphill task to map the error message to the error origin. All I can do is grep for the error message and pray that the same message is not used multiple times.

Naturally, I was ecstatic to see that errors can capture stack traces now. Let's look at an existing example which exemplifies the problem I mentioned above and then see how to add stack traces to the errors.

```go
package main

import (
	// ...
)

func main() {
	// getting the db handle is omitted for brevity
	err := insert(db)
	if err != nil {
		log.Printf("%+v\n", err)
	}
}

func insert(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	var id int
	err = tx.QueryRow(`INSERT INTO tablename (name) VALUES ($1) RETURNING id`, "agniva").Scan(&id)
	if err != nil {
		tx.Rollback()
		return err
	}

	_, err = tx.Exec(`INSERT INTOtablename (name) VALUES ($1)`, "ayan") // This will fail. But how do we know just from the error ?
	if err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}
```

The example is a bit contrived. But the idea here is that if any of the SQL queries fail, there is no way of knowing which one is it.

```
2019/03/20 12:18:40 pq: syntax error at or near "INTOtablename"
```

So we add some context to it -

```go
err = tx.QueryRow(`INSERT INTO tablename (name) VALUES ($1) RETURNING id`, "agniva").Scan(&id)
if err != nil {
	tx.Rollback()
	return fmt.Errorf("insert and return: %v", err)
}

_, err = tx.Exec(`INSERT INTOtablename (name) VALUES ($1)`, "ayan")
if err != nil {
	tx.Rollback()
	return fmt.Errorf("only insert: %v", err)
}
```

```
2019/03/20 12:19:38 only insert: pq: syntax error at or near "INTOtablename"
```

But that's still not enough. I will naturally forget in which file and in which function I wrote that query; leading me to grep for "only insert". I just want that line number :tired_face:

But all that's changing. With the new design, __function, file and line information are added to all errors returned by `errors.New` and `fmt.Errorf`. And this stack information is displayed when the error is printed by "%+v"__.

If the same code is executed using Go at tip:

```
2019/03/20 12:20:10 only insert:
    main.doDB
        /home/agniva/play/go/src/main.go:71
  - pq: syntax error at or near "INTOtablename"
```

But there are some catches here. Notice how we gave a `:` and then added a space before writing `%v`. That makes the returned error have the `FormatError` [method](https://go.googlesource.com/proposal/+/master/design/29934-error-values.md#formatting) which allows the error to be formatted cleanly. Also, the last argument _must_ be an error for this to happen. If we remove the `:`, then we just get:

```
2019/03/20 23:28:38 only insert pq: syntax error at or near "INTOtablename":
    main.doDB
        /home/agniva/play/go/src/main.go:72
```

which is just the error message with the stack trace.

This feels very magical and surprising. And unsurprisingly, there has been considerable debate on this at [https://github.com/golang/go/issues/29934](https://github.com/golang/go/issues/29934). In the words of [@rsc](https://github.com/rsc) [here](https://github.com/golang/go/issues/29934#issuecomment-459824434) -

> It's true that recognizing : %v is a bit magical.
This is a good point to raise.
If we were doing it from scratch, we would not do that.
But an explicit goal here is to make as many existing
programs automatically start working better, just like
we did in the monotonic time changes.
Sometimes that constrains us more than starting on a blank slate.
On balance we believe that the automatic update is a big win and worth the magic.


But now that I have the line numbers, I don't really need to add extra context. I can just write:

```go
err = tx.QueryRow(`INSERT INTO tablename (name) VALUES ($1) RETURNING id`, "agniva").Scan(&id)
if err != nil {
	tx.Rollback()
	return fmt.Errorf(": %v", err)
}

_, err = tx.Exec(`INSERT INTOtablename (name) VALUES ($1)`, "ayan")
if err != nil {
	tx.Rollback()
	return fmt.Errorf(": %v", err)
}
```

```
2019/03/20 13:08:15 main.doDB
        /home/agniva/play/go/src/main.go:71
  - pq: syntax error at or near "INTOtablename"
```

Personally, I feel this is pretty clumsy, and having to write ": %v" every time is quite cumbersome. I still think that adding a new function is cleaner and much more readable. If you read `errors.WithFrame(err)` instead of `fmt.Errorf(": %v", err)`, it is immediately clear what the code is trying to achieve.

With that said, the package does expose a [Frame](https://tip.golang.org/pkg/errors/#Frame) type which allows you to create your own errors with stack information. So it is quite easy to write a helper function which does the equivalent of `fmt.Errorf(": %v", err)`.

A crude implementation can be something like:

```go
func withFrame(err error) error {
	return errFrame{err, errors.Caller(1)}
}

type errFrame struct {
	err error
	f   errors.Frame
}

func (ef errFrame) Error() string {
	return ef.err.Error()
}

func (ef errFrame) FormatError(p errors.Printer) (next error) {
	ef.f.Format(p)
	return ef.err
}
```

And then just call `withFrame` instead of `fmt.Errorf(": %v", err)`:

```go
err = tx.QueryRow(`INSERT INTO tablename (name) VALUES ($1) RETURNING id`, "agniva").Scan(&id)
if err != nil {
	tx.Rollback()
	return withFrame(err)
}

_, err = tx.Exec(`INSERT INTOtablename (name) VALUES ($1)`, "ayan")
if err != nil {
	tx.Rollback()
	return withFrame(err)
}
```

This generates the same output as before.

### Wrapping Errors

Alright, it's great that we are finally able to capture stack traces. But there is more to the proposal than just that. We also have the ability now to embed an error inside another error without losing any of the type information of the original error.

For example, in our previous example, we used `fmt.Errorf(": %v", err)` to capture the line number. But now we have lost the information that `err` was of type `pq.Error` or it could even have been `sql.ErrNoRows` which the caller function could have checked and taken appropriate actions. To be able __to wrap the error, we need to use a new formatting verb `w`__. Here is what it looks like:

```go
err = tx.QueryRow(`INSERT INTO tablename (name) VALUES ($1) RETURNING id`, "agniva").Scan(&id)
if err != nil {
	tx.Rollback()
	return fmt.Errorf(": %w", err)
}

_, err = tx.Exec(`INSERT INTOtablename (name) VALUES ($1)`, "ayan")
if err != nil {
	tx.Rollback()
	return fmt.Errorf(": %w", err)
}
```

Now, the position information is captured as well as the original error is wrapped into the new error. This allows us to inspect the returned error and perform checks on it. The proposal gives us 2 functions to help with that- [errors.Is](https://tip.golang.org/pkg/errors/#Is) and [errors.As](https://tip.golang.org/pkg/errors/#As).

`func As(err error, target interface{}) bool`

> As finds the first error in err's chain that matches the type to which target points, and if so, sets the target to its value and returns true. An error matches a type if it is assignable to the target type, or if it has a method As(interface{}) bool such that As(target) returns true.

So in our case, to check whether `err` is of type `pq.Error`:

```go
func main() {
	// getting the db handle is omitted for brevity
	err := insert(db)
	if err != nil {
		log.Printf("%+v\n", err)
	}
	pqe := &pq.Error{}
	if errors.As(err, &pqe) {
		log.Println("Yep, a pq.Error")
	}
}
```

```
2019/03/20 14:28:33 main.doDB
        /home/agniva/play/go/src/main.go:72
  - pq: syntax error at or near "INTOtablename"
2019/03/20 14:28:33 Yep, a pq.Error
```

`func Is(err, target error) bool`

> Is reports whether any error in err's chain matches target.
> An error is considered to match a target if it is equal to that target or if it implements a method Is(error) bool such that Is(target) returns true.

Continuing with our previous example:

```go
func main() {
	// getting the db handle is omitted for brevity
	err := insert(db)
	if err != nil {
		log.Printf("%+v\n", err)
	}
	pqe := &pq.Error{}
	if errors.As(err, &pqe) {
		log.Println("Yep, a pq.Error")
	}
	if errors.Is(err, sql.ErrNoRows) {
		log.Println("Yep, a sql.ErrNoRows")
	}
}
```

```
2019/03/20 14:29:03 main.doDB
        /home/agniva/play/go/src/main.go:72
  - pq: syntax error at or near "INTOtablename"
2019/03/20 14:29:03 Yep, a pq.Error
```

`ErrNoRows` did not match, which is what we expect.

Custom error types can also be wrapped and checked in a similar manner. But __to be able to unwrap the error, the type needs to satisfy the [Wrapper](https://go.googlesource.com/proposal/+/master/design/29934-error-values.md#wrapping) interface, and have a `Unwrap` method which returns the inner error__. Let's say we want to return `ErrNoUser` if a `sql.ErrNoRows` is returned. We can do:

```go
type ErrNoUser struct {
	err error
}

func (e ErrNoUser) Error() string {
	return e.err.Error()
}

// Unwrap satisfies the Wrapper interface.
func (e ErrNoUser) Unwrap() error {
	return e.err
}

func main() {
	// getting the db handle is omitted for brevity
	err := getUser(db)
	if err != nil {
		log.Printf("%+v\n", err)
	}
	ff := ErrNoUser{}
	if errors.As(err, &ff) {
		log.Println("Yep, ErrNoUser")
	}
}

func getUser(db *sql.DB) error {
	var id int
	err := db.QueryRow(`SELECT id from tablename WHERE name=$1`, "notexist").Scan(&id)
	if err == sql.ErrNoRows {
		return fmt.Errorf(": %w", ErrNoUser{err: err})
	}
	return err
}
```

```
2019/03/21 10:56:16 main.getUser
        /home/agniva/play/go/src/main.go:100
  - sql: no rows in result set
2019/03/21 10:56:16 Yep, ErrNoUser
```

This is mostly my take on how to integrate the new changes into a codebase. But it is in no way an exhaustive tutorial on it. For a deeper look, please feel free to read the [proposal](https://go.googlesource.com/proposal/+/master/design/29934-error-values.md). There is also an [FAQ](https://github.com/golang/go/wiki/ErrorValueFAQ) which touches on some useful topics.

### TLDR

There is a new proposal which makes some changes to the `errors` and `fmt` packages. The highlights of which are:
- All errors returned by `errors.New` and `fmt.Errorf` now capture stack information.
- The stack can be printed by using `%+v` which is the "detail mode".
- For `fmt.Errorf`, if the last argument is an error and the format string ends with `: %s`, `: %v` or `: %w`, the returned error will have the `FormatError` method. In case of `%w`, the error will also be wrapped and have the `Unwrap` method.
- There are 2 new convenience functions `errors.Is` and `errors.As` which allow for error inspection.

As always, please feel free to point out any errors or suggestions in the comments. Thanks for reading !
