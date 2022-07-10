---
layout: post
title: Performance cliffs with MySQL compound indexes
categories: [databases]
tags: [mysql, index]
fullview: true
comments: true
---

In this post, I'd like to take you through a curious case of a MySQL performance regression that happened due to changing an index from a single column to a two column index.

### Introduction


It always starts out the same way - someone complaining that a query is running very slowly on their system. This was no [different](https://forum.mattermost.com/t/slow-post-deletion-after-v6-migrations/12623). As the first step to debug any slow query, I asked the user to show the `EXPLAIN` output.

Before we analyze the output, let's look at the schema of the table and the indexes that it has:

```
CREATE TABLE `Posts` (
  `Id` varchar(26) NOT NULL,
  `CreateAt` bigint(20) DEFAULT NULL,
  `UpdateAt` bigint(20) DEFAULT NULL,
  `DeleteAt` bigint(20) DEFAULT NULL,
  `UserId` varchar(26) DEFAULT NULL,
  `ChannelId` varchar(26) DEFAULT NULL,
  `RootId` varchar(26) DEFAULT NULL,
  `Message` text,
  `Type` varchar(26) DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `idx_posts_update_at` (`UpdateAt`),
  KEY `idx_posts_create_at` (`CreateAt`),
  KEY `idx_posts_delete_at` (`DeleteAt`),
  KEY `idx_posts_channel_id_update_at` (`ChannelId`,`UpdateAt`),
  KEY `idx_posts_channel_id_delete_at_create_at` (`ChannelId`,`DeleteAt`,`CreateAt`),
  KEY `idx_posts_root_id_delete_at` (`RootId`,`DeleteAt`),
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 |
```

The above is a simplified representation of the actual `Posts` table, but it is sufficient for our purposes to understand the problem. It has some very basic columns like a random `Id` which serves as the primary key, and most of the other columns are self-explanatory.

Now let's take a look at the `EXPLAIN` output from the user:

```
mysql> explain UPDATE Posts SET DeleteAt = 1637998911684, UpdateAt = 1637998911684, Props = JSON_SET(Props, '$.deleteBy', 'buqskqrwmjnhfuqskqrwmjn4ca') Where Id = 'c3gazo74m3rkjps71qbtso6twc' OR RootId = 'c3gazo74m3rkjps71qbtso6twc';
+----+-------------+-------+------------+-------------+-------------------------------------+-------------------------------------+---------+------+------+----------+-------------------------------------------------------------------------------------+
| id | select_type | table | partitions | type        | possible_keys                       | key                                 | key_len | ref  | rows | filtered | Extra                                                                               |
+----+-------------+-------+------------+-------------+-------------------------------------+-------------------------------------+---------+------+------+----------+-------------------------------------------------------------------------------------+
|  1 | UPDATE      | Posts | NULL       | index_merge | PRIMARY,idx_posts_root_id_delete_at | idx_posts_root_id_delete_at,PRIMARY | 107,106 | NULL |    2 |   100.00 | Using sort_union(idx_posts_root_id_delete_at,PRIMARY); Using where; Using temporary |
+----+-------------+-------+------------+-------------+-------------------------------------+-------------------------------------+---------+------+------+----------+-------------------------------------------------------------------------------------+
1 row in set, 1 warning (0.00 sec)
```

I have been [scarred in the past](https://developers.mattermost.com/blog/mysql-index-merge/) by index_merge optimizations, so the moment I saw the word `index_merge`, alarm bells started to ring. But it would turn out that, this was a rather peculiar case.

Let's simplify the query further into its very essential bits:

```
UPDATE Posts
SET SomeCol = ?
Where Id = 'id' OR RootId = 'id';
```

That's all there is. We are setting the value of a column(or columns) depending on a match of either the `Id` or the `RootId` column. The query is doing an:

1. index_merge. (This is a merge of two index scans)
2. sort_union(idx_posts_root_id_delete_at,PRIMARY)  (It performs a union of the two scans and sorts the results)
3. temporary table sort. (The sorting is performed via temporary tables)

### Analysis

Given that this was a regression, we tried to look back at what changed. Originally there was just a one column index on `RootId`. Based on some performance tests, we expanded that index to cover `RootId` and `DeleteAt` as well. So theoretically speaking, any query using just the `RootId` column should be unaffected by this change. Unfortunately, this assumption turned out to be wrong.

This was what we were seeing in the original query:

```
mysql> EXPLAIN UPDATE Posts SET DeleteAt = 1637998911687 Where Id = 'q38uaydtpink5f4wkmcsn8h47o' OR RootId = 'q38uaydtpink5f4wkmcsn8h47o';
*************************** 1. row ***************************
           id: 1
  select_type: UPDATE
        table: Posts
   partitions: NULL
         type: index_merge <------
possible_keys: PRIMARY,idx_posts_root_id
          key: PRIMARY,idx_posts_root_id
      key_len: 106,107
          ref: NULL
         rows: 9
     filtered: 100.00
        Extra: Using union(PRIMARY,idx_posts_root_id); Using where <------
1 row in set, 1 warning (0.00 sec)


mysql> UPDATE Posts SET DeleteAt = 1637998911687, UpdateAt = 1637998911687, Props = JSON_SET(Props, '$.deleteBy', 'buqskqrwmjnhfuqskqrwmjn4ca') Where Id = 'q38uaydtpink5f4wkmcsn8h47o' OR RootId = 'q38uaydtpink5f4wkmcsn8h47o'\G
Query OK, 0 rows affected (0.01 sec) <------
```

We can see that the original query uses index_merge as well, but there is a difference. Instead of a `sort_union`, it does a `union` and there is no temporary sort. According the MySQL [documentation](https://dev.mysql.com/doc/refman/5.7/en/index-merge-optimization.html#index-merge-sort-union), `sort_union` is applied when the conditions to satisy `union` is there, but `union` cannot be applied. And additionally, in `sort_union` you would also need to sort the results, which was happening by a sort via temporary tables. This was essentially killing the query performance.

The question was - why was adding a compound index changing the query plan from `union` to `sort_union`? And even more importantly, how to fix it?

Our first task was to reproduce this in-house, and we could see it very clearly:

```
mysql> EXPLAIN UPDATE Posts SET DeleteAt = 1637998911687 Where Id = 'q38uaydtpink5f4wkmcsn8h47o' OR RootId = 'q38uaydtpink5f4wkmcsn8h47o'\G
*************************** 1. row ***************************
           id: 1
  select_type: UPDATE
        table: Posts
   partitions: NULL
         type: index_merge <------
possible_keys: PRIMARY,idx_posts_root_id_delete_at
          key: idx_posts_root_id_delete_at,PRIMARY
      key_len: 107,106
          ref: NULL
         rows: 9
     filtered: 100.00
        Extra: Using sort_union(idx_posts_root_id_delete_at,PRIMARY); Using where; Using temporary <------
1 row in set, 1 warning (0.00 sec)


mysql> UPDATE Posts SET DeleteAt = 1637998911687, UpdateAt = 1637998911687, Props = JSON_SET(Props, '$.deleteBy', 'buqskqrwmjnhfuqskqrwmjn4ca') Where Id = 'q38uaydtpink5f4wkmcsn8h47o' OR RootId = 'q38uaydtpink5f4wkmcsn8h47o'\G
Query OK, 9 rows affected (17.20 sec)
Rows matched: 10  Changed: 9  Warnings: 0 <------
```

With the repro out of the way, the first thing we tried was to use some very blunt instruments - forcing a specific index. That didn't work out well.

```
mysql> EXPLAIN UPDATE Posts FORCE INDEX(PRIMARY) SET DeleteAt = 1637998911687 Where Id = 'q38uaydtpink5f4wkmcsn8h47o' OR RootId = 'q38uaydtpink5f4wkmcsn8h47o'\G
*************************** 1. row ***************************
           id: 1
  select_type: UPDATE
        table: Posts
   partitions: NULL
         type: index <------
possible_keys: NULL
          key: PRIMARY
      key_len: 106
          ref: NULL
         rows: 11293819
     filtered: 100.00
        Extra: Using where
1 row in set, 1 warning (0.00 sec)


mysql> UPDATE Posts FORCE INDEX(PRIMARY) SET DeleteAt = 1637998911687, UpdateAt = 1637998911687, Props = JSON_SET(Props, '$.deleteBy', 'buqskqrwmjnhfuqskqrwmjn4ca') Where Id = 'q38uaydtpink5f4wkmcsn8h47o' OR Root
Query OK, 0 rows affected (17.10 sec) <------
```

No improvement. Query time is same at 17 seconds as earlier.

After some digging, we found a peculiar optimization called the ORDER BY [optimization](https://dev.mysql.com/doc/refman/5.7/en/order-by-optimization.html).

> In some cases, MySQL may use an index to satisfy an ORDER BY clause and avoid the extra sorting involved in performing a filesort operation.

And this turned out to be that case. Simply adding an `ORDER BY Id` to the `UPDATE` query did the trick.

```
mysql> EXPLAIN UPDATE Posts SET DeleteAt = 1637998911686 Where Id = 'q38uaydtpink5f4wkmcsn8h47o' OR RootId = 'q38uaydtpink5f4wkmcsn8h47o' ORDER BY Id\G
*************************** 1. row ***************************
           id: 1
  select_type: UPDATE
        table: Posts
   partitions: NULL
         type: index_merge <------
possible_keys: PRIMARY,idx_posts_root_id_delete_at
          key: idx_posts_root_id_delete_at,PRIMARY
      key_len: 107,106
          ref: NULL
         rows: 9
     filtered: 100.00
        Extra: Using sort_union(idx_posts_root_id_delete_at,PRIMARY); Using where; Using filesort <------
1 row in set, 1 warning (0.00 sec)


mysql> UPDATE Posts SET DeleteAt = 1637998911686, UpdateAt = 1637998911686, Props = JSON_SET(Props, '$.deleteBy', 'buqskqrwmjnhfuqskqrwmjn4ca') Where Id = 'q38uaydtpink5f4wkmcsn8h47o' OR RootId = 'q38uaydtpink5f4wkmcsn8h47o' ORDER BY Id;
Query OK, 9 rows affected (0.01 sec)
```

Compare this to the earlier output:

```
Using sort_union(idx_posts_root_id_delete_at,PRIMARY); Using where; Using temporary
```

versus

```
Using sort_union(idx_posts_root_id_delete_at,PRIMARY); Using where; Using filesort
```

Only a difference between filesort and temporary sort changes the query time from 17s to 0.01s. An important thing to note is that `filesort` doesn't always mean the sort happens on-disk. As outlined [here](https://dev.mysql.com/doc/refman/5.7/en/order-by-optimization.html#order-by-filesort):

> A filesort operation uses temporary disk files as necessary if the result set is too large to fit in memory. Some types of queries are particularly suited to completely in-memory filesort operations.

### Conclusion

There you have it. We made the [changes](https://github.com/mattermost/mattermost-server/pull/19191) and performance immediately went back to normal. To recap, here are the events that happened:

1. We had an index on a single column(col1). Original query did an index_merge union.
2. We expanded that index to (col1+col2).
3. The query plan changes to index_merge sort_union with temporary table sort.
4. The fix was to add an `ORDER BY` clause at the end to change it to filesort.

This still leaves the original question unanswered. Why is MySQL doing a `sort_union` instead of a `union`? I'd be very curious to hear if anyone has any thoughts on this.

Meanwhile, Postgres handles all of this perfectly.
