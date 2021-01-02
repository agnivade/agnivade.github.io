---
layout: post
title: Setting up gopls with Sublime Text
categories: [gopls]
tags: [sublimetext, gopls, golang, go]
fullview: true
comments: true
---

If you are a Sublime Text user, and looking to set up gopls integration with it, you have arrived at the right place. The primary documentation for gopls assumes you are using VSCode; and the rest are using GoLand, which leaves us Sublime Text users in a tight spot. This post attempts to fill that gap.

The official documentation [here](https://github.com/golang/tools/blob/master/gopls/doc/subl.md) just mentions how to install gopls, which is barely enough. But for the sake of completeness, I will go through the entire set of steps.

### Installation

1. Install `gopls` on your machine.
	- Go to any temp directory and run `go get golang.org/x/tools/gopls@latest`.
	- If you see the error `go: cannot use path@version syntax in GOPATH mode`, then run `GO111MODULE=on go get golang.org/x/tools/gopls@latest`
	- Check that the `gopls` binary got installed by running `which gopls`.
2. Open the Command Pallete (Shift+Ctrl+p). Select "Install Package"
3. Select "LSP".
4. Open the Command Pallete again.
5. Select "LSP: Enable Language Server Globally".
6. Select "gopls".

This completes the installation part, which is half the battle. Next up, we need to configure `gopls`.

### Configuration

1. Navigate to Preferences > Package Settings > LSP > Settings. In the User settings section, paste this:

	```json
	{
		"clients":
		{
			"gopls":
			{
				"command": ["/home/agniva/go/bin/gopls"],
				"enabled": true,
				"env": {
					"PATH": "/home/agniva/go/bin:/usr/local/go/bin"
				},
				"scopes":["source.go"],
				"syntaxes": [
					"Packages/Go/Go.sublime-syntax",
				],
				"settings": {
					"gopls.usePlaceholders": true,
					"gopls.completeUnimported": true,
				},
				"languageId": "go"
			}
		},
		"only_show_lsp_completions": true,
		"show_references_in_quick_panel": true,
		"log_debug": true,
		"log_stderr": true
	}
	```
	Adjust the file paths accordingly.

2. There are several things to note here. Depending on your shell settings, you may need to pass the full file path. Otherwise, you might see the error "Could not start gopls. I/O timeout."

3. Any custom settings need to be placed under the `settings` key. And the key names need to be prefixed with "gopls.". For the full list of settings, check [here](https://github.com/golang/tools/blob/master/gopls/doc/settings.md).

4. Navigate to Preferences > Package Settings > LSP > Key Bindings. You will see that a lot of commands have keymap as "UNBOUND". Set them as per your old shortcuts.

5. Open the Command Pallete. Select "LSP: Restart Servers".

6. Enjoy a working setup of gopls.


Hopefully this was helpful. As always, please feel free to suggest any improvements in the comments.
