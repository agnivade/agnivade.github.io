---
layout: post
title: Quick guide to JSON operators and functions in Postgres
categories: [postgres]
tags: [json, postgres]
fullview: true
comments: true
---

Postgres introduced JSON support in 9.2. And with 9.4, it released JSONB which even improved querying and indexing json fields a notch. In this post, I would like to give a quick tour of some of the most common json operators and functions which I have encountered. And some gotchas which tripped me up. I have tested them on 9.6. If you have an earlier version, please refer the documentation for any changes.

### Querying json fields

Let's start off with getting data from json keys. There are 2 operators for doing this: `->` and `->>`. The difference is very subtle and something which had tripped me up when I started writing postgres queries with json.

`->` returns the value of a field as another json object. Whereas `->>` returns the value of a field as text.

Let's understand that with an example. Suppose you have a json object like `{"a": "hobbit", "b": "elf"}`.

To get the value of "a", you can do:

```
test=> select '{"a": "hobbit", "b": "elf"}'::jsonb->'a';
 ?column?
----------
 "hobbit"
(1 row)
```

But, if you use the `->>` operator, then:

```
test=> select '{"a": "hobbit", "b": "elf"}'::jsonb->>'a';
 ?column?
----------
 hobbit
(1 row)
```

Notice, the `""` in the previous case. `->` thinks that the return value is an object, hence quotes the result. Its usefulness becomes apparent when you have a nested json object.

```
test=> select '{"a": {"internal": 45}, "b": "elf"}'::jsonb->>'a'->>'internal';
ERROR:  operator does not exist: text ->> unknown
LINE 1: ...'{"a": {"internal": 45}, "b": "elf"}'::jsonb->>'a'->>'intern...
                                                             ^
HINT:  No operator matches the given name and argument type(s). You might need to add explicit type casts.


test=> select '{"a": {"internal": 45}, "b": "elf"}'::jsonb->'a'->>'internal';
 ?column?
----------
 45
(1 row)
```

Here, the difference is clear. If you use the `->>` operator and try to access the fields from it's result, it doesn't work. You need to use the `->` operator for that. Bottom line is - If you want to get the value from a json field, use `->>`, but if you need to access nested fields, use `->`.

**Key exist operator**

You can also check whether a json field exists or not. Use the `?` operator for that.

```
test=> select '{"a": "hobbit"}'::jsonb?'hello';
 ?column?
----------
 f
(1 row)

test=> select '{"a": "hobbit"}'::jsonb?'a';
 ?column?
----------
 t
(1 row)

```

### Delete a key

To delete a json field, use the `-` operator.

```
test=> select '{"a": "hobbit", "b": "elf"}'::jsonb-'a';
   ?column?
--------------
 {"b": "elf"}
(1 row)
```

### Update a key

To update a json field, you need to use the `jsonb_set` function.

Let's say you have a table like this:
```
CREATE TABLE IF NOT EXISTS users (
	id serial PRIMARY KEY,
	full_name text NOT NULL,
	metadata jsonb
);
```

To update a field in the metadata column, you can do:

`UPDATE USERS SET metadata=jsonb_set(metadata, '{category}', '"hobbit"') where id=1;`

If the field does not exist, it will be created by default. You can also choose to disable that behavior by passing an additional flag.

`UPDATE USERS SET metadata=jsonb_set(metadata, '{category}', '"hobbit"', false) where id=1;`

There is a catch here. Note that we have set the metadata field to be nullable. What if you try to set a field when the value is NULL ? It fails silently !

```
test=> select metadata from users where id=1;
 metadata
----------

(1 row)

test=> update users set metadata=jsonb_set(metadata, '{category}', '""') where id=1;
UPDATE 1

test=> select metadata from users where id=1;
 metadata
----------

(1 row)
```


Either set the field to `NOT NULL`. Or if that is not possible, use the `coalesce` function.


```
test=> update non_sensitive.users set metadata=jsonb_set(coalesce(metadata, '{}'), '{category}', '""') where id=1;
UPDATE 1
test=> select metadata from non_sensitive.users where id=1;
     metadata
------------------
 {"category": ""}
(1 row)
```

This covers the most common use-cases of json queries that I have encountered. If you spot a mistake or if there is something else you feel need to be added, please feel free to point it out !
