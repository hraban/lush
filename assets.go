package main

import (
	"go/build"
	"os"

	"github.com/kardianos/osext"
)

// Static file asset directories (paths). Lush needs static asset files, which
// can be found in two places: either in the directory of the executable itself,
// or in the directory
type assets struct {
	Web string
	Bin string
}

// name of this Go package (used to find the static resource files)
const basePkg = "github.com/hraban/lush"

// findExecDirAssets looks for asset files in the directory of this executable.
// This is what you would expect when running the lush server directly from a
// build directory. If found, the second return value is true.
func findExecDirAssets() (assets, bool) {
	root, err := osext.ExecutableFolder()
	if err == nil {
		// If the directory of this executable contains a directory called
		// "web", assume that's where the lush client assets live.
		web := root + "/web"
		if _, err = os.Stat(web); err == nil {
			return assets{Web: web, Bin: root + "/bin"}, true
		}
	}
	return assets{}, false
}

// findPackageDirAssets looks for assets in the Go package directory. Expects to
// find the assets in the place they'd be built when following build
// instructions from the README (i.e. /client/static).
func findPackageDirAssets() (assets, bool) {
	p, err := build.Default.Import(basePkg, "", build.FindOnly)
	if err != nil {
		return assets{}, false
	}
	web := p.Dir + "/client/static"
	if _, err = os.Stat(web); err == nil {
		return assets{Web: web, Bin: p.Dir + "/bin"}, true
	}
	return assets{}, false
}

func findAssets() assets {
	if a, ok := findExecDirAssets(); ok {
		return a
	}
	if a, ok := findPackageDirAssets(); ok {
		return a
	}
	panic("Couldn't find lush resource files")
}

var _assetsCache *assets

// lush asset directories. initializing the variable in the getter removes all
// doubt about the order of init() functions; call getAssets(), no matter where,
// and you're sure to either panic() or get a valid asset directory.
//
// The first call is not thread-safe.
func getAssets() assets {
	if _assetsCache == nil {
		a := findAssets()
		_assetsCache = &a
	}
	return *_assetsCache
}
