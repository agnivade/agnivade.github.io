---
layout: post
title: Quick and Dirty intro to Debian packaging
categories: [debian]
tags: [debian, package]
fullview: true
comments: true
---

### Required background

I assume you have installed a debian package atleast once in your life. And you are reading this because you want to know how they are created or you want to actually create one.

### Back story

Over my career as a software engineer, there were several times I had to create a debian package. I always managed to avoid learning how to actually create it by sometimes using company internal tools and sometimes [fpm](https://github.com/jordansissel/fpm).

Recently, I had the opportunity to create a debian package to deploy a project for a client, and I decided to learn how debian packages were "actually" created - "the whole nine yards". Well, this is an account of that adventure. :)

As usual, I looked through the couple of blog posts on the internet. But most of them had the same "man page" look and feel. And I absolutely dread man pages. But without getting discouraged, I decided to plough through. I came across [this](http://tldp.org/HOWTO/html_single/Debian-Binary-Package-Building-HOWTO/) page which finally gave me some much needed clarity.

### Into the real stuff !

So, these are the things that I wanted to happen when I did `dpkg -i ` on my package -

1. Put the source files inside a "/opt/\<project-name\>/" folder.
2. Put an upstart script inside the "/etc/init/" folder.
3. Put a cron job in "/etc/cron.d/" folder.

The command that you use to build the debian package is
{% highlight bash %}$ dpkg-deb --build <folder-name>{% endhighlight %}

The contents of that folder is where the magic is.

Lets say that your folder is `package`. Inside `package` you need to have a folder `DEBIAN`. And then depending on the folder structure where you want your files to be, you have to create them accordingly. So in my case, I will have something like this -

{% highlight bash %}
$ tree -L 3 package/
package/
├── DEBIAN
│   ├── control
│   └── postinst
├── etc
│   ├── cron.d
│   │   └── cron-file
│   └── init
│       └── project_name.conf
└── opt
    └── <project-name>
        ├── main.js
        ├── folder1
        ├── node_modules
        ├── package.json
        ├── folder2
        └── helper.js
{% endhighlight %}

Consider the `package` folder to be the root(/). Don't worry about the contents of the `DEBIAN` folder, we'll come to that later.

After this, just run the command -
{% highlight bash %}$ dpkg-deb --build package{% endhighlight %}

Voila ! You have a debian package ready !

If you see any errors now, its probably related to the contents inside the `DEBIAN` folder. So, lets discuss it one by one.

* **control**

If you just want to build the debian and get it done with, you only need to have the control file. Its kind of a package descriptor file with some fields that you need to fill up. Each field begins with a tag, followed by a colon and then the body of the field. The compulsory fields are **Package**, **Version**, **Maintainer** and **Description**.

Here's how my control file looks -
{% highlight bash %}
Package: myPackage
Version: 1.0.0-1
Architecture: amd64
Depends: libcairo2-dev, libpango1.0-dev, libssl-dev, libjpeg62-dev, libgif-dev
Maintainer: Agniva De Sarker <agniva.quicksilver@gmail.com>
Description: Node js worker process to consume from the Meteor job queue
 The myPackage package consumes jobs submitted by users to the Meteor
 web application.
{% endhighlight %}

The **Depends** field helps you to specify the dependencies that your package might require to be pre-installed. **Architecture** is self-explanatory. (Small note on this - debian uses amd64 for 64 bit systems, not x86_64.)

For further info, see `man 5 deb-control`

* **preinst**

If you want to run some sanity checks before the installation begins, you can have a shell script here. Important thing to note is that the packager decides the execution of the installation of the package depending on the exit code of the scripts. So, you should write "set -e" at the top of your script. Don't forget to make it executable.

* **postinst**

This is executed after the package is installed. Same rules apply as before.
This is how my postinst looks -

{% highlight bash %}
#!/bin/bash
set -e

#Move the bootstrap file to proper location
mv /opt/myPackage/packaging/bootstrap.prod /opt/myPackage/.bootstraprc

#Clear the DEBIAN folder
rm -rf /opt/myPackage/packaging/DEBIAN
{% endhighlight %}

* **prerm**

Gets executed before removing the package.

* **postrm**

Gets executed after removing the package. You usually want to execute clean up tasks in this script.

### Taking a step further

As you can figure, this entire process can be easily automated and made a part of your build system. Just create the required parent folders and put the source code and config files at the right places. Also have the files of the `DEBIAN` folder stored somewhere in your repo, which you can copy to the target folder.

Since, I had a Node project, I mapped it to my `"scripts":{"build": "<command_to_run>"}` in `package.json` file. You can apply it similarly for projects in other programming languages too.

### TLDR

Just to recap quickly -

1. Create a folder you will use to build the package.
2. Put a `DEBIAN` folder inside it with the `control` file. Add more files depending on your need.
3. Put the other files that you want to be placed in the filesystem after installation considering the folder as the root.
4. Run `dpkg-deb --build <folder-name>`

Keep in mind, this is the bare minimum you need to create a debian package. Ideally, you would also want to add a copyright file, a changelog and a man page. There is a tool called [lintian](https://lintian.debian.org/) that you can use to follow the best practices around creating debian packages.

Hope this intro was helpful. As usual, comments and feedback are always appreciated !




