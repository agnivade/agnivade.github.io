---
layout: post
title: How to write a Vet analyzer pass
categories: [vet]
tags: [analysis, vet, golang, go]
fullview: true
comments: true
---

The Go toolchain has the `vet` command which can be used to to perform static checks on a codebase. But a significant problem of `vet` was that it was not extensible. `vet` was structured as a monolithic executable with a fixed suite of checkers. To overcome this, the ecosystem started developing its own tools like [staticcheck](https://github.com/dominikh/go-tools) and [go-critic](https://github.com/go-critic/go-critic). The problem with this is that every tool has its own way to load and parse the source code. Hence, a checker written for one tool would require extensive effort to be able to run on a different driver.

With the 1.12 release, Go has a new API for static code analysis- the `golang.org/x/tools/go/analysis` package. This creates a standard API for writing Go static analyzers, which allows them to be easily shared with the rest of the ecosystem in a plug-and-play model.

In this post, we will see how to go about writing an analyzer using this new API.

### Background

SQL queries are always evaluated at runtime. As a result, if you make a syntax error in a SQL query, there is no way to catch that until you run the code or write a test for it. There was this peculiar pattern in particular, that was always tripping me up.

Let's say I have a SQL query like:

`db.Exec("insert into table (c1, c2, c3, c4) values ($1, $2, $3, $4)", p1, p2, p3, p4)`

It's the middle of the night and I need to add a new column. I quickly change the query to:

`db.Exec("insert into table (c1, c2, c3, c4, c5) values ($1, $2, $3, $4)", p1, p2, p3, p4, p5)`.

It seems like things are fine, but I have just missed a `$5`. This bugged me so much that I wanted to write a vet analyzer for this to detect patterns like these and flag them.

There are other semantic checks we can apply like matching the no. of positional args with the no. of params passed and so on. But we will just focus on the most basic check of verifying whether a sql query is syntactically correct or not.

### Layout of an analyzer

All analyzers usually expose a global variable `Analyzer` of type `analysis.Analyzer`. It is this variable which is imported by driver packages.

Let us see what it looks like -

```go
var Analyzer = &analysis.Analyzer{
	Name:             "sqlargs",                                 // name of the analyzer
	Doc:              "check sql query strings for correctness", // documentation
	Run:              run,                                       // perform your analysis here
	Requires:         []*analysis.Analyzer{inspect.Analyzer},    // a set of analyzers which must run before the current one.
	RunDespiteErrors: true,
}
```

Most of the fields are self-explanatory. The actual analysis is performed by `run`: a function which takes an `analysis.Pass` as an argument. The `pass` variable provides information to the `run` function to perform its tasks and optionally pass on information to other analyzers.

It looks like -

```go
func run(pass *analysis.Pass) (interface{}, error) {
}
```

Now, to run this analyzer, we will use the `singlechecker` package which can be used to run a single analyzer.

```go
package main

import (
	"github.com/agnivade/sqlargs"
	"golang.org/x/tools/go/analysis/singlechecker"
)

func main() { singlechecker.Main(sqlargs.Analyzer) }
```

Upon successfully compiling this, you can execute the binary as a standalone tool on your codebase - `sqlargs ./...`.

This is the standard layout of all analyzers. Let us have a look into the internals of the `run` function, which is where the main code analysis is performed.

### Look for SQL queries

Our primary aim is to look for expressions like `db.Exec("<query>")` in the code base and analyze them. This requires knowledge of Go ASTs (Abstract Syntax Tree) to slice and dice the source code and extract the stuff that we need.

To help us with scavenging the codebase and filtering the AST expressions that we need, we have some tools at our disposal, viz. the `go/ast/inspector` package. This package does all the heavy lifting of loading and parsing the source code and just passes on the specified `node` types that we want. Since this is a very common task for all analyzers, we have an `inspect` pass which returns an analyzer that provides an `inspector`.

Let us see how that looks like -

```go
func run(pass *analysis.Pass) (interface{}, error) {
	inspect := pass.ResultOf[inspect.Analyzer].(*inspector.Inspector)
	// We filter only function calls.
	nodeFilter := []ast.Node{
		(*ast.CallExpr)(nil),
	}

	inspect.Preorder(nodeFilter, func(n ast.Node) {
		call := n.(*ast.CallExpr)
		_ = call // work with the call expression that we have
	})
}
```

All expressions of the form of `db.Exec("<query>")` are called [CallExpr](https://godoc.org/go/ast#CallExpr)s. So we specify that in our `nodeFilter`. After that, the `Preorder` function will give us only `CallExpr`s found in the codebase.

A [CallExpr](https://godoc.org/go/ast#CallExpr) has two parts- Fun and Args. A Fun can either be an [Ident](https://godoc.org/go/ast#Ident) (for eg. `Fun()`) or a [SelectorExpr](https://godoc.org/go/ast#SelectorExpr) (for eg. `foo.Fun()`). Since we are looking for patterns like `db.Exec`, we need to filter only `SelectorExpr`s.

```go
inspect.Preorder(nodeFilter, func(n ast.Node) {
	call := n.(*ast.CallExpr)
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return
	}

})
```

Alright, so far so good. This means we have filtered all expressions of the form of `type.Method()` from the source code. Now we need to verify 2 things -
1. The function name is `Exec`; because that is what we are interested in.
2. The type of the selector is `sql.DB`.

Let us peek into the [SelectorExpr](https://godoc.org/go/ast#SelectorExpr) to get these. A `SelectorExpr` again has two parts- `X` and `Sel`. If we take an example of `db.Exec()`- then `db` is `X`, and `Exec` is `Sel`. Matching the function name is easy. But to get the type info, we need to take help of `analysis.Pass` passed in the `run` function.

[Pass](https://godoc.org/golang.org/x/tools/go/analysis#Pass) contains a `TypesInfo` field which contain type information about the package. We need to use that to get the type of `X` and verify that the object comes from the `database/sql` package and is of type `*sql.DB`.

```go
inspect.Preorder(nodeFilter, func(n ast.Node) {
	call := n.(*ast.CallExpr)
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return
	}

	// Get the type of X
	typ, ok := pass.TypesInfo.Types[sel.X]
	if !ok {
		return
	}

	var nTyp *types.Named
	switch t := typ.Type.(type) {
	case *types.Pointer:
		// If it is a pointer, get the element
		nTyp = t.Elem().(*types.Named)
	case *types.Named:
		nTyp = t
	}

	if nTyp == nil {
		return
	}
})
```

Now, from `nTyp` we can get the type info of `X` and directly match the function name from `Sel`.

```go
// Get the function name
sel.Sel.Name // == Exec

// Get the object name
nTyp.Obj().Name() // == DB

// Check the import of the object
nTyp.Obj().Pkg().Path() // == database/sql
```

### Extract the query string

Alright ! We have successfully filtered out only expressions of type `(*sql.DB).Exec`. The only thing remaining is to extract the query string from the `CallExpr` and check it for syntax errors.

So far, we have been dealing with the `Fun` field of a `CallExpr`. To get the query string, we need to access `Args`. A `db.Exec` call will have the query string as its first param and the arguments follow after. We will get the first element of the `Args` slice and then use `TypesInfo.Types` again to get the value of the argument.

```go
// Code continues from before.

arg0 := call.Args[0]
typ, ok := pass.TypesInfo.Types[arg0]
if !ok || typ.Value == nil {
	return
}

_ = constant.StringVal(typ.Value) // Gives us the query string ! (constant is from "go/constant")
```

Note that this doesn't work if the query string is a variable. A lot of codebases have a query template string and generate the final query string dynamically. So for eg.

```go
q := `SELECT %s FROM certificates WHERE date=$1;`
query := fmt.Sprintf(q, table)
db.Exec(query, date)
```

will not work.

All that is left is for us to check the query string for syntax errors. We will use the `github.com/lfittl/pg_query_go` package for that. And if we get an error, `pass` has a `Reportf` helper method to print out diagnostics found during a vet pass. So -

```go
query := constant.StringVal(typ.Value)
_, err := pg_query.Parse(query)
if err != nil {
	pass.Reportf(call.Lparen, "Invalid query: %v", err)
	return
}
```

The final result looks like this:

<details>

<pre>
func run(pass *analysis.Pass) (interface{}, error) {
	inspect := pass.ResultOf[inspect.Analyzer].(*inspector.Inspector)
	// We filter only function calls.
	nodeFilter := []ast.Node{
		(*ast.CallExpr)(nil),
	}

	inspect.Preorder(nodeFilter, func(n ast.Node) {
		call := n.(*ast.CallExpr)
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return
		}

		// Get the type of X
		typ, ok := pass.TypesInfo.Types[sel.X]
		if !ok {
			return
		}

		var nTyp *types.Named
		switch t := typ.Type.(type) {
		case *types.Pointer:
			// If it is a pointer, get the element
			nTyp = t.Elem().(*types.Named)
		case *types.Named:
			nTyp = t
		}

		if nTyp == nil {
			return
		}

		if sel.Sel.Name != "Exec" &&
			nTyp.Obj().Name() != "DB" &&
			nTyp.Obj().Pkg().Path() != "database/sql" {
			return
		}

		arg0 := call.Args[0]
		typ, ok = pass.TypesInfo.Types[arg0]
		if !ok || typ.Value == nil {
			return
		}

		query := constant.StringVal(typ.Value)
		_, err := pg_query.Parse(query)
		if err != nil {
			pass.Reportf(call.Lparen, "Invalid query: %v", err)
			return
		}
	})
}
</pre>
</details>

### Tests

The `golang.org/x/tools/go/analysis/analysistest` package provides several helpers to make testing of vet passes a breeze. We just need to have our sample code that we want to test in a package. That package should reside inside the `testdata` folder which acts as the GOPATH for the test.

Let's say we have a file `basic.go` which contains `db.Exec` function calls that we want to test. So the folder structure needed is -

```
testdata
    └── src
        └── basic
            └── basic.go

```

To verify expected diagnostics, we just need to add comments of the form `// want ".."` beside the line which is expected to throw the error. So for eg, this is what the file `basic.go` might look like-

```go
func runDB() {
	var db *sql.DB
	defer db.Close()

	db.Exec(`INSERT INTO t (c1, c2) VALUES ($1, $2)`, p1, "const") // no error
	db.Exec(`INSERT INTO t(c1 c2) VALUES ($1, $2)`, p1, p2) // want `Invalid query: syntax error at or near "c2"`
}
```

And finally to run the test, we import the `analysistest` package and pass our analyzer, pointing to the package that we want to test.

```go
import (
	"testing"

	"github.com/agnivade/sqlargs"
	"golang.org/x/tools/go/analysis/analysistest"
)

func TestBasic(t *testing.T) {
	testdata := analysistest.TestData()
	analysistest.Run(t, testdata, sqlargs.Analyzer, "basic") // loads testdata/src/basic
}
```

### That's it !

To quickly recap-

1. We saw the basic layout of all analyzers.
2. We used the inspect pass to filter the AST nodes that we want.
3. Once we got our node, we used the `pass.TypesInfo.Type` map to give us type information about an object.
4. We used that to verify that the received object comes from the `database/sql` package and is of type `*sql.DB`.
5. Then we extracted the first argument from the `CallExpr` and checked whether the string is a valid SQL query or not.

This was a short demo of how to go about writing a vet analyzer. Of course, sql strings do not need to appear in `Exec` functions, nor does the type need to be `*sql.DB`. But I have kept things simple for the sake of the article. The full source code is available [here](https://github.com/agnivade/sqlargs). Please feel free to download and run `sqlargs` on your codebase. If you find a mistake in the article, please feel free to point it out in the comments !

