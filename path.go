// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"os"
	"strings"
)

func setPath(path []string) error {
	return os.Setenv("PATH", strings.Join(path, PATHSEP))
}

func getPath() []string {
	return strings.Split(os.Getenv("PATH"), PATHSEP)
}

// Create new PATH envvar value by adding dir to existing PATH
func appendPath(oldpath, dir string) string {
	if oldpath == "" {
		return dir
	}
	return oldpath + PATHSEP + dir
}
