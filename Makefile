BINNAME = lush
ZIP = zip -9 -r
PLATFORMS = linux windows darwin

# These files survive distclean
DISTFILES = static templates bin LICENSE README.md lush.exe lush
BUILDS_386 = $(patsubst %, build-%-386, $(PLATFORMS))
BUILDS_AMD64 = $(patsubst %, build-%-amd64, $(PLATFORMS))
BUILDS = $(BUILDS_386) $(BUILDS_AMD64)
SHELL = /bin/bash

.PHONY: distclean usage $(BUILDS)

usage:
	@echo "Available commands:"
	@echo
	@echo "$(MAKE) build-windows-ARCH"
	@echo "$(MAKE) build-linux-ARCH"
	@echo "$(MAKE) build-darwin-ARCH"
	@echo
	@echo "Where ARCH is 386 or amd64"
	@echo
	@echo "Also, make sure go cross compilation toolkit is installed."
	@echo "See http://dave.cheney.net/2012/09/08/an-introduction-to-cross-compilation-with-go"
	@exit 1

$(BUILDS_386): build-%-386:
	source $$HOME/golang-crosscompile/crosscompile.bash && \
	go-$*-386 build -o lush$(if $(findstring windows,$*),.exe)

$(BUILDS_AMD64): build-%-amd64:
	source $$HOME/golang-crosscompile/crosscompile.bash && \
	go-$*-amd64 build -o lush$(if $(findstring windows,$*),.exe)

distclean:
	rm -rf $(filter-out . .. $(DISTFILES), $(wildcard *) $(wildcard .*))

# TODO: figure out GNU make eval rules

lush-%-windows-386:
	@# This is necessary for go to look for liblush in the same dir
	git archive --prefix $@/src/github.com/hraban/lush/ $* | tar x
	cp -n Makefile $@/src/github.com/hraban/lush/
	GOPATH=$$PWD/$@:$$GOPATH $(MAKE) -C $@/src/github.com/hraban/lush/ build-windows-386
	$(MAKE) -C $@/src/github.com/hraban/lush/ distclean
	@# Move all remaining files back to top level
	find $@/src/github.com/hraban/lush/ -mindepth 1 -maxdepth 1 -exec mv -t "$@" '{}' \+
	rm -rf $@/src
	@# TODO: GNU tools for windows

lush-%-darwin-amd64:
	@# This is necessary for go to look for liblush in the same dir
	git archive --prefix $@/src/github.com/hraban/lush/ $* | tar x
	cp -n Makefile $@/src/github.com/hraban/lush/
	GOPATH=$$PWD/$@:$$GOPATH $(MAKE) -C $@/src/github.com/hraban/lush/ build-darwin-amd64
	$(MAKE) -C $@/src/github.com/hraban/lush/ distclean
	@# Move all remaining files back to top level
	find $@/src/github.com/hraban/lush/ -mindepth 1 -maxdepth 1 -exec mv -t "$@" '{}' \+
	rm -rf $@/src

lush-%-linux-amd64:
	@# This is necessary for go to look for liblush in the same dir
	git archive --prefix $@/src/github.com/hraban/lush/ $* | tar x
	cp -n Makefile $@/src/github.com/hraban/lush/
	GOPATH=$$PWD/$@:$$GOPATH $(MAKE) -C $@/src/github.com/hraban/lush/ build-linux-amd64
	$(MAKE) -C $@/src/github.com/hraban/lush/ distclean
	@# Move all remaining files back to top level
	find $@/src/github.com/hraban/lush/ -mindepth 1 -maxdepth 1 -exec mv -t "$@" '{}' \+
	rm -rf $@/src

lush-%-linux-386:
	@# This is necessary for go to look for liblush in the same dir
	git archive --prefix $@/src/github.com/hraban/lush/ $* | tar x
	cp -n Makefile $@/src/github.com/hraban/lush/
	GOPATH=$$PWD/$@:$$GOPATH $(MAKE) -C $@/src/github.com/hraban/lush/ build-linux-386
	$(MAKE) -C $@/src/github.com/hraban/lush/ distclean
	@# Move all remaining files back to top level
	find $@/src/github.com/hraban/lush/ -mindepth 1 -maxdepth 1 -exec mv -t "$@" '{}' \+
	rm -rf $@/src

%.zip:
	@# Not as target because Make uses unlink to delete intermediate, not good with dirs
	$(MAKE) $*
	$(ZIP) $@ $*
	rm -rf $*
